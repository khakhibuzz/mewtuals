import { describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_ACTIVE_SCORE_SNAPSHOT_VERSION,
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  GLOBAL_RADAR_SCORE_EVIDENCE_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  createActiveScoreEvidenceSnapshot,
  createGlobalRadarScoreInputDigest,
  hasValidActiveScoreEvidenceCitations,
  parseActiveScoreEvidenceSnapshot,
  type ScoreEvidenceSource,
} from "../app/domain/global-radar";
import {
  createStoredScoreEvidenceSnapshot,
  rebaseStoredScoreEvidenceSnapshot,
} from "../db/repositories/global-radar-score-evidence";

const directComponents = {
  demandExplicitness: 100,
  evidenceConfidence: 88,
  freshness: 100,
  actionability: 70,
  indiaFit: 70,
  commercialPotential: 75,
  repeatability: 65,
  responseAccessibility: 100,
  strategicLearning: 80,
  complianceComplexity: 20,
} as const;

const scoreEvaluationMetadata = Object.freeze({
  scoreAsOf: "2026-07-31T00:00:00.000Z",
  evidenceBoundaryOrdinal: 1,
  evidenceSetCount: 1,
  evidenceSetDigest: "b".repeat(64),
  scoreInputDigest: "c".repeat(64),
});

const scoreInputFacts = Object.freeze({
  scoreAsOf: "2026-07-31T00:00:00.000Z",
  signalClass: "direct_demand" as const,
  signalType: "supplier_registration",
  demandDomain: "robotics_hardware",
  status: "newly_discovered",
  temporalAnchors: {
    announcedAt: "2026-07-30T00:00:00.000Z",
    effectiveFrom: "2026-07-30T00:00:00.000Z",
    observedAt: "2026-07-31T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
  },
  responsePath: {
    type: "supplier_or_partner_registration",
    url: "https://example.com/suppliers",
    businessEmail: null,
  },
  indiaRelevance: {
    relevanceType: "globally_open" as const,
    rationale: "The public request accepts global suppliers.",
    reasons: ["Global suppliers are explicitly eligible."],
    constraints: [],
    unknowns: [],
    confidence: 90,
    regulatoryFacts: null,
    logisticsFacts: null,
  },
  sensitiveDataAndCompliance: {
    sensitiveDataFlags: { faces: null },
    complianceFacts: { consent: null },
  },
  assessedInputs: {
    actionabilityInput: 90,
    commercialPotential: 75,
  },
  contributorRoles: [
    { entityId: "entity-two", role: "supporting" },
    { entityId: "entity-one", role: "supporting" },
  ],
  entityCorporateGroups: [
    { entityId: "entity-two", canonicalCorporateGroupId: "group-two" },
    { entityId: "entity-one", canonicalCorporateGroupId: "group-one" },
  ],
  scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
  momentumPolicyVersion: null,
});

function directEvidence() {
  return {
    id: "a".repeat(64),
    sourceUrl: "https://example.com/suppliers",
    sourceName: "Example supplier notice",
    evidenceClaim: "Applications are open to suppliers worldwide.",
    contributorEntityId: "entity-one",
    evidenceConfidence: 88,
    publishedAt: "2026-07-30T00:00:00.000Z",
    observedAt: "2026-07-31T00:00:00.000Z",
    isPrimarySource: true,
    isSyndicated: false,
    sourceFamily: "official_partner_supplier_pages",
    supportedFieldPaths: [
      "directDemandAsk.supplier_registration",
      "signal.announcedAt",
      "indiaRelevance.globally_open.requirement_access",
      "responsePath",
      "scoreComponents.actionability",
      "scoreComponents.commercialPotential",
      "scoreComponents.repeatability",
      "scoreComponents.strategicLearning",
      "scoreComponents.complianceComplexity",
    ],
  } as const;
}

function directSemanticInput(
  snapshot: ReturnType<typeof createActiveScoreEvidenceSnapshot>,
  evidence: readonly ScoreEvidenceSource[] = [directEvidence()],
) {
  return {
    snapshot,
    signalType: "supplier_registration",
    indiaRelevanceType: "globally_open",
    actionabilityInput: 90,
    freshnessEvidencePath: "signal.announcedAt" as const,
    evidence,
  };
}

describe("Global Radar active score-evidence snapshots", () => {
  it("canonically fingerprints every persisted score input", () => {
    const digest = createGlobalRadarScoreInputDigest(scoreInputFacts);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      createGlobalRadarScoreInputDigest({
        ...scoreInputFacts,
        contributorRoles: [...scoreInputFacts.contributorRoles].reverse(),
        entityCorporateGroups: [
          ...scoreInputFacts.entityCorporateGroups,
        ].reverse(),
      }),
    ).toBe(digest);

    const oneFieldMutations = [
      {
        ...scoreInputFacts,
        scoreAsOf: "2026-07-31T00:00:01.000Z",
      },
      {
        ...scoreInputFacts,
        temporalAnchors: {
          ...scoreInputFacts.temporalAnchors,
          announcedAt: "2026-07-30T00:00:01.000Z",
        },
      },
      {
        ...scoreInputFacts,
        temporalAnchors: {
          ...scoreInputFacts.temporalAnchors,
          effectiveFrom: "2026-07-30T00:00:01.000Z",
        },
      },
      {
        ...scoreInputFacts,
        responsePath: {
          ...scoreInputFacts.responsePath,
          url: "https://example.com/alternate-suppliers",
        },
      },
      { ...scoreInputFacts, demandDomain: "robot_learning" },
      { ...scoreInputFacts, status: "monitoring" },
      {
        ...scoreInputFacts,
        entityCorporateGroups: [
          scoreInputFacts.entityCorporateGroups[0]!,
          {
            ...scoreInputFacts.entityCorporateGroups[1]!,
            canonicalCorporateGroupId: "alternate-group",
          },
        ],
      },
    ];
    for (const mutation of oneFieldMutations) {
      expect(createGlobalRadarScoreInputDigest(mutation)).not.toBe(digest);
    }
  });

  it("records exact score values and truthful worker/server authority", () => {
    const snapshot = createActiveScoreEvidenceSnapshot({
      ...scoreEvaluationMetadata,
      signalClass: "direct_demand",
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      assessmentAuthority: "worker",
      actionabilityInput: 90,
      freshnessEvidencePath: "signal.announcedAt",
      components: directComponents,
      evidence: [directEvidence()],
    });

    expect(snapshot).toMatchObject({
      snapshotVersion: GLOBAL_RADAR_ACTIVE_SCORE_SNAPSHOT_VERSION,
      evidenceVersion: GLOBAL_RADAR_SCORE_EVIDENCE_VERSION,
      signalClass: "direct_demand",
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      assessmentAuthority: "worker",
    });
    expect(snapshot.componentEvidence).toHaveLength(10);
    expect(snapshot.componentEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: "demandExplicitness",
          value: 100,
          basis: "server_derived",
          assessmentBasis: null,
          inputValue: null,
        }),
        expect.objectContaining({
          component: "commercialPotential",
          value: 75,
          basis: "worker_evidence",
          assessmentBasis: null,
          inputValue: null,
        }),
        expect.objectContaining({
          component: "actionability",
          value: 70,
          basis: "server_adjusted",
          assessmentBasis: "worker_evidence",
          inputValue: 90,
          evidence: [
            expect.objectContaining({
              evidenceFingerprint: "a".repeat(64),
              matchedFieldPaths: ["scoreComponents.actionability"],
            }),
          ],
        }),
      ]),
    );

    expect(
      parseActiveScoreEvidenceSnapshot(snapshot, {
        signalClass: "direct_demand",
        signalType: "supplier_registration",
        indiaRelevanceType: "globally_open",
        scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
        momentumPolicyVersion: null,
        scoreInputDigest: scoreEvaluationMetadata.scoreInputDigest,
        components: directComponents,
      }),
    ).toEqual(snapshot);
    expect(
      parseActiveScoreEvidenceSnapshot(snapshot, {
        signalClass: "direct_demand",
        signalType: "supplier_registration",
        indiaRelevanceType: "globally_open",
        scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
        momentumPolicyVersion: null,
        scoreInputDigest: "d".repeat(64),
        components: directComponents,
      }),
    ).toBeNull();
  });

  it("labels administrator assessments without relabeling deterministic values", () => {
    const snapshot = createActiveScoreEvidenceSnapshot({
      ...scoreEvaluationMetadata,
      signalClass: "direct_demand",
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      assessmentAuthority: "administrator",
      actionabilityInput: 90,
      freshnessEvidencePath: "signal.announcedAt",
      components: directComponents,
      evidence: [directEvidence()],
    });

    expect(snapshot.assessmentAuthority).toBe("administrator");

    expect(snapshot.componentEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: "commercialPotential",
          basis: "administrator_assessed",
        }),
        expect.objectContaining({
          component: "actionability",
          basis: "server_adjusted",
          assessmentBasis: "administrator_assessed",
          inputValue: 90,
        }),
        expect.objectContaining({
          component: "evidenceConfidence",
          basis: "server_derived",
        }),
      ]),
    );
  });

  it("fails closed for stale values, missing components, and unsafe citations", () => {
    const snapshot = createActiveScoreEvidenceSnapshot({
      ...scoreEvaluationMetadata,
      signalClass: "direct_demand",
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      assessmentAuthority: "worker",
      actionabilityInput: 90,
      freshnessEvidencePath: "signal.announcedAt",
      components: directComponents,
      evidence: [directEvidence()],
    });
    const expected = {
      signalClass: "direct_demand" as const,
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open" as const,
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      components: directComponents,
    };
    const stale = {
      ...snapshot,
      componentEvidence: [
        { ...snapshot.componentEvidence[0]!, value: 99 },
        ...snapshot.componentEvidence.slice(1),
      ],
    };
    const incomplete = {
      ...snapshot,
      componentEvidence: snapshot.componentEvidence.slice(0, -1),
    };
    const unsafe = {
      ...snapshot,
      privateClaim: "must never survive strict parsing",
    };
    const invalidFingerprint = {
      ...snapshot,
      componentEvidence: [
        {
          ...snapshot.componentEvidence[0]!,
          evidence: [
            {
              ...snapshot.componentEvidence[0]!.evidence[0]!,
              evidenceFingerprint: "not-a-fingerprint",
            },
          ],
        },
        ...snapshot.componentEvidence.slice(1),
      ],
    };
    const duplicateMatchedPath = {
      ...snapshot,
      componentEvidence: [
        {
          ...snapshot.componentEvidence[0]!,
          evidence: [
            {
              ...snapshot.componentEvidence[0]!.evidence[0]!,
              matchedFieldPaths: [
                snapshot.componentEvidence[0]!.evidence[0]!
                  .matchedFieldPaths[0]!,
                snapshot.componentEvidence[0]!.evidence[0]!
                  .matchedFieldPaths[0]!,
              ],
            },
          ],
        },
        ...snapshot.componentEvidence.slice(1),
      ],
    };
    const mixedAuthority = {
      ...snapshot,
      componentEvidence: snapshot.componentEvidence.map((association) =>
        association.component === "commercialPotential"
          ? { ...association, basis: "administrator_assessed" }
          : association,
      ),
    };

    expect(parseActiveScoreEvidenceSnapshot(stale, expected)).toBeNull();
    expect(parseActiveScoreEvidenceSnapshot(incomplete, expected)).toBeNull();
    expect(parseActiveScoreEvidenceSnapshot(unsafe, expected)).toBeNull();
    expect(
      parseActiveScoreEvidenceSnapshot(invalidFingerprint, expected),
    ).toBeNull();
    expect(
      parseActiveScoreEvidenceSnapshot(duplicateMatchedPath, expected),
    ).toBeNull();
    expect(
      parseActiveScoreEvidenceSnapshot(mixedAuthority, expected),
    ).toBeNull();
    expect(
      parseActiveScoreEvidenceSnapshot(snapshot, {
        ...expected,
        signalType: "procurement",
      }),
    ).toBeNull();
    expect(
      parseActiveScoreEvidenceSnapshot(snapshot, {
        ...expected,
        indiaRelevanceType: "explicit_India",
      }),
    ).toBeNull();
  });

  it("rejects structurally valid citation-path, rationale, fingerprint, and input tampering", () => {
    const evidenceWithMislabeledIndiaPath = {
      ...directEvidence(),
      supportedFieldPaths: [
        ...directEvidence().supportedFieldPaths,
        "indiaRelevance.globally_open.manufacturing",
      ],
    };
    const snapshot = createActiveScoreEvidenceSnapshot({
      ...scoreEvaluationMetadata,
      signalClass: "direct_demand",
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      assessmentAuthority: "worker",
      actionabilityInput: 90,
      freshnessEvidencePath: "signal.announcedAt",
      components: directComponents,
      evidence: [evidenceWithMislabeledIndiaPath],
    });
    expect(
      hasValidActiveScoreEvidenceCitations(
        directSemanticInput(snapshot, [evidenceWithMislabeledIndiaPath]),
      ),
    ).toBe(true);

    const replaceComponent = (
      component: string,
      replacement: (
        association: (typeof snapshot.componentEvidence)[number],
      ) => (typeof snapshot.componentEvidence)[number],
    ) => ({
      ...snapshot,
      componentEvidence: snapshot.componentEvidence.map((association) =>
        association.component === component
          ? replacement(association)
          : association,
      ),
    });
    const wrongDynamicPath = replaceComponent(
      "demandExplicitness",
      (association) => ({
        ...association,
        evidence: association.evidence.map((citation) => ({
          ...citation,
          matchedFieldPaths: ["directDemandAsk.procurement"],
        })),
      }),
    );
    const wrongRationale = replaceComponent(
      "commercialPotential",
      (association) => ({
        ...association,
        rationale: "A plausible but non-canonical explanation.",
      }),
    );
    const unrelatedFingerprint = "b".repeat(64);
    const wrongFingerprint = replaceComponent(
      "commercialPotential",
      (association) => ({
        ...association,
        evidence: association.evidence.map((citation) => ({
          ...citation,
          evidenceFingerprint: unrelatedFingerprint,
        })),
      }),
    );
    const wrongInput = replaceComponent("actionability", (association) => ({
      ...association,
      inputValue: 89,
    }));
    const invalidIndiaPath = replaceComponent("indiaFit", (association) => ({
      ...association,
      evidence: association.evidence.map((citation) => ({
        ...citation,
        matchedFieldPaths: ["indiaRelevance.globally_open.manufacturing"],
      })),
    }));
    const expected = {
      signalClass: "direct_demand" as const,
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open" as const,
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      components: directComponents,
    };
    const unrelatedEvidence = {
      ...directEvidence(),
      id: unrelatedFingerprint,
      sourceUrl: "https://unrelated.example/update",
      sourceName: "Unrelated update",
      supportedFieldPaths: ["signal.factualSummary"],
    };
    for (const [candidate, evidence] of [
      [wrongDynamicPath, [evidenceWithMislabeledIndiaPath]],
      [wrongRationale, [evidenceWithMislabeledIndiaPath]],
      [
        wrongFingerprint,
        [evidenceWithMislabeledIndiaPath, unrelatedEvidence],
      ],
      [wrongInput, [evidenceWithMislabeledIndiaPath]],
      [invalidIndiaPath, [evidenceWithMislabeledIndiaPath]],
    ] as const) {
      const parsed = parseActiveScoreEvidenceSnapshot(candidate, expected);
      expect(parsed).not.toBeNull();
      if (!parsed) throw new Error("Tamper fixture was not structurally valid.");
      expect(
        hasValidActiveScoreEvidenceCitations(
          directSemanticInput(parsed, evidence),
        ),
      ).toBe(false);
    }
  });

  it("does not create or hydrate India-fit citations from a negated positive path", () => {
    const negated = {
      ...directEvidence(),
      evidenceClaim: "Applications are not currently open worldwide.",
    };
    const input = {
      ...scoreEvaluationMetadata,
      signalClass: "direct_demand" as const,
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open" as const,
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      assessmentAuthority: "worker" as const,
      actionabilityInput: 90,
      freshnessEvidencePath: "signal.announcedAt" as const,
      components: directComponents,
      evidence: [negated],
    };

    expect(() => createActiveScoreEvidenceSnapshot(input)).toThrow(
      "Missing public evidence association for active score component: indiaFit",
    );
    const validSnapshot = createActiveScoreEvidenceSnapshot({
      ...input,
      evidence: [directEvidence()],
    });
    expect(
      hasValidActiveScoreEvidenceCitations(
        directSemanticInput(validSnapshot, [negated]),
      ),
    ).toBe(false);
  });

  it("selects official direct-demand and primary response-path evidence", () => {
    const primary = directEvidence();
    const ineligible = {
      ...primary,
      id: "d".repeat(64),
      sourceUrl: "https://commentary.example/suppliers",
      sourceName: "Third-party commentary",
      isPrimarySource: false,
      sourceFamily: "research_and_institutional_publications",
    } as const;
    const snapshot = createActiveScoreEvidenceSnapshot({
      ...scoreEvaluationMetadata,
      signalClass: "direct_demand",
      signalType: "supplier_registration",
      indiaRelevanceType: "globally_open",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: null,
      assessmentAuthority: "worker",
      actionabilityInput: 90,
      freshnessEvidencePath: "signal.announcedAt",
      components: directComponents,
      evidence: [ineligible, primary],
    });
    for (const component of ["demandExplicitness", "responseAccessibility"]) {
      expect(
        snapshot.componentEvidence.find(
          (association) => association.component === component,
        )?.evidence.map(({ evidenceFingerprint }) => evidenceFingerprint),
      ).toEqual([primary.id]);
    }
  });

  it("preserves raw momentum counts above one hundred", () => {
    const source = directEvidence();
    const evidence = [
      {
        ...source,
        id: "b".repeat(64),
        contributorEntityId: "entity-one",
        supportedFieldPaths: [
          "momentumMetrics.taxonomyConsistency",
          "momentumMetrics.evidenceQuality",
        ],
      },
      {
        ...source,
        id: "c".repeat(64),
        contributorEntityId: "entity-two",
        sourceUrl: "https://second.example.com/direction",
        sourceName: "Second direction notice",
        sourceFamily: "official_company_newsrooms",
        supportedFieldPaths: ["signal.factualSummary"],
      },
    ] as const;
    const components = {
      independentEntityCount: 103,
      primarySourceCount: 101,
      sourceFamilyCount: 2,
      volume7Days: 12,
      volume30Days: 103,
      volume90Days: 205,
      independentEntityBreadth: 90,
      primarySourceDepth: 85,
      sourceDiversity: 80,
      weightedVolume: 75,
      growthVsPreviousPeriod: 70,
      taxonomyConsistency: 88,
      evidenceQuality: 86,
    } as const;
    const snapshot = createActiveScoreEvidenceSnapshot({
      ...scoreEvaluationMetadata,
      signalClass: "ecosystem_momentum",
      signalType: "ecosystem_direction",
      indiaRelevanceType: "inferred_India_compatible",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
      assessmentAuthority: "administrator",
      actionabilityInput: null,
      momentumContributorEntityIds: ["entity-one", "entity-two"],
      components,
      evidence,
    });

    expect(snapshot.componentEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: "volume30Days", value: 103 }),
        expect.objectContaining({
          component: "taxonomyConsistency",
          basis: "administrator_assessed",
        }),
      ]),
    );
    expect(
      hasValidActiveScoreEvidenceCitations({
        snapshot,
        signalType: "ecosystem_direction",
        indiaRelevanceType: "inferred_India_compatible",
        momentumContributorEntityIds: ["entity-one", "entity-two"],
        evidence,
      }),
    ).toBe(true);
    expect(
      hasValidActiveScoreEvidenceCitations({
        snapshot,
        signalType: "ecosystem_direction",
        indiaRelevanceType: "inferred_India_compatible",
        momentumContributorEntityIds: ["entity-one", "entity-two"],
        evidence: evidence.map((item) =>
          item.id === "b".repeat(64)
            ? { ...item, isSyndicated: true }
            : item,
        ),
      }),
    ).toBe(false);
    expect(
      hasValidActiveScoreEvidenceCitations({
        snapshot,
        signalType: "ecosystem_direction",
        indiaRelevanceType: "inferred_India_compatible",
        momentumContributorEntityIds: ["entity-two"],
        evidence,
      }),
    ).toBe(false);
    expect(
      parseActiveScoreEvidenceSnapshot(snapshot, {
        signalClass: "ecosystem_momentum",
        signalType: "ecosystem_direction",
        indiaRelevanceType: "inferred_India_compatible",
        scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
        momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
        components,
      }),
    ).toEqual(snapshot);
  });

  it("requires an exact empty-window proof for citation-free deterministic momentum", () => {
    const base = directEvidence();
    const evidence = [
      {
        ...base,
        id: "7".repeat(64),
        contributorEntityId: "entity-one",
        publishedAt: "2026-01-01T00:00:00.000Z",
        observedAt: "2026-01-01T00:00:00.000Z",
        supportedFieldPaths: [
          "momentumMetrics.taxonomyConsistency",
          "momentumMetrics.evidenceQuality",
        ],
      },
      {
        ...base,
        id: "8".repeat(64),
        contributorEntityId: "entity-two",
        sourceUrl: "https://second.example.com/aged-direction",
        sourceName: "Second aged direction notice",
        publishedAt: "2026-01-02T00:00:00.000Z",
        observedAt: "2026-01-02T00:00:00.000Z",
        supportedFieldPaths: ["signal.factualSummary"],
      },
    ] as const;
    const components = {
      independentEntityCount: 0,
      primarySourceCount: 0,
      sourceFamilyCount: 0,
      volume7Days: 0,
      volume30Days: 0,
      volume90Days: 0,
      independentEntityBreadth: 0,
      primarySourceDepth: 0,
      sourceDiversity: 0,
      weightedVolume: 0,
      growthVsPreviousPeriod: 0,
      taxonomyConsistency: 88,
      evidenceQuality: 86,
    } as const;
    const citedSnapshot = createActiveScoreEvidenceSnapshot({
      ...scoreEvaluationMetadata,
      signalClass: "ecosystem_momentum",
      signalType: "ecosystem_direction",
      indiaRelevanceType: "inferred_India_compatible",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
      assessmentAuthority: "administrator",
      actionabilityInput: null,
      momentumContributorEntityIds: ["entity-one", "entity-two"],
      components,
      evidence,
    });
    const citationFreeComponentEvidence = citedSnapshot.componentEvidence.map(
      (association) =>
        association.component === "taxonomyConsistency" ||
        association.component === "evidenceQuality"
          ? association
          : {
              ...association,
              rationale:
                "Server-derived from an empty eligible active evidence window; no source is cited because absence is not affirmative public evidence.",
              evidence: [],
            },
    );
    const emptyWindowSnapshot = {
      ...citedSnapshot,
      emptyMomentumEvidenceWindow: {
        asOf: "2026-08-02T00:00:00.000Z",
        maximumAgeDays: 180,
        eligibleEvidenceCount: 0,
      },
      componentEvidence: citationFreeComponentEvidence,
    };
    const expected = {
      signalClass: "ecosystem_momentum" as const,
      signalType: "ecosystem_direction",
      indiaRelevanceType: "inferred_India_compatible" as const,
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
      components,
    };

    expect(
      parseActiveScoreEvidenceSnapshot(
        {
          ...emptyWindowSnapshot,
          emptyMomentumEvidenceWindow: undefined,
        },
        expected,
      ),
    ).toBeNull();
    const parsed = parseActiveScoreEvidenceSnapshot(
      emptyWindowSnapshot,
      expected,
    );
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("Empty-window snapshot was not parsed.");
    expect(
      hasValidActiveScoreEvidenceCitations({
        snapshot: parsed,
        signalType: "ecosystem_direction",
        indiaRelevanceType: "inferred_India_compatible",
        momentumContributorEntityIds: ["entity-one", "entity-two"],
        evidence,
      }),
    ).toBe(true);
    expect(
      hasValidActiveScoreEvidenceCitations({
        snapshot: parsed,
        signalType: "ecosystem_direction",
        indiaRelevanceType: "inferred_India_compatible",
        momentumContributorEntityIds: ["entity-one", "entity-two"],
        evidence: [
          {
            ...evidence[0],
            observedAt: "2026-08-01T00:00:00.000Z",
          },
          evidence[1],
        ],
      }),
    ).toBe(false);
    expect(
      parseActiveScoreEvidenceSnapshot(
        {
          ...emptyWindowSnapshot,
          componentEvidence: emptyWindowSnapshot.componentEvidence.map(
            (association) =>
              association.component === "volume30Days"
                ? citedSnapshot.componentEvidence.find(
                    ({ component }) => component === "volume30Days",
                  )!
                : association,
          ),
        },
        expected,
      ),
    ).toBeNull();
  });

  it("preserves exact old assessed citations while deriving replacements only from active evidence", () => {
    const base = directEvidence();
    const oldAssessedSource = {
      ...base,
      id: "e".repeat(64),
      contributorEntityId: "entity-one",
      observedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: "2026-01-01T00:00:00.000Z",
      supportedFieldPaths: [
        "momentumMetrics.taxonomyConsistency",
        "momentumMetrics.evidenceQuality",
      ],
    } as const;
    const oldScopeSource = {
      ...base,
      id: "f".repeat(64),
      contributorEntityId: "entity-two",
      sourceUrl: "https://old-scope.example/direction",
      sourceName: "Old scope evidence",
      observedAt: "2026-01-02T00:00:00.000Z",
      publishedAt: "2026-01-02T00:00:00.000Z",
      supportedFieldPaths: ["signal.factualSummary"],
    } as const;
    const components = {
      independentEntityCount: 2,
      primarySourceCount: 2,
      sourceFamilyCount: 2,
      volume7Days: 2,
      volume30Days: 2,
      volume90Days: 2,
      independentEntityBreadth: 80,
      primarySourceDepth: 80,
      sourceDiversity: 80,
      weightedVolume: 80,
      growthVsPreviousPeriod: 80,
      taxonomyConsistency: 88,
      evidenceQuality: 86,
    } as const;
    const existingSnapshot = createActiveScoreEvidenceSnapshot({
      ...scoreEvaluationMetadata,
      signalClass: "ecosystem_momentum",
      signalType: "ecosystem_direction",
      indiaRelevanceType: "inferred_India_compatible",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
      assessmentAuthority: "administrator",
      actionabilityInput: null,
      momentumContributorEntityIds: ["entity-one", "entity-two"],
      components,
      evidence: [oldAssessedSource, oldScopeSource],
    });
    const activeSource = {
      ...base,
      id: "9".repeat(64),
      contributorEntityId: "entity-two",
      sourceUrl: "https://active.example/direction",
      sourceName: "Active momentum evidence",
      observedAt: "2026-08-01T00:00:00.000Z",
      publishedAt: "2026-08-01T00:00:00.000Z",
      supportedFieldPaths: ["signal.factualSummary"],
    } as const;
    const toStored = (source: ScoreEvidenceSource) => ({
      evidenceFingerprint: source.id,
      sourceUrl: source.sourceUrl,
      sourceName: source.sourceName,
      evidenceClaim: source.evidenceClaim,
      globalEntityId: source.contributorEntityId,
      evidenceConfidence: source.evidenceConfidence,
      publishedAt:
        source.publishedAt === null ? null : new Date(source.publishedAt),
      observedAt: new Date(source.observedAt),
      isPrimarySource: source.isPrimarySource,
      isSyndicated: source.isSyndicated,
      sourceFamily: source.sourceFamily,
      supportedFieldPaths: source.supportedFieldPaths,
    });
    const nextComponents = { ...components, volume7Days: 1 };

    const rebased = rebaseStoredScoreEvidenceSnapshot({
      scoreInputDigest: existingSnapshot.scoreInputDigest,
      existingSnapshot,
      signalClass: "ecosystem_momentum",
      signalType: "ecosystem_direction",
      currentIndiaRelevanceType: "inferred_India_compatible",
      nextIndiaRelevanceType: "inferred_India_compatible",
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
      currentComponents: components,
      nextComponents,
      replacementComponents: [
        "independentEntityCount",
        "primarySourceCount",
        "sourceFamilyCount",
        "volume7Days",
        "volume30Days",
        "volume90Days",
        "independentEntityBreadth",
        "primarySourceDepth",
        "sourceDiversity",
        "weightedVolume",
        "growthVsPreviousPeriod",
      ],
      momentumContributorEntityIds: ["entity-one", "entity-two"],
      announcedAt: null,
      effectiveFrom: null,
      existingEvidence: [
        toStored(oldAssessedSource),
        toStored(oldScopeSource),
      ],
      evidence: [toStored(activeSource)],
    });

    expect(
      rebased.componentEvidence.find(
        ({ component }) => component === "taxonomyConsistency",
      ),
    ).toEqual(
      existingSnapshot.componentEvidence.find(
        ({ component }) => component === "taxonomyConsistency",
      ),
    );
    expect(
      rebased.componentEvidence.find(
        ({ component }) => component === "volume7Days",
      ),
    ).toMatchObject({
      value: 1,
      evidence: [
        expect.objectContaining({ evidenceFingerprint: activeSource.id }),
      ],
    });
  });

  it("rejects a precursor horizon without its effective-date anchor", () => {
    expect(() =>
      createStoredScoreEvidenceSnapshot({
        scoreInputDigest: "c".repeat(64),
        scoreAsOf: new Date("2026-07-31T00:00:00.000Z"),
        signalClass: "demand_precursor",
        signalType: "funding",
        indiaRelevanceType: "globally_open",
        scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
        momentumPolicyVersion: null,
        assessmentAuthority: "worker",
        actionabilityInput: null,
        announcedAt: null,
        effectiveFrom: null,
        components: { estimatedTimeHorizon: 65 },
        evidence: [],
      }),
    ).toThrow("Invalid stored Global Radar time-horizon provenance.");
  });
});
