import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GlobalRadarSignalPage from "../app/admin/global-demand-radar/signals/[signalId]/page";
import { GlobalRadarSignalDetail } from "../app/components/global-radar/GlobalRadarSignalDetail";
import { getGlobalRadarApplication } from "../app/server/global-radar";
import { getCurrentSession } from "../app/server/session";
import {
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
vi.mock("../app/server/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("../app/server/global-radar", () => ({ getGlobalRadarApplication: vi.fn() }));

const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
};
const adminSession = {
  session: { id: "session", expiresAt: new Date("2026-08-15T00:00:00.000Z") },
  user: { id: actor.userId, email: actor.email, name: "Admin" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue(adminSession);
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
});

describe("Global Radar signal detail page", () => {
  it("authenticates before parsing an invalid identifier", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    await expect(GlobalRadarSignalPage({
      params: Promise.resolve({ signalId: "invalid" }),
      searchParams: Promise.resolve({ returnTo: "https://evil.example" }),
    })).rejects.toThrow("redirect:/login");
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
