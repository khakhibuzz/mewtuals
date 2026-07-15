import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { describe, expect, it, vi } from "vitest";

import DashboardPage from "../app/dashboard/page";
import { readServerEnvironment } from "../app/server/env";
import { getOnboardingService } from "../app/server/onboarding";
import { getCurrentSession } from "../app/server/session";
import { getVerificationService } from "../app/server/verification";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`Unexpected redirect to ${path}`);
  }),
}));
vi.mock("../app/server/env", () => ({ readServerEnvironment: vi.fn() }));
vi.mock("../app/server/onboarding", () => ({ getOnboardingService: vi.fn() }));
vi.mock("../app/server/onboarding-service", () => ({
  nextOnboardingPath: vi.fn(() => "/dashboard"),
}));
vi.mock("../app/server/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("../app/server/verification", () => ({
  getVerificationService: vi.fn(),
}));

const session = {
  session: { id: "session", expiresAt: new Date("2026-08-15") },
  user: { id: "member", email: "member@example.com", name: null },
};

const profile = {
  id: "f8ed3b8f-33d7-4808-9ad4-c16140bc9711",
  userId: "member",
  memberEmail: "member@example.com",
  name: "Mew Studio",
  organisationName: "Mew Studio",
  identityKind: "organisation" as const,
  organisationSubtype: "startup" as const,
  creatorSubtype: null,
  domain: "mew.example",
  primaryUrl: "https://mew.example/",
  status: "pending" as const,
  submittedAt: new Date("2026-07-15T09:30:00.000Z"),
  verifiedAt: null,
};

function prepareDashboard(host: string) {
  vi.mocked(headers).mockResolvedValue(new Headers({ host }));
  vi.mocked(readServerEnvironment).mockReturnValue({
    environment: "development",
    sessionSecret: "test-session-secret-that-is-longer-than-32-characters",
    adminEmails: [],
    developmentAuthEnabled: true,
  });
  vi.mocked(getCurrentSession).mockResolvedValue(session);
  vi.mocked(getOnboardingService).mockReturnValue({
    state: vi.fn(async () => ({ profile })),
  } as never);
  vi.mocked(getVerificationService).mockReturnValue({
    memberState: vi.fn(async () => ({ profile })),
  } as never);
}

describe("member dashboard development controls", () => {
  it.each([
    ["preview.example", false],
    ["localhost:4000", true],
    ["127.0.0.1:4000", true],
    ["[::1]:4000", true],
  ] as const)("host=%s exposes local approval=%s", async (host, exposed) => {
    prepareDashboard(host);

    render(await DashboardPage());

    const control = screen.queryByRole("button", {
      name: "Simulate approval locally",
    });
    expect(Boolean(control)).toBe(exposed);
  });
});
