import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as logoutRoute from "../app/api/auth/logout/route";
import * as verifyRoute from "../app/auth/verify/route";
import { createAuthService } from "../app/server/auth-service";
import {
  createAdvanceHandler,
  createSignalHandler,
} from "../app/server/dashboard-route";
import { createDashboardService } from "../app/server/dashboard-service";
import {
  createProtectedOnboardingHandler,
  resolveProtectedPage,
} from "../app/server/onboarding-route";
import { createOnboardingService } from "../app/server/onboarding-service";
import { hashToken } from "../app/server/tokens";
import { createDevelopmentApprovalHandler } from "../app/server/verification-route";
import { createVerificationService } from "../app/server/verification-service";
import { closeDb, getDb } from "../db/client";
import { createAuthRepository } from "../db/repositories/auth-repository";
import { createOnboardingRepository } from "../db/repositories/onboarding-repository";
import { createOpportunityRepository } from "../db/repositories/opportunity-repository";
import { createVerificationRepository } from "../db/repositories/verification-repository";
import {
  introductionRequests,
  magicLinks,
  opportunities,
  profileOpportunities,
  profiles,
  sessions,
  signals,
  users,
  verificationReviews,
} from "../db/schema";
import { opportunitySeedData } from "../db/seed-data";
import {
  acceptanceToken,
  requireLocalTestDatabaseUrl,
} from "./support/acceptance-environment";

requireLocalTestDatabaseUrl(process.env.DATABASE_URL);

process.env.SESSION_SECRET ??=
  "product-v1-acceptance-secret-that-is-longer-than-32-characters";

const database = getDb();
const testId = randomUUID();
const email = `product-v1-${testId}@example.test`;
const sessionSecret = process.env.SESSION_SECRET;
const firstMagicToken = acceptanceToken(testId, "first-magic");
const secondMagicToken = acceptanceToken(testId, "second-magic");
const secondSessionToken = acceptanceToken(testId, "second-session");
const requesterIdentity = `acceptance:${testId}`;

async function cleanAcceptanceMember() {
  await database.delete(magicLinks).where(eq(magicLinks.email, email));
  await database.delete(users).where(eq(users.email, email));
}

async function requireSeededCatalogue() {
  const startupSeed = opportunitySeedData.find(
    ({ direction }) => direction === "startup_distribution_partner",
  );
  if (!startupSeed) throw new Error("Startup distribution seed is required.");
  const [stored] = await database
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(eq(opportunities.key, startupSeed.key));
  if (!stored) {
    throw new Error(
      "The dedicated acceptance database is not seeded. Run npm run db:test:prepare.",
    );
  }
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost:4000${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:4000",
    },
    body: JSON.stringify(body),
  });
}

function sessionTokenFrom(response: Response) {
  const cookie = response.headers.get("set-cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)mewtuals_session=([^;]+)/);
  if (!match?.[1]) throw new Error("Magic-link confirmation did not set a session.");
  return decodeURIComponent(match[1]);
}

describe("Mewtuals product v1 acceptance", () => {
  beforeAll(async () => {
    await cleanAcceptanceMember();
    await requireSeededCatalogue();
  });

  afterAll(async () => {
    await cleanAcceptanceMember();
    await closeDb();
  });

  it("keeps the complete member journey durable without storing plaintext auth tokens", async () => {
    let currentTime = new Date();
    const authRepository = createAuthRepository(database);
    const requestAuth = createAuthService({
      repository: authRepository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "development",
      exposeDevelopmentVerifyUrl: true,
      now: () => currentTime,
      tokenFactory: () => firstMagicToken,
    });

    expect(resolveProtectedPage(null, "/dashboard", "/dashboard")).toEqual({
      redirectTo: "/login",
    });
    await expect(
      requestAuth.requestMagicLink({
        email,
        origin: "http://localhost:4000",
        requesterIdentity,
      }),
    ).resolves.toEqual({
      accepted: true,
      developmentVerifyUrl:
        `http://localhost:4000/auth/verify?token=${firstMagicToken}`,
    });

    const confirmation = await verifyRoute.GET(
      new Request(
        `http://localhost:4000/auth/verify?token=${firstMagicToken}`,
      ),
    );
    expect(confirmation.status).toBe(200);
    expect(await confirmation.text()).toContain("Continue to Mewtuals");
    const [unconsumedLink] = await database
      .select({ consumedAt: magicLinks.consumedAt })
      .from(magicLinks)
      .where(eq(magicLinks.email, email));
    expect(unconsumedLink?.consumedAt).toBeNull();

    const confirmed = await verifyRoute.POST(
      new Request("http://localhost:4000/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "http://localhost:4000",
        },
        body: new URLSearchParams({ token: firstMagicToken }),
      }),
    );
    expect(confirmed.status).toBe(303);
    expect(confirmed.headers.get("location")).toBe(
      "http://localhost:4000/onboarding/identity",
    );
    const firstSessionToken = sessionTokenFrom(confirmed);
    const sessionAuth = createAuthService({
      repository: authRepository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "test",
      exposeDevelopmentVerifyUrl: false,
    });
    const firstSession = await sessionAuth.getSession(firstSessionToken);
    expect(firstSession?.user.email).toBe(email);
    if (!firstSession) throw new Error("Confirmed member session was not stored.");

    const onboarding = createOnboardingService(
      createOnboardingRepository(database),
      () => new Date(currentTime.getTime() + 1_000),
    );
    expect(
      resolveProtectedPage(
        firstSession,
        "/dashboard",
        await onboarding.nextPath(firstSession.user.id),
      ),
    ).toEqual({ redirectTo: "/onboarding/identity" });

    const identity = createProtectedOnboardingHandler({
      getSession: async () => firstSession,
      action: (userId, body) => onboarding.saveIdentity(userId, body),
    });
    const identityResponse = await identity(
      jsonRequest("/api/onboarding/identity", {
        kind: "organisation",
        subtype: "startup",
      }),
    );
    expect(identityResponse.status).toBe(200);
    await expect(identityResponse.json()).resolves.toMatchObject({
      ok: true,
      nextPath: "/onboarding/source",
    });

    const source = createProtectedOnboardingHandler({
      getSession: async () => firstSession,
      action: (userId, body) => onboarding.saveSource(userId, body),
    });
    const sourceResponse = await source(
      jsonRequest("/api/onboarding/source", {
        kind: "organisation",
        websiteUrl: "https://mewtuals-acceptance.example",
        linkedInUrl: "",
      }),
    );
    expect(sourceResponse.status).toBe(200);
    await expect(sourceResponse.json()).resolves.toMatchObject({
      ok: true,
      value: {
        generatedName: "Mewtuals Acceptance",
        generatedDomain: "mewtuals-acceptance.example",
      },
      nextPath: "/onboarding/profile",
    });

    const profile = createProtectedOnboardingHandler({
      getSession: async () => firstSession,
      action: (userId, body) => onboarding.confirmProfile(userId, body),
    });
    const profileResponse = await profile(
      jsonRequest("/api/onboarding/profile", {
        name: "Mewtuals Acceptance Team",
        organisationName: "Mewtuals Acceptance",
        domain: "mewtuals-acceptance.example",
        confirmed: true,
      }),
    );
    expect(profileResponse.status).toBe(200);
    await expect(profileResponse.json()).resolves.toMatchObject({
      ok: true,
      value: { status: "draft" },
      nextPath: "/onboarding/verification",
    });

    const submitVerification = createProtectedOnboardingHandler({
      getSession: async () => firstSession,
      action: (userId) => onboarding.submitVerification(userId),
    });
    const submitted = await submitVerification(
      jsonRequest("/api/verification/submit", {}),
    );
    expect(submitted.status).toBe(200);
    await expect(submitted.json()).resolves.toMatchObject({
      ok: true,
      value: { status: "pending" },
      nextPath: "/dashboard",
    });

    const dashboardRepository = createOpportunityRepository(database);
    const dashboard = createDashboardService({
      repository: dashboardRepository,
    });
    await expect(dashboard.state(firstSession.user.id)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });

    const verification = createVerificationService({
      repository: createVerificationRepository(database),
      adminEmails: [],
      environment: "development",
      developmentAuthEnabled: true,
      now: () => new Date(currentTime.getTime() + 2_000),
    });
    const approve = createDevelopmentApprovalHandler({
      environment: "development",
      developmentAuthEnabled: true,
      getSession: async () => firstSession,
      approve: (actor) =>
        verification.approveOwnPendingForDevelopment(actor),
    });
    const approval = await approve(
      new Request("http://127.0.0.1:4000/api/dev/verification/approve", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:4000" },
      }),
    );
    expect(approval.status).toBe(200);
    await expect(approval.json()).resolves.toMatchObject({
      ok: true,
      profile: { status: "verified" },
      review: {
        decision: "verified",
        notes: "Local development approval",
      },
      nextPath: "/dashboard",
    });

    const signal = createSignalHandler({
      getSession: async () => firstSession,
      saveSignal: (userId, body) => dashboard.saveSignal(userId, body),
    });
    const signalResponse = await signal(
      jsonRequest("/api/signal", {
        availability: "open_now",
        openTo: ["distribution_partnerships"],
        notes: "Ready for a measurable distribution pilot.",
      }),
    );
    expect(signalResponse.status).toBe(200);
    const signalled = await signalResponse.json();
    expect(signalled).toMatchObject({
      ok: true,
      state: {
        signal: {
          availability: "open_now",
          openTo: ["distribution_partnerships"],
        },
      },
      nextPath: "/dashboard",
    });
    expect(signalled.state.assignments.length).toBeGreaterThanOrEqual(1);
    expect(signalled.state.assignments.length).toBeLessThanOrEqual(3);
    const selectedOpportunity = signalled.state.assignments.find(
      (candidate: { direction: string }) =>
        candidate.direction === "startup_distribution_partner",
    );
    expect(selectedOpportunity).toMatchObject({
      introduction: null,
      rank: expect.any(Number),
    });
    if (!selectedOpportunity) {
      throw new Error("A startup distribution pick was not assigned.");
    }
    const opportunityId = selectedOpportunity.id as string;

    const advance = createAdvanceHandler({
      getSession: async () => firstSession,
      advance: (userId, assignedOpportunityId, note) =>
        dashboard.advance(userId, assignedOpportunityId, note),
    });
    const advanceRequest = () =>
      jsonRequest(`/api/opportunities/${opportunityId}/advance`, {
        note: "Please review this relationship.",
      });
    const context = { params: Promise.resolve({ opportunityId }) };
    const firstAdvance = await advance(advanceRequest(), context);
    expect(firstAdvance.status).toBe(200);
    const firstAdvanceBody = await firstAdvance.json();
    expect(firstAdvanceBody).toMatchObject({
      ok: true,
      introduction: { state: "requested" },
      message: "Mewtuals is reviewing the relationship",
    });
    const repeatedAdvance = await advance(advanceRequest(), context);
    expect(repeatedAdvance.status).toBe(200);
    await expect(repeatedAdvance.json()).resolves.toMatchObject({
      introduction: { id: firstAdvanceBody.introduction.id },
    });

    const refreshedDashboard = createDashboardService({
      repository: createOpportunityRepository(database),
    });
    await expect(
      refreshedDashboard.state(firstSession.user.id),
    ).resolves.toMatchObject({
      ok: true,
      state: {
        assignments: [
          {
            id: opportunityId,
            introduction: {
              id: firstAdvanceBody.introduction.id,
              state: "requested",
            },
          },
        ],
      },
    });

    const logout = await logoutRoute.POST(
      new Request("http://localhost:4000/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: `mewtuals_session=${firstSessionToken}`,
          Origin: "http://localhost:4000",
        },
      }),
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(sessionAuth.getSession(firstSessionToken)).resolves.toBeNull();

    const signedOutSignal = createSignalHandler({
      getSession: async () => null,
      saveSignal: (userId, body) => dashboard.saveSignal(userId, body),
    });
    const signedOutResponse = await signedOutSignal(
      jsonRequest("/api/signal", {
        availability: "open_now",
        openTo: ["distribution_partnerships"],
      }),
    );
    expect(signedOutResponse.status).toBe(401);

    currentTime = new Date(currentTime.getTime() + 61_000);
    const reloginTokens = [secondMagicToken, secondSessionToken];
    const reloginAuth = createAuthService({
      repository: authRepository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "development",
      exposeDevelopmentVerifyUrl: true,
      now: () => currentTime,
      tokenFactory: () => reloginTokens.shift() ?? randomUUID(),
    });
    await reloginAuth.requestMagicLink({
      email,
      origin: "http://localhost:4000",
      requesterIdentity,
    });
    const secondSession = await reloginAuth.verifyMagicLink(secondMagicToken);
    expect(secondSession?.token).toBe(secondSessionToken);
    expect(secondSession?.user.id).toBe(firstSession.user.id);
    if (!secondSession) throw new Error("Second member session was not stored.");

    expect(
      resolveProtectedPage(
        secondSession,
        "/dashboard",
        await onboarding.nextPath(secondSession.user.id),
      ),
    ).toEqual({ userId: firstSession.user.id });
    await expect(
      refreshedDashboard.state(secondSession.user.id),
    ).resolves.toMatchObject({
      ok: true,
      state: {
        signal: { availability: "open_now" },
        assignments: [
          {
            id: opportunityId,
            introduction: { id: firstAdvanceBody.introduction.id },
          },
        ],
      },
    });

    const [storedProfile] = await database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, firstSession.user.id));
    expect(storedProfile).toMatchObject({
      name: "Mewtuals Acceptance Team",
      status: "verified",
    });
    expect(
      await database
        .select()
        .from(signals)
        .where(eq(signals.profileId, storedProfile!.id)),
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(verificationReviews)
        .where(eq(verificationReviews.profileId, storedProfile!.id)),
    ).toHaveLength(1);
    const storedIntroductions = await database
      .select({ id: introductionRequests.id })
      .from(introductionRequests)
      .innerJoin(
        profileOpportunities,
        eq(
          introductionRequests.profileOpportunityId,
          profileOpportunities.id,
        ),
      )
      .where(eq(profileOpportunities.profileId, storedProfile!.id));
    expect(storedIntroductions).toEqual([
      { id: firstAdvanceBody.introduction.id },
    ]);

    const persistedMagicLinks = await database
      .select({
        tokenHash: magicLinks.tokenHash,
        requesterHash: magicLinks.requesterHash,
      })
      .from(magicLinks)
      .where(eq(magicLinks.email, email));
    expect(persistedMagicLinks).toHaveLength(2);
    expect(persistedMagicLinks.map(({ tokenHash }) => tokenHash)).toEqual(
      expect.arrayContaining([
        hashToken(firstMagicToken, sessionSecret),
        hashToken(secondMagicToken, sessionSecret),
      ]),
    );
    for (const link of persistedMagicLinks) {
      expect([
        firstMagicToken,
        secondMagicToken,
        firstSessionToken,
        secondSessionToken,
        requesterIdentity,
      ]).not.toContain(link.tokenHash);
      expect(link.requesterHash).toBe(
        hashToken(`requester:${requesterIdentity}`, sessionSecret),
      );
    }
    const persistedSessions = await database
      .select({ tokenHash: sessions.tokenHash })
      .from(sessions)
      .where(eq(sessions.userId, firstSession.user.id));
    expect(persistedSessions).toEqual([
      { tokenHash: hashToken(secondSessionToken, sessionSecret) },
    ]);
    expect(persistedSessions[0]?.tokenHash).not.toBe(secondSessionToken);
  });
});
