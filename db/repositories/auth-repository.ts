import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

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
  createdAt: Date;
  expiresAt: Date;
  throttleWindowSeconds: number;
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
          sql`select pg_advisory_xact_lock(hashtext(${input.email}))`,
        );

        const [latest] = await transaction
          .select({ createdAt: magicLinks.createdAt })
          .from(magicLinks)
          .where(eq(magicLinks.email, input.email))
          .orderBy(desc(magicLinks.createdAt))
          .limit(1);
        const retryAt = latest
          ? new Date(
              latest.createdAt.getTime() + input.throttleWindowSeconds * 1_000,
            )
          : undefined;

        if (retryAt && retryAt > input.createdAt) {
          return { created: false, retryAt };
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
