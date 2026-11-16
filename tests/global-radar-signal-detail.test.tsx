import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GlobalRadarSignalPage from "../app/admin/global-demand-radar/signals/[signalId]/page";
import { GlobalRadarSignalDetail } from "../app/components/global-radar/GlobalRadarSignalDetail";
import { loadAdminPageContext } from "../app/server/admin-page-context";
import { getGlobalRadarApplication } from "../app/server/global-radar";
import {
  RADAR_ASSOCIATED_ENTITY_ID,
  RADAR_DETAIL_HEADINGS,
  RADAR_SIGNAL_ID,
  globalRadarDetailFixture,
} from "./support/global-radar-ui-data";

const { notFoundMock, redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../app/server/admin-page-context", () => ({ loadAdminPageContext: vi.fn() }));
vi.mock("../app/server/global-radar", () => ({ getGlobalRadarApplication: vi.fn() }));

const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
};
const adminSession = {
  session: { id: "session", expiresAt: new Date("2026-08-15T00:00:00.000Z") },
  user: { id: actor.userId, email: actor.email, name: "Admin" },
};
const database = { requestOwned: "global-radar-detail" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAdminPageContext).mockResolvedValue({ database, session: adminSession });
  vi.mocked(getGlobalRadarApplication).mockReturnValue({
    admin: {
      getSignalDetail: vi.fn(async (_actor, signalId) =>
        signalId === null
          ? { outcome: "invalid" as const }
          : { outcome: "found" as const, detail: globalRadarDetailFixture() }),
    },
  } as never);
});

describe("GlobalRadarSignalDetail", () => {
  it("renders the exact twenty-section document in DTO order", () => {
    render(
      <GlobalRadarSignalDetail
        initialDetail={globalRadarDetailFixture() as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(RADAR_DETAIL_HEADINGS);
    expect(headings).toHaveLength(20);
  });

  it("keeps facts, interpretation, translation, and score rationale semantically separate", () => {
    render(
      <GlobalRadarSignalDetail
        initialDetail={globalRadarDetailFixture() as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );

    expect(screen.getByRole("region", { name: "Publicly supported facts" })).toHaveAttribute(
      "data-layer",
      "facts",
    );
    expect(screen.getByRole("region", { name: "Mewtuals interpretation" })).toHaveAttribute(
      "data-layer",
      "inference",
    );
    expect(screen.getByRole("region", { name: "English summary" })).toHaveAttribute(
      "data-layer",
      "translation",
    );
    expect(screen.getByRole("region", { name: "Score rationale" })).toHaveAttribute(
      "data-layer",
      "score",
    );
  });

  it("renders score-component evidence associations and rationale", () => {
    render(
      <GlobalRadarSignalDetail
        initialDetail={globalRadarDetailFixture() as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );

    const score = screen.getByRole("region", { name: "Score rationale" });
    expect(within(score).getByText("Commercial potential")).toBeVisible();
    expect(
      within(score).getByText(
        "Worker score is supported by public evidence cited for this component.",
      ),
    ).toBeVisible();
    expect(
      within(score).getByRole("link", { name: "Official supplier notice" }),
    ).toHaveAttribute("rel", "noreferrer");
    expect(score).toHaveTextContent("scoreComponents.commercialPotential");
  });

  it("uses DTO language direction, English language, noreferrer evidence links, and an evidence-only response path", () => {
    const { container } = render(
      <GlobalRadarSignalDetail
        initialDetail={globalRadarDetailFixture() as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );

    expect(container.querySelector('blockquote[lang="zh-CN"][dir="ltr"]')).toHaveTextContent(
      "该公司公开邀请供应商申请",
    );
    expect(container.querySelector('[lang="en"]')).toHaveTextContent(
      "The company publicly invites supplier applications.",
    );
    const evidence = screen.getByRole("region", { name: "Supporting evidence" });
    expect(within(evidence).getByRole("link", { name: "Official supplier notice" })).toHaveAttribute(
      "rel",
      "noreferrer",
    );
    const responsePath = screen.getByRole("region", { name: "Public response path" });
    expect(within(responsePath).getByText("Evidence only — no outreach is performed.")).toBeVisible();
    expect(within(responsePath).getByRole("link", { name: "View public response-path evidence" })).toHaveAttribute(
      "rel",
      "noreferrer",
    );
    expect(responsePath.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(responsePath).not.toHaveTextContent(/contact now|apply now|send/i);
  });

  it("displays momentum evidence ownership from the safe contributor detail", () => {
    const secondContributorId = "00000000-0000-4000-8000-000000000021";
    render(
      <GlobalRadarSignalDetail
        initialDetail={globalRadarDetailFixture({
          signalClass: "ecosystem_momentum",
          includePrimaryOrganisation: false,
          associatedOrganisations: [
            {
              id: RADAR_ASSOCIATED_ENTITY_ID,
              canonicalName: "Fictional Partner Example",
              revision: 8,
            },
            {
              id: secondContributorId,
              canonicalName: "Second Momentum Contributor",
              revision: 11,
            },
          ],
          evidenceEntityId: secondContributorId,
        }) as never}
        returnTo="/admin/global-demand-radar/momentum"
      />,
    );

    const evidence = screen.getByRole("region", {
      name: "Supporting evidence",
    });
    expect(evidence).toHaveTextContent(
      `Evidence owner: Second Momentum Contributor · ${secondContributorId}`,
    );
  });

  it("renders nested bounded specification, regulatory, and logistics values without raw JSON", () => {
    const detail = globalRadarDetailFixture() as unknown as {
      sections: Array<{ id: string; data: Record<string, unknown> }>;
    };
    const physical = detail.sections.find(
      (section) => section.id === "physical_data_or_hardware_specifications",
    );
    const indiaFit = detail.sections.find(
      (section) => section.id === "india_fit_reasoning_and_constraints",
    );
    const physicalData = physical?.data as {
      items?: Array<Record<string, unknown>>;
    };

    physicalData.items![0].technicalSpecification = {
      certification: {
        standards: ["ISO 9001", "IEC 61508"],
        audit: { country: "India", status: "documented" },
        technicalIdentifier: "ISO_9001",
        sourceUrl: "https://example.test/spec_sheet_v2",
      },
    };
    indiaFit!.data.regulatoryFacts = {
      exportReview: {
        states: ["pending", "documented"],
        owner: { jurisdiction: "India" },
      },
    };
    indiaFit!.data.logisticsFacts = {
      shipping: {
        modes: ["sea", "air"],
        packaging: { requirement: "shock rated" },
      },
    };

    render(
      <GlobalRadarSignalDetail
        initialDetail={detail as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );

    const physicalRegion = screen.getByRole("region", {
      name: "Physical-data or hardware specifications",
    });
    expect(within(physicalRegion).getByText("Standards")).toBeVisible();
    expect(within(physicalRegion).getByText("IEC 61508")).toBeVisible();
    expect(within(physicalRegion).getByText("Audit")).toBeVisible();
    expect(within(physicalRegion).getAllByText("documented")).not.toHaveLength(0);
    expect(within(physicalRegion).getByText("ISO_9001")).toBeVisible();
    expect(within(physicalRegion).getByText("https://example.test/spec_sheet_v2")).toBeVisible();

    const indiaFitRegion = screen.getByRole("region", {
      name: "India-fit reasoning and constraints",
    });
    expect(within(indiaFitRegion).getByText("States")).toBeVisible();
    expect(within(indiaFitRegion).getByText("Jurisdiction")).toBeVisible();
    expect(within(indiaFitRegion).getByText("Modes")).toBeVisible();
    expect(within(indiaFitRegion).getByText("shock rated")).toBeVisible();
    expect(physicalRegion.querySelector("pre")).toBeNull();
    expect(indiaFitRegion.querySelector("pre")).toBeNull();
  });

  it("caps defensive traversal before rendering over-deep or oversized nested values", () => {
    const detail = globalRadarDetailFixture() as unknown as {
      sections: Array<{ id: string; data: Record<string, unknown> }>;
    };
    const physical = detail.sections.find(
      (section) => section.id === "physical_data_or_hardware_specifications",
    );
    const physicalData = physical?.data as {
      items?: Array<Record<string, unknown>>;
    };

    physicalData.items![0].technicalSpecification = {
      visible: {
        levelTwo: {
          levelThree: {
            levelFour: {
              levelFive: {
                privateLeafThatMustNotRender: "private value",
              },
            },
          },
        },
      },
      boundedItems: Array.from({ length: 55 }, (_, index) => `Item ${index + 1}`),
    };

    render(
      <GlobalRadarSignalDetail
        initialDetail={detail as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );

    const region = screen.getByRole("region", {
      name: "Physical-data or hardware specifications",
    });
    expect(within(region).getByText("Visible")).toBeVisible();
    expect(within(region).getByText("Additional nested detail omitted.")).toBeVisible();
    expect(within(region).getByText("Additional items omitted.")).toBeVisible();
    expect(within(region).queryByText("Private value")).toBeNull();
    expect(within(region).getByText("Item 50")).toBeVisible();
    expect(within(region).queryByText("Item 51")).toBeNull();
  });

  it("shows an unrecorded evergreen value as not recorded instead of no", () => {
    const detail = globalRadarDetailFixture() as unknown as {
      sections: Array<{ id: string; data: Record<string, unknown> }>;
    };
    const timelineSection = detail.sections.find(
      (section) => section.id === "scale_and_timeline",
    );
    const timeline = (timelineSection?.data.timeline ?? {}) as Record<string, unknown>;
    timeline.evergreen = null;

    render(
      <GlobalRadarSignalDetail
        initialDetail={detail as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );

    const region = screen.getByRole("region", { name: "Scale and timeline" });
    const evergreenFact = within(region).getByText("Evergreen").closest("div");
    expect(evergreenFact).not.toBeNull();
    expect(within(evergreenFact!).getByText("Not recorded")).toBeVisible();
    expect(within(evergreenFact!).queryByText("No", { exact: true })).toBeNull();
  });
});

describe("Global Radar signal detail page", () => {
  it("authenticates before parsing an invalid identifier", async () => {
    vi.mocked(loadAdminPageContext).mockResolvedValue({ database, session: null });

    await expect(GlobalRadarSignalPage({
      params: Promise.resolve({ signalId: "invalid" }),
      searchParams: Promise.resolve({ returnTo: "https://evil.example" }),
    })).rejects.toThrow("redirect:/network/join");
    expect(getGlobalRadarApplication).not.toHaveBeenCalled();
  });

  it("uses service-owned authorization before identifier and return parsing", async () => {
    const getSignalDetail = vi.fn(async () => ({ outcome: "forbidden" as const }));
    vi.mocked(getGlobalRadarApplication).mockReturnValue({ admin: { getSignalDetail } } as never);

    await expect(GlobalRadarSignalPage({
      params: Promise.resolve({ signalId: "invalid" }),
      searchParams: Promise.resolve({ returnTo: "https://evil.example" }),
    })).rejects.toThrow("redirect:/dashboard");
    expect(getSignalDetail).toHaveBeenCalledTimes(1);
    expect(getSignalDetail).toHaveBeenCalledWith(actor, null);
  });

  it.each([
    ["invalid", "invalid"],
    [RADAR_SIGNAL_ID, "not_found"],
  ])("returns the same detail-free not-found boundary for %s", async (signalId, outcome) => {
    const getSignalDetail = vi.fn(async (_actor, id) =>
      id === null ? { outcome: "invalid" as const } : { outcome } as const);
    vi.mocked(getGlobalRadarApplication).mockReturnValue({ admin: { getSignalDetail } } as never);

    await expect(GlobalRadarSignalPage({
      params: Promise.resolve({ signalId }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("not-found");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("loads the safe detail and canonicalizes an allowed return path", async () => {
    render(await GlobalRadarSignalPage({
      params: Promise.resolve({ signalId: RADAR_SIGNAL_ID }),
      searchParams: Promise.resolve({
        returnTo: "/admin/global-demand-radar/direct-demand?page=2&country=China",
      }),
    }));

    expect(screen.getByRole("link", { name: "Back to Direct Demand" })).toHaveAttribute(
      "href",
      "/admin/global-demand-radar/direct-demand?country=China&page=2",
    );
    expect(screen.getByRole("link", { name: "Global Demand Radar", current: "page" })).toBeVisible();
    expect(
      within(screen.getByRole("navigation", { name: "Global Demand Radar sections" }))
        .getByRole("link", { name: "Direct Demand", current: "page" }),
    ).toBeVisible();
  });

  it("falls back to the active class tab for unsafe return paths", async () => {
    render(await GlobalRadarSignalPage({
      params: Promise.resolve({ signalId: RADAR_SIGNAL_ID }),
      searchParams: Promise.resolve({ returnTo: "//evil.example/escape" }),
    }));

    expect(screen.getByRole("link", { name: "Back to Direct Demand" })).toHaveAttribute(
      "href",
      "/admin/global-demand-radar/direct-demand",
    );
  });
});
