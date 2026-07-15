import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { describe, expect, it, vi } from "vitest";

import DashboardPage from "../app/dashboard/page";
import { getDashboardService } from "../app/server/dashboard";
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
vi.mock("../app/server/dashboard", () => ({ getDashboardService: vi.fn() }));
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

function prepareDashboard(
  host: string,
  profileStatus: "pending" | "verified" = "pending",
) {
  const currentProfile = {
    ...profile,
    status: profileStatus,
    verifiedAt:
      profileStatus === "verified"
        ? new Date("2026-07-15T10:00:00.000Z")
        : null,
  };
  vi.mocked(headers).mockResolvedValue(new Headers({ host }));
  vi.mocked(readServerEnvironment).mockReturnValue({
    environment: "development",
    sessionSecret: "test-session-secret-that-is-longer-than-32-characters",
    adminEmails: [],
    developmentAuthEnabled: true,
  });
  vi.mocked(getCurrentSession).mockResolvedValue(session);
  vi.mocked(getOnboardingService).mockReturnValue({
    state: vi.fn(async () => ({ profile: currentProfile })),
  } as never);
  vi.mocked(getVerificationService).mockReturnValue({
    memberState: vi.fn(async () => ({ profile: currentProfile })),
  } as never);
  vi.mocked(getDashboardService).mockReturnValue({
    state: vi.fn(async () => ({
      ok: true,
      state: {
        signal: {
          availability: "open_now",
          openTo: ["distribution_partnerships"],
          notes: null,
        },
        assignments: [
          {
            id: "1723c982-a683-4e57-a584-26837f011347",
            title: "Startup distribution pilot",
            summary: "A focused reciprocal distribution pilot.",
            direction: "startup_distribution_partner",
            counterpartyType: "Distribution partner with relevant customer access",
            reciprocalValue:
              "Relevant customer access ↔ a useful product story and measurable pilot learning",
            fitSummary:
              "Fits your current interest in distribution_partnerships.",
            rank: 1,
            introduction: null,
          },
        ],
      },
    })),
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

  it("replaces the verified placeholder with the private signal and curated picks flow", async () => {
    prepareDashboard("localhost:4000", "verified");

    render(await DashboardPage());

    expect(
      screen.getByRole("heading", { name: "Tell Mewtuals what you are open to" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Startup distribution pilot" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ask Mewtuals to advance this" }),
    ).toBeVisible();
    expect(
      screen.queryByText(/next part of this private flow/i),
    ).not.toBeInTheDocument();
  });
});
