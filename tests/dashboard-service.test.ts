import { describe, expect, it, vi } from "vitest";

import {
  createDashboardService,
  type DashboardRepository,
} from "../app/server/dashboard-service";
import { opportunitySeedData } from "../db/seed-data";

const verifiedStartup = {
  id: "18086d8c-f1f0-4815-9985-343de8dfd9b1",
  identityKind: "organisation" as const,
  organisationSubtype: "startup" as const,
  creatorSubtype: null,
  status: "verified" as const,
};

const startupOpportunity = {
  id: "1723c982-a683-4e57-a584-26837f011347",
  ...opportunitySeedData.find(
    ({ direction }) => direction === "startup_distribution_partner",
  )!,
};

function dashboardRepository(overrides: Record<string, unknown> = {}) {
  return {
    readDashboard: vi.fn(async () => ({
      access: "verified" as const,
      signal: null,
      assignments: [],
    })),
    updateSignal: vi.fn(
      async (
        _userId: string,
        signal: unknown,
        selectAssignments: (input: unknown) => unknown,
      ) => ({
        access: "verified" as const,
        signal,
        assignments: selectAssignments({
          profile: verifiedStartup,
          catalogue: [startupOpportunity],
          requestedAssignments: [],
        }),
      }),
    ),
    requestIntroduction: vi.fn(
      async (): Promise<
        | {
            access: "verified";
            introduction: {
              id: string;
              state: "requested";
            };
          }
        | { access: "denied" }
        | { access: "unassigned" }
      > => ({
        access: "verified",
        introduction: {
          id: "0270a097-d011-462a-aa23-6b4d7f47bec2",
          state: "requested",
        },
      }),
    ),
    ...overrides,
  };
}

function serviceFor(repository: ReturnType<typeof dashboardRepository>) {
  return createDashboardService({
    repository: repository as unknown as DashboardRepository,
  });
}

describe("verified member dashboard service", () => {
  it("gates dashboard reads and signal writes behind verified membership", async () => {
    const repository = dashboardRepository({
      readDashboard: vi.fn(async () => ({ access: "denied" as const })),
      updateSignal: vi.fn(async () => ({ access: "denied" as const })),
    });
    const service = serviceFor(repository);

    await expect(service.state("member-id")).resolves.toEqual({
      ok: false,
      status: 403,
      error: "A verified Mewtuals profile is required.",
    });
    await expect(
      service.saveSignal("member-id", {
        availability: "open_now",
        openTo: ["distribution_partnerships"],
      }),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "A verified Mewtuals profile is required.",
    });
  });

  it("returns accessible field errors without calling persistence", async () => {
    const repository = dashboardRepository();
    const service = serviceFor(repository);

    const result = await service.saveSignal("member-id", {
      availability: "open_now",
      openTo: [],
      notes: "x".repeat(501),
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      error: "Review what you are open to.",
      errors: {
        openTo: expect.any(String),
        notes: expect.any(String),
      },
    });
    expect(repository.updateSignal).not.toHaveBeenCalled();
  });

  it("curates at most three deterministic fits and persists their ranks and fit summaries", async () => {
    const catalogue = [
      {
        ...startupOpportunity,
        id: "6f50c7ae-771b-48fa-909f-5035f6ec7e8a",
        key: "z-distribution",
      },
      {
        ...startupOpportunity,
        id: "73bb0fe0-d367-448d-947f-ad0bd180e2f2",
        key: "a-distribution",
      },
      {
        ...startupOpportunity,
        id: "4e75a8ca-e832-426a-a395-4f746900b0d0",
        key: "b-distribution",
      },
      {
        ...startupOpportunity,
        id: "0ae4faf5-23b3-4a21-8302-f9ee15ff81e2",
        key: "c-distribution",
      },
    ];
    let persisted: unknown;
    const repository = dashboardRepository({
      updateSignal: vi.fn(
        async (
          _userId: string,
          signal: unknown,
          selectAssignments: (input: unknown) => unknown,
        ) => {
          persisted = selectAssignments({
            profile: verifiedStartup,
            catalogue,
            requestedAssignments: [],
          });
          return {
            access: "verified" as const,
            signal,
            assignments: persisted,
          };
        },
      ),
    });
    const service = serviceFor(repository);

    const result = await service.saveSignal("member-id", {
      availability: "open_now",
      openTo: ["distribution_partnerships"],
      notes: "A focused channel pilot.",
    });

    expect(result).toMatchObject({ ok: true });
    expect(persisted).toEqual([
      expect.objectContaining({
        opportunityId: catalogue[1].id,
        rank: 1,
        fitSummary: "Fits your current interest in distribution_partnerships.",
      }),
      expect.objectContaining({ opportunityId: catalogue[2].id, rank: 2 }),
      expect.objectContaining({ opportunityId: catalogue[3].id, rank: 3 }),
    ]);
  });

  it("treats zero strong matches as a valid saved state", async () => {
    const repository = dashboardRepository({
      updateSignal: vi.fn(
        async (
          _userId: string,
          signal: unknown,
          selectAssignments: (input: unknown) => unknown,
        ) => ({
          access: "verified" as const,
          signal,
          assignments: selectAssignments({
            profile: verifiedStartup,
            catalogue: [startupOpportunity],
            requestedAssignments: [],
          }),
        }),
      ),
    });
    const service = serviceFor(repository);

    await expect(
      service.saveSignal("member-id", {
        availability: "not_available",
        openTo: ["distribution_partnerships"],
      }),
    ).resolves.toMatchObject({ ok: true, state: { assignments: [] } });
  });

  it("keeps a requested relationship visible and fills only the remaining slots", async () => {
    const requestedOpportunity = {
      id: "809d72af-e2a8-459f-83db-bf17383c4951",
      ...opportunitySeedData.find(
        ({ direction }) => direction === "brand_creator",
      )!,
    };
    const currentFits = ["a", "b", "c"].map((key, index) => ({
      ...startupOpportunity,
      id: [
        "02c6a910-0233-482d-a3f1-d27758e3b79e",
        "013927cd-1700-45d2-95c3-a15bad67889e",
        "782c3a58-1474-4019-9807-7ded403f4a19",
      ][index],
      key,
    }));
    let persisted: unknown;
    const repository = dashboardRepository({
      updateSignal: vi.fn(
        async (
          _userId: string,
          signal: unknown,
          selectAssignments: (input: unknown) => unknown,
        ) => {
          persisted = selectAssignments({
            profile: verifiedStartup,
            catalogue: currentFits,
            requestedAssignments: [
              {
                assignmentId: "41cbf08f-9694-4eb6-84f2-1a93f564ce01",
                rank: 2,
                fitSummary: "Original reason for the relationship.",
                opportunity: requestedOpportunity,
                introduction: {
                  id: "e85a4f64-ac75-4739-b031-755dadc71540",
                  state: "requested",
                },
              },
            ],
          });
          return {
            access: "verified" as const,
            signal,
            assignments: persisted,
          };
        },
      ),
    });
    const service = serviceFor(repository);

    await service.saveSignal("member-id", {
      availability: "open_selectively",
      openTo: ["distribution_partnerships"],
    });

    expect(persisted).toEqual([
      expect.objectContaining({
        opportunityId: requestedOpportunity.id,
        rank: 1,
        fitSummary: "Original reason for the relationship.",
        preserve: true,
      }),
      expect.objectContaining({ opportunityId: currentFits[0].id, rank: 2 }),
      expect.objectContaining({ opportunityId: currentFits[1].id, rank: 3 }),
    ]);
  });

  it("seeds a viable generic opportunity for every supported direction", async () => {
    const scenarios = [
      [
        { kind: "organisation", subtype: "brand" },
        "creator_collaborations",
        "brand_creator",
      ],
      [
        { kind: "organisation", subtype: "brand" },
        "co_marketing",
        "brand_brand",
      ],
      [
        { kind: "creator", subtype: "creator" },
        "podcasts",
        "creator_creator",
      ],
      [
        { kind: "organisation", subtype: "startup" },
        "distribution_partnerships",
        "startup_distribution_partner",
      ],
    ] as const;

    for (const [identity, interest, expectedDirection] of scenarios) {
      let selected: { opportunityId: string }[] = [];
      const repository = dashboardRepository({
        updateSignal: vi.fn(
          async (
            _userId: string,
            signal: unknown,
            selectAssignments: (input: unknown) => { opportunityId: string }[],
          ) => {
            selected = selectAssignments({
              profile: {
                ...verifiedStartup,
                identityKind: identity.kind,
                organisationSubtype:
                  identity.kind === "organisation" ? identity.subtype : null,
                creatorSubtype:
                  identity.kind === "creator" ? identity.subtype : null,
              },
              catalogue: opportunitySeedData.map((candidate, index) => ({
                ...candidate,
                id: `00000000-0000-4000-8000-00000000000${index}`,
              })),
              requestedAssignments: [],
            });
            return {
              access: "verified" as const,
              signal,
              assignments: selected,
            };
          },
        ),
      });
      const service = serviceFor(repository);

      await service.saveSignal("member-id", {
        availability: "open_now",
        openTo: [interest],
      });

      const selectedId = selected[0]?.opportunityId;
      expect(
        opportunitySeedData.find(
          (_, index) =>
            `00000000-0000-4000-8000-00000000000${index}` === selectedId,
        )?.direction,
      ).toBe(expectedDirection);
    }
  });

  it("advances only an assigned owner-scoped opportunity and returns a stable retry status", async () => {
    const repository = dashboardRepository();
    const service = serviceFor(repository);

    const result = await service.advance(
      "member-id",
      startupOpportunity.id,
      "Please assess this relationship.",
    );

    expect(repository.requestIntroduction).toHaveBeenCalledWith({
      userId: "member-id",
      opportunityId: startupOpportunity.id,
      note: "Please assess this relationship.",
    });
    expect(result).toEqual({
      ok: true,
      introduction: {
        id: "0270a097-d011-462a-aa23-6b4d7f47bec2",
        state: "requested",
      },
      message: "Mewtuals is reviewing the relationship",
    });
  });

  it("rejects invalid, unassigned, and non-verified relationship requests", async () => {
    const repository = dashboardRepository({
      requestIntroduction: vi.fn(async () => ({ access: "unassigned" as const })),
    });
    const service = serviceFor(repository);

    await expect(service.advance("member-id", "not-a-uuid")).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Choose a valid Mewtuals Pick.",
      errors: { opportunityId: "Choose a valid Mewtuals Pick." },
    });
    await expect(
      service.advance("member-id", startupOpportunity.id),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: "This Mewtuals Pick is not available to your profile.",
    });

    repository.requestIntroduction.mockResolvedValueOnce({ access: "denied" });
    await expect(
      service.advance("member-id", startupOpportunity.id),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "A verified Mewtuals profile is required.",
    });
  });

  it("treats an assigned pick deactivated before advancement as unavailable", async () => {
    const repository = dashboardRepository({
      requestIntroduction: vi.fn(async () => ({
        access: "unavailable" as const,
      })),
    });
    const service = serviceFor(repository);

    await expect(
      service.advance("member-id", startupOpportunity.id),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: "This Mewtuals Pick is not available to your profile.",
    });
  });
});
