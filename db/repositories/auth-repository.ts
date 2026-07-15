import { and, count, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";

import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import { magicLinks, sessions, users } from "../schema";

export type AuthenticatedSession = {
  session: {
    id: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

export type MagicLinkCreateResult =
  | { created: true }
  | { created: false; retryAt: Date };

export type CreateMagicLinkInput = {
  email: string;
  tokenHash: string;
  requesterHash: string;
  createdAt: Date;
  expiresAt: Date;
  throttleWindowSeconds: number;
  abuseWindowSeconds: number;
  requesterAttemptLimit: number;
  globalAttemptLimit: number;
};

export type ConsumeMagicLinkInput = {
  magicLinkTokenHash: string;
  sessionTokenHash: string;
  now: Date;
  sessionExpiresAt: Date;
};

export interface AuthRepository {
  createMagicLink(input: CreateMagicLinkInput): Promise<MagicLinkCreateResult>;
  consumeMagicLinkAndCreateSession(
    input: ConsumeMagicLinkInput,
  ): Promise<AuthenticatedSession | null>;
  findSession(tokenHash: string, now: Date): Promise<AuthenticatedSession | null>;
  revokeSession(tokenHash: string): Promise<boolean>;
}

export function createAuthRepository(
  database: MewtualsDatabase = getDb(),
): AuthRepository {
  return {
    async createMagicLink(input) {
      return database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(197731, 1)`,
        );
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${input.requesterHash}))`,
        );
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${input.email}))`,
        );

        const abuseWindowStart = new Date(
          input.createdAt.getTime() - input.abuseWindowSeconds * 1_000,
        );
        const [latest] = await transaction
          .select({ createdAt: magicLinks.createdAt })
          .from(magicLinks)
          .where(
            and(
              eq(magicLinks.email, input.email),
              lte(magicLinks.createdAt, input.createdAt),
            ),
          )
          .orderBy(desc(magicLinks.createdAt))
          .limit(1);
        const retryAt = latest
          ? new Date(
              latest.createdAt.getTime() + input.throttleWindowSeconds * 1_000,
            )
          : undefined;

        const [requesterAttempts] = await transaction
          .select({ value: count() })
          .from(magicLinks)
          .where(
            and(
              eq(magicLinks.requesterHash, input.requesterHash),
              gt(magicLinks.createdAt, abuseWindowStart),
              lte(magicLinks.createdAt, input.createdAt),
            ),
          );
        const [globalAttempts] = await transaction
          .select({ value: count() })
          .from(magicLinks)
          .where(
            and(
              gt(magicLinks.createdAt, abuseWindowStart),
              lte(magicLinks.createdAt, input.createdAt),
            ),
          );

        const emailThrottled = Boolean(retryAt && retryAt > input.createdAt);
        const requesterThrottled =
          (requesterAttempts?.value ?? 0) >= input.requesterAttemptLimit;
        const globalThrottled =
          (globalAttempts?.value ?? 0) >= input.globalAttemptLimit;

        if (emailThrottled || requesterThrottled || globalThrottled) {
          await transaction.insert(magicLinks).values({
            email: input.email,
            tokenHash: input.tokenHash,
            requesterHash: input.requesterHash,
            issued: false,
            expiresAt: input.expiresAt,
            consumedAt: input.createdAt,
            createdAt: input.createdAt,
          });
          return {
            created: false,
            retryAt:
              retryAt ??
              new Date(
                input.createdAt.getTime() + input.abuseWindowSeconds * 1_000,
              ),
          };
        }

        await transaction
          .update(magicLinks)
          .set({ consumedAt: input.createdAt })
          .where(
            and(
              eq(magicLinks.email, input.email),
              isNull(magicLinks.consumedAt),
              gt(magicLinks.expiresAt, input.createdAt),
            ),
          );

        await transaction.insert(magicLinks).values({
          email: input.email,
          tokenHash: input.tokenHash,
          requesterHash: input.requesterHash,
          issued: true,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
        });

        return { created: true };
      });
    },

    async consumeMagicLinkAndCreateSession(input) {
      return database.transaction(async (transaction) => {
        const [link] = await transaction
          .update(magicLinks)
          .set({ consumedAt: input.now })
          .where(
            and(
              eq(magicLinks.tokenHash, input.magicLinkTokenHash),
              eq(magicLinks.issued, true),
              isNull(magicLinks.consumedAt),
              gt(magicLinks.expiresAt, input.now),
            ),
          )
          .returning({ email: magicLinks.email });

        if (!link) return null;

        const [user] = await transaction
          .insert(users)
          .values({
            email: link.email,
            updatedAt: input.now,
          })
          .onConflictDoUpdate({
            target: users.email,
            set: { updatedAt: input.now },
          })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
          });

        if (!user) {
          throw new Error("Failed to create the authenticated user.");
        }

        const [session] = await transaction
          .insert(sessions)
          .values({
            userId: user.id,
            tokenHash: input.sessionTokenHash,
            expiresAt: input.sessionExpiresAt,
            lastSeenAt: input.now,
            createdAt: input.now,
          })
          .returning({
            id: sessions.id,
            expiresAt: sessions.expiresAt,
          });

        if (!session) {
          throw new Error("Failed to create the authenticated session.");
        }

        return { session, user };
      });
    },

    async findSession(tokenHash, now) {
      const [record] = await database
        .select({
          sessionId: sessions.id,
          sessionExpiresAt: sessions.expiresAt,
          userId: users.id,
          userEmail: users.email,
          userName: users.name,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(
          and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
        )
        .limit(1);

      if (!record) return null;

      return {
        session: {
          id: record.sessionId,
          expiresAt: record.sessionExpiresAt,
        },
        user: {
          id: record.userId,
          email: record.userEmail,
          name: record.userName,
        },
      };
    },

    async revokeSession(tokenHash) {
      const revoked = await database
        .delete(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .returning({ id: sessions.id });
      return revoked.length > 0;
    },
  };
}
