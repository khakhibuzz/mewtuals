import { describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_PROMOTION_SOURCE_SNAPSHOT_VERSION,
  selectPromotionEvidence,
  sourceSnapshotDigest,
} from "../db/repositories/global-radar-promotion-policy";
import type {
  PromotionEvidenceSelectionRole,
  SelectedPromotionEvidence,
} from "../db/repositories/global-radar-promotion-contracts";
import type {
  GlobalEntity,
  GlobalRadarSignal,
  GlobalSignalEvidence,
} from "../db/types";

function evidence(
  suffix: string,
  overrides: Partial<GlobalSignalEvidence> & {
    selectionRoles?: readonly PromotionEvidenceSelectionRole[];
  } = {},
) {
  return {
    id: `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
    signalId: "00000000-0000-4000-8000-000000000001",
    ingestOrdinal: Number(suffix),
    runId: "00000000-0000-4000-8000-000000000002",
    globalEntityId: "00000000-0000-4000-8000-000000000003",
    sourceUrl: `https://source-${suffix}.example/original`,
    canonicalSourceUrl: `https://source-${suffix}.example/canonical`,
    sourceName: `Source ${suffix}`,
    sourceType: "official_request",
    sourceLanguage: "en",
    sourceCountry: "United States",
    sourceFamily: "official_company_material",
    evidenceClaim: `Public evidence claim ${suffix}.`,
    sourceExcerpt: `Public excerpt ${suffix}.`,
    englishSummary: `English summary ${suffix}.`,
    publishedAt: new Date("2026-07-29T12:00:00.000Z"),
    observedAt: new Date("2026-07-30T12:00:00.000Z"),
    evidenceConfidence: 90,
    translationConfidence: 88,
    isPrimarySource: true,
    isSyndicated: false,
    supportsDirectDemand: true,
    supportsIndiaRelevance: true,
    rawMetadata: {},
    evidenceFingerprint: suffix.padStart(64, "a").slice(-64),
    supportedFieldPaths: [
      "directDemandAsk.data_collection_request",
      "indiaRelevance.explicit_India.collection",
    ],
    createdAt: new Date("2026-07-30T12:00:00.000Z"),
    selectionRoles: ["active_score_citation"],
    ...overrides,
  } satisfies SelectedPromotionEvidence;
}

describe("Global Radar promotion source snapshot digest", () => {
  it("uses the explicit v2 promotion-source contract", () => {
    expect(GLOBAL_RADAR_PROMOTION_SOURCE_SNAPSHOT_VERSION).toBe(
      "global-radar-promotion-source-snapshot-v2",
    );
  });

  it("is order-independent for evidence rows, roles, and supported paths", () => {
    const first = evidence("1", {
      selectionRoles: [
        "qualified_india_direct_demand",
        "active_score_citation",
      ],
      supportedFieldPaths: [
        "indiaRelevance.explicit_India.collection",
        "directDemandAsk.data_collection_request",
      ],
    });
    const second = evidence("2");

    expect(sourceSnapshotDigest([first, second])).toBe(
      sourceSnapshotDigest([
        second,
        {
          ...first,
          selectionRoles: [...first.selectionRoles].reverse(),
          supportedFieldPaths: [...first.supportedFieldPaths].reverse(),
        },
      ]),
    );
  });

  const mutations: ReadonlyArray<
    readonly [
      string,
      Partial<ReturnType<typeof evidence>>,
    ]
  > = [
    ["selection role", { selectionRoles: ["documented_indian_relationship"] }],
    ["claim", { evidenceClaim: "A materially changed public claim." }],
    ["owner", { globalEntityId: "00000000-0000-4000-8000-000000000099" }],
    ["ingest ordinal", { ingestOrdinal: 9 }],
    ["evidence confidence", { evidenceConfidence: 89 }],
    ["translation confidence", { translationConfidence: 87 }],
    ["published date", { publishedAt: new Date("2026-07-28T12:00:00.000Z") }],
    ["observed date", { observedAt: new Date("2026-07-30T13:00:00.000Z") }],
    ["primary flag", { isPrimarySource: false }],
    ["syndication flag", { isSyndicated: true }],
    ["direct-demand flag", { supportsDirectDemand: false }],
    ["India flag", { supportsIndiaRelevance: false }],
    ["paths", { supportedFieldPaths: ["signal.announcedAt"] }],
    ["canonical URL", { canonicalSourceUrl: "https://changed.example/source" }],
    ["source URL", { sourceUrl: "https://changed.example/original" }],
    ["source name", { sourceName: "Changed source" }],
    ["source type", { sourceType: "official_notice" }],
    ["source language", { sourceLanguage: "de" }],
    ["source country", { sourceCountry: "Germany" }],
    ["source family", { sourceFamily: "government_notice" }],
  ];

  it.each(mutations)("changes when the selected %s changes", (_label, mutation) => {
    const baseline = evidence("1");
    expect(sourceSnapshotDigest([{ ...baseline, ...mutation }])).not.toBe(
      sourceSnapshotDigest([baseline]),
    );
  });
});

describe("Global Radar selected promotion evidence", () => {
  const entity = {
    id: "00000000-0000-4000-8000-000000000003",
  } as GlobalEntity;
  const primarySignal = {
    id: "00000000-0000-4000-8000-000000000001",
    signalClass: "demand_precursor",
    indiaRelevanceType: "explicit_India",
  } as GlobalRadarSignal;

  it("uses only active score citations to establish the exceptional path", () => {
    const first = evidence("1", {
      canonicalSourceUrl: "https://first.example/source",
      sourceUrl: "https://first.example/source",
    });
    const second = evidence("2", {
      canonicalSourceUrl: "https://second.example/source",
      sourceUrl: "https://second.example/source",
    });
    const uncited = evidence("3", {
      canonicalSourceUrl: "https://uncited.example/source",
      sourceUrl: "https://uncited.example/source",
    });

    const result = selectPromotionEvidence({
      eligibilityPath: "exceptional_strategic_relevance",
      entity,
      primarySignal,
      supportingSignals: [primarySignal],
      availableEvidence: [uncited, second, first],
      scoreEvidence: [
        {
          signalId: primarySignal.id,
          evaluationEvidence: [uncited, second, first],
          citedEvidence: [second, first],
        },
      ],
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(
      result.evidence.map(({ evidenceFingerprint }) => evidenceFingerprint),
    ).toEqual([first.evidenceFingerprint, second.evidenceFingerprint]);
    expect(
      result.evidence.every(({ selectionRoles }) =>
        selectionRoles.includes("exceptional_strategic_relevance"),
      ),
    ).toBe(true);
  });

  it("selects documented relationship evidence only for the promoted owner", () => {
    const activeCitation = evidence("1");
    const wrongOwner = evidence("2", {
      globalEntityId: "00000000-0000-4000-8000-000000000099",
      evidenceClaim:
        "The unrelated organisation operates manufacturing facilities in India.",
      supportedFieldPaths: [
        "indiaRelevance.existing_India_presence.manufacturing",
      ],
    });
    const correctOwner = evidence("3", {
      evidenceClaim:
        "The promoted organisation operates manufacturing facilities in India.",
      supportedFieldPaths: [
        "indiaRelevance.existing_India_presence.manufacturing",
      ],
    });

    const result = selectPromotionEvidence({
      eligibilityPath: "documented_indian_relationship",
      entity,
      primarySignal,
      supportingSignals: [primarySignal],
      availableEvidence: [wrongOwner, correctOwner, activeCitation],
      scoreEvidence: [
        {
          signalId: primarySignal.id,
          evaluationEvidence: [activeCitation],
          citedEvidence: [activeCitation],
        },
      ],
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(
      result.evidence.find(({ evidenceFingerprint }) =>
        evidenceFingerprint === correctOwner.evidenceFingerprint
      )?.selectionRoles,
    ).toContain("documented_indian_relationship");
    expect(
      result.evidence.some(
        ({ evidenceFingerprint }) =>
          evidenceFingerprint === wrongOwner.evidenceFingerprint,
      ),
    ).toBe(false);
  });

  it("does not assign qualified India roles to uncited evaluation rows", () => {
    const directSignal = {
      ...primarySignal,
      signalClass: "direct_demand",
      indiaRelevanceType: "explicit_India",
    } as GlobalRadarSignal;
    const positiveIndia = {
      evidenceClaim: "The organisation is seeking suppliers in India.",
      supportedFieldPaths: ["indiaRelevance.explicit_India.suppliers"],
    };
    const cited = evidence("1", positiveIndia);
    const uncitedB = evidence("2", positiveIndia);
    const uncitedC = evidence("3", positiveIndia);

    const result = selectPromotionEvidence({
      eligibilityPath: "qualified_india_direct_demand",
      entity,
      primarySignal: directSignal,
      supportingSignals: [directSignal],
      availableEvidence: [cited, uncitedB, uncitedC],
      scoreEvidence: [
        {
          signalId: directSignal.id,
          evaluationEvidence: [cited, uncitedB, uncitedC],
          citedEvidence: [cited],
        },
      ],
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]?.evidenceFingerprint).toBe(
      cited.evidenceFingerprint,
    );
    expect(result.evidence[0]?.selectionRoles).toEqual([
      "active_score_citation",
      "qualified_india_direct_demand",
    ]);
  });

  it("does not assign repeated-signal roles to uncited evaluation rows", () => {
    const signalIds = [
      primarySignal.id,
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000005",
    ];
    const signals = signalIds.map(
      (id) =>
        ({
          ...primarySignal,
          id,
          signalClass: "demand_precursor",
          indiaRelevanceType: "explicit_India",
        }) as GlobalRadarSignal,
    );
    const positiveIndia = {
      evidenceClaim: "The organisation is seeking suppliers in India.",
      supportedFieldPaths: ["indiaRelevance.explicit_India.suppliers"],
    };
    const cited = signals.map((signal, index) =>
      evidence(`${index + 1}`, {
        ...positiveIndia,
        signalId: signal.id,
      }),
    );
    const uncitedB = evidence("8", positiveIndia);
    const uncitedC = evidence("9", positiveIndia);

    const result = selectPromotionEvidence({
      eligibilityPath: "repeated_india_compatible_signals",
      entity,
      primarySignal: signals[0]!,
      supportingSignals: signals,
      availableEvidence: [...cited, uncitedB, uncitedC],
      scoreEvidence: signals.map((signal, index) => ({
        signalId: signal.id,
        evaluationEvidence:
          index === 0
            ? [cited[index]!, uncitedB, uncitedC]
            : [cited[index]!],
        citedEvidence: [cited[index]!],
      })),
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.evidence).toHaveLength(3);
    expect(
      result.evidence.every(({ selectionRoles }) =>
        (
          [
          "active_score_citation",
          "repeated_india_compatible_signal",
          ] as const
        ).every((role) => selectionRoles.includes(role)),
      ),
    ).toBe(true);
    expect(
      result.evidence.some(({ evidenceFingerprint }) =>
        [uncitedB.evidenceFingerprint, uncitedC.evidenceFingerprint].includes(
          evidenceFingerprint,
        ),
      ),
    ).toBe(false);
  });
});
