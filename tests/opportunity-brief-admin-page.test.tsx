import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OpportunityBriefAdminPage, {
  serializeOpportunityBriefSnapshot,
} from "../app/admin/opportunity-briefs/page";
import { getCurrentSession } from "../app/server/session";
import { getOpportunityBriefService } from "../app/server/opportunity-brief";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("../app/server/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("../app/server/opportunity-brief", () => ({ getOpportunityBriefService: vi.fn() }));

const adminSession = {
  session: { id: "session", expiresAt: new Date("2026-08-15") },
  user: { id: "admin", email: "admin@example.com", name: null },
};

const snapshot = {
  summary: {
    total: 0,
    newToday: 0,
    companies: 0,
    creators: 0,
    awaitingResearch: 0,
    linkedCandidates: 0,
    pendingAcknowledgements: 0,
    failedAcknowledgements: 0,
    sources: {},
  },
  requests: [],
  page: 1,
  pageSize: 25,
  totalPages: 0,
};

beforeEach(() => vi.clearAllMocks());

describe("Opportunity Brief administrator page", () => {
  it("redirects signed-out visitors to login", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    await expect(OpportunityBriefAdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/login",
    );
  });

  it("redirects signed-in non-administrators to the member dashboard", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      ...adminSession,
      user: { id: "member", email: "member@example.com", name: null },
    });
    vi.mocked(getOpportunityBriefService).mockReturnValue({
      getAdminSnapshot: vi.fn(async () => ({
        ok: false,
        status: 403,
        error: "Administrator access is required.",
      })),
    } as never);

    await expect(OpportunityBriefAdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/dashboard",
    );
  });

  it("loads the safe snapshot and cross-links every admin operation", async () => {
    const getAdminSnapshot = vi.fn(async () => ({ ok: true as const, snapshot }));
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession);
    vi.mocked(getOpportunityBriefService).mockReturnValue({ getAdminSnapshot } as never);

    render(await OpportunityBriefAdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Opportunity Brief requests." })).toBeVisible();
    expect(screen.getByRole("link", { name: "Opportunity Briefs" })).toHaveAttribute(
      "href",
      "/admin/opportunity-briefs",
    );
    expect(screen.getByRole("link", { name: "Discovery" })).toHaveAttribute(
      "href",
      "/admin/discovery",
    );
    expect(screen.getByRole("link", { name: "Verification queue" })).toHaveAttribute(
      "href",
      "/admin/verifications",
    );
  });

  it("passes only supported filters to the service", async () => {
    const getAdminSnapshot = vi.fn(async () => ({ ok: true as const, snapshot }));
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession);
    vi.mocked(getOpportunityBriefService).mockReturnValue({ getAdminSnapshot } as never);

    render(await OpportunityBriefAdminPage({
      searchParams: Promise.resolve({
        participantType: "company",
        status: "submitted",
        source: "meetup",
        from: "2026-07-01",
        to: "2026-07-22",
        page: "2",
        pageSize: "50",
        ignored: "private",
      }),
    }));

    expect(getAdminSnapshot).toHaveBeenCalledWith(
      { userId: "admin", email: "admin@example.com" },
      {
        participantType: "company",
        status: "submitted",
        source: "meetup",
        submittedFrom: "2026-07-01",
        submittedTo: "2026-07-22",
        page: "2",
        pageSize: "50",
      },
    );
  });

  it("serializes dates and excludes private fields", () => {
    const request = {
      id: "00000000-0000-4000-8000-000000000101",
      participantType: "creator" as const,
      profileUrl: "https://youtube.com/@creator",
      email: "creator@example.com",
      phoneNumber: null,
      openToText: null,
      source: null,
      utm: {},
      linkedCandidateId: null,
      status: "submitted" as const,
      adminNotes: null,
      acknowledgementStatus: "pending" as const,
      acknowledgementSentAt: null,
      acknowledgementError: null,
      submissionCount: 1,
      lastSubmittedAt: new Date("2026-07-22T06:00:00.000Z"),
      createdAt: new Date("2026-07-22T05:00:00.000Z"),
      updatedAt: new Date("2026-07-22T06:00:00.000Z"),
      requesterHash: "private",
      attempts: [{ requesterHash: "private" }],
    };

    const serialized = serializeOpportunityBriefSnapshot({
      ...snapshot,
      summary: { ...snapshot.summary, total: 1 },
      requests: [request],
    });

    expect(serialized.requests[0].lastSubmittedAt).toBe("2026-07-22T06:00:00.000Z");
    expect(JSON.stringify(serialized)).not.toContain("requesterHash");
    expect(JSON.stringify(serialized)).not.toContain("attempts");
  });
});

describe("administrator navigation", () => {
  it("links Opportunity Briefs from discovery and verification pages", async () => {
    const discoverySource = await import("node:fs/promises").then((fs) =>
      fs.readFile(`${process.cwd()}/app/admin/discovery/page.tsx`, "utf8"),
    );
    const verificationSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(`${process.cwd()}/app/admin/verifications/page.tsx`, "utf8"),
    );

    expect(discoverySource).toContain('/admin/opportunity-briefs');
    expect(verificationSource).toContain('/admin/opportunity-briefs');
  });
});
