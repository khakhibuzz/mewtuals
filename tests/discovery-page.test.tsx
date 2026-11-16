import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DiscoveryAdminPage, {
  serializeDiscoverySnapshot,
} from "../app/admin/discovery/page";
import { loadAdminPageContext } from "../app/server/admin-page-context";
import { getDiscoveryService } from "../app/server/discovery";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("../app/server/admin-page-context", () => ({ loadAdminPageContext: vi.fn() }));
vi.mock("../app/server/discovery", () => ({ getDiscoveryService: vi.fn() }));

const database = { requestOwned: "discovery" } as never;

const adminSession = {
  session: { id: "session", expiresAt: new Date("2026-08-15T00:00:00.000Z") },
  user: { id: "admin", email: "admin@mewtuals.com", name: "Admin" },
};

const snapshot = {
  summary: {
    totalCompanies: 1,
    totalCreators: 0,
    discoveredToday: 1,
    latestRunStatus: "succeeded" as const,
    latestRunCompletedAt: new Date("2026-07-22T05:00:00.000Z"),
    latestRunDuplicateCount: 2,
  },
  candidates: {
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
  },
  runs: [],
  evidence: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAdminPageContext).mockResolvedValue({
    database,
    session: adminSession,
  });
});

describe("discovery administrator page", () => {
  it("redirects signed-out visitors to login", async () => {
    vi.mocked(loadAdminPageContext).mockResolvedValue({ database, session: null });

    await expect(DiscoveryAdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/network/join",
    );
    expect(redirectMock).toHaveBeenCalledWith("/network/join");
  });

  it("redirects signed-in non-administrators to the member dashboard", async () => {
    vi.mocked(loadAdminPageContext).mockResolvedValue({
      database,
      session: {
        session: { id: "session", expiresAt: new Date("2026-08-15T00:00:00.000Z") },
        user: { id: "member", email: "member@example.com", name: null },
      },
    });
    vi.mocked(getDiscoveryService).mockReturnValue({
      getAdminSummary: vi.fn(async () => ({
        ok: false,
        status: 403,
        error: "Administrator access is required.",
      })),
    } as never);

    await expect(DiscoveryAdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/dashboard",
    );
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("loads the administrator snapshot and keeps verification operations reachable", async () => {
    const getAdminSummary = vi.fn(async () => ({ ok: true as const, snapshot }));
    vi.mocked(getDiscoveryService).mockReturnValue({ getAdminSummary } as never);

    render(await DiscoveryAdminPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "Discovery operations." }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Verification Queue" })).toHaveAttribute(
      "href",
      "/admin/verifications",
    );
    expect(
      screen.getByRole("link", { name: "India Discovery", current: "page" }),
    ).toHaveAttribute("href", "/admin/discovery");
    expect(getAdminSummary).toHaveBeenCalledWith(
      { userId: "admin", email: "admin@mewtuals.com" },
      {},
    );
    expect(loadAdminPageContext).toHaveBeenCalledOnce();
    expect(getDiscoveryService).toHaveBeenCalledWith(database);
  });

  it("passes only supported query-string filters to the discovery service", async () => {
    const getAdminSummary = vi.fn(async () => ({ ok: true as const, snapshot }));
    vi.mocked(getDiscoveryService).mockReturnValue({ getAdminSummary } as never);

    render(
      await DiscoveryAdminPage({
        searchParams: Promise.resolve({
          type: "company",
          geography: "India",
          category: "AI",
          source: "codex_web",
          status: "shortlisted",
          discoveredFrom: "2026-07-01",
          discoveredTo: "2026-07-22",
          page: "2",
          ignored: "private-server-value",
        }),
      }),
    );

    expect(getAdminSummary).toHaveBeenCalledWith(
      { userId: "admin", email: "admin@mewtuals.com" },
      {
        type: "company",
        geography: "India",
        category: "AI",
        source: "codex_web",
        status: "shortlisted",
        discoveredFrom: "2026-07-01",
        discoveredTo: "2026-07-22",
        page: "2",
      },
    );
  });

  it("omits blank enum filters while forwarding a category-only query", async () => {
    const getAdminSummary = vi.fn(async () => ({ ok: true as const, snapshot }));
    vi.mocked(getDiscoveryService).mockReturnValue({ getAdminSummary } as never);

    render(
      await DiscoveryAdminPage({
        searchParams: Promise.resolve({
          type: "",
          status: "   ",
          category: "AI",
        }),
      }),
    );

    expect(redirectMock).not.toHaveBeenCalled();
    expect(getAdminSummary).toHaveBeenCalledWith(
      { userId: "admin", email: "admin@mewtuals.com" },
      { category: "AI" },
    );
    expect(screen.getByLabelText("Category")).toHaveValue("AI");
  });

  it("serializes only dashboard fields and excludes secrets and raw payloads", () => {
    const serialized = serializeDiscoverySnapshot({
      ...snapshot,
      candidates: {
        ...snapshot.candidates,
        total: 1,
        items: [
          {
            id: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
            type: "company",
            name: "Aster Labs",
            normalizedName: "aster labs",
            canonicalIdentityKey: "website_host:aster.example",
            canonicalUrl: "https://aster.example/",
            websiteUrl: "https://aster.example/",
            primarySocialUrl: null,
            linkedinUrl: null,
            discoveredDescription: "An India AI company.",
            category: "AI",
            subcategory: null,
            geography: "India",
            firstSourceName: "codex_web",
            firstSourceUrl: "https://aster.example/about",
            discoveredAt: new Date("2026-07-22T04:00:00.000Z"),
            lastSeenAt: new Date("2026-07-22T05:00:00.000Z"),
            createdAt: new Date("2026-07-22T04:00:00.000Z"),
            updatedAt: new Date("2026-07-22T05:00:00.000Z"),
            mostRecentRunId: "8ca708dd-83ca-40fe-8c54-33e27ac82e46",
            discoveryScore: 88,
            status: "discovered",
            rawMetadata: { privateToken: "do-not-serialize" },
          },
        ],
      },
      runs: [
        {
          id: "8ca708dd-83ca-40fe-8c54-33e27ac82e46",
          externalRunKey: "internal-key",
          campaignKey: "robotics_hardware_india",
          trigger: "trial",
          status: "failed",
          startedAt: new Date("2026-07-22T04:00:00.000Z"),
          completedAt: new Date("2026-07-22T05:00:00.000Z"),
          createdAt: new Date("2026-07-22T04:00:00.000Z"),
          updatedAt: new Date("2026-07-22T05:00:00.000Z"),
          geography: "India",
          candidateType: "both",
          sourcesUsed: ["codex_web"],
          requestedCount: 20,
          companyPercentage: 50,
          foundCount: 0,
          newCount: 0,
          duplicateCount: 0,
          errorSummary: { failure: { message: "private upstream detail" } },
          requestedByEmail: "admin@mewtuals.com",
        },
      ],
      evidence: [
        {
          id: "66c8d557-02dd-485f-991d-aa72c1597db0",
          candidateId: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
          discoveryRunId: "8ca708dd-83ca-40fe-8c54-33e27ac82e46",
          sourceName: "codex_web",
          sourceUrl: "https://aster.example/about",
          firstSeenAt: new Date("2026-07-22T04:00:00.000Z"),
          lastSeenAt: new Date("2026-07-22T05:00:00.000Z"),
          rawMetadata: { secret: "source-private" },
          createdAt: new Date("2026-07-22T04:00:00.000Z"),
        },
      ],
    });
    const json = JSON.stringify(serialized);

    expect(json).toContain("Aster Labs");
    expect(json).toContain("2026-07-22T05:00:00.000Z");
    expect(json).not.toMatch(
      /rawMetadata|errorSummary|leaseToken|submissionHash|canonicalIdentityKey|private upstream detail|do-not-serialize|source-private/,
    );
  });
});
