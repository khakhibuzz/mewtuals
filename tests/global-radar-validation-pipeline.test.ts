import { describe, expect, it } from "vitest";

import * as globalRadarDomain from "../app/domain/global-radar";
import {
  canonicalizeGlobalRadarPersistenceBatch,
  createGlobalRadarPersistenceHash,
  persistableGlobalRadarBatchObjectSchema,
} from "../app/domain/global-radar/persistence";
import { createQueryFingerprint } from "../app/domain/global-radar/normalization";
import { createWorkerScoreEvidenceSnapshot } from "../db/repositories/global-radar-score-evidence";
import {
  globalRadarValidationProposalSchema,
  validateGlobalRadarBatch,
  type RadarValidationContext,
} from "../app/domain/global-radar/validation-pipeline";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_FINGERPRINT = "a".repeat(64);
const OBSERVED_AT = "2026-07-29T18:01:00.000Z";
const SOURCE_URL = "https://acme.example/public-request";

const ALL_UNKNOWN_SENSITIVE_DATA = {
  faces: null,
  voices: null,
  biometrics: null,
  gaze: null,
  health: null,
  children: null,
  home_interiors: null,
  workplace_monitoring: null,
  precise_location: null,
  road_users: null,
  employee_data: null,
  industrial_secrets: null,
  defence_or_dual_use: null,
  copyrighted_material: null,
  export_controls: null,
} as const;

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    kind: "physical_data",
    capabilityTag: "teleoperated_trajectories",
    summary: "Teleoperated manipulation trajectories with reviewed outcomes.",
    dataFamilies: ["robot trajectories"],
    sensorModalities: ["rgb"],
    environments: ["warehouse"],
    taskFamilies: ["manipulation"],
    collectionMethods: ["teleoperation"],
    humanRoles: ["teleoperator"],
    robotEmbodiments: ["mobile manipulator"],
    indianExecutionArchetypes: ["robotics_data_company"],
    scaleSpecifications: null,
    technicalSpecifications: null,
    qualitySpecifications: null,
    rightsAndComplianceSpecifications: null,
    confidence: 85,
    globallyDeliverable: true,
    openToExternalCounterparties: true,
    ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    contributorEntityRef: "entity-acme",
    sourceUrl: SOURCE_URL,
    canonicalSourceUrl: SOURCE_URL,
    sourceName: "Acme Robotics",
    sourceType: "official_request",
    sourceKind: "original",
    sourceLanguage: "en",
    sourceCountry: "United States",
    sourceFamily: "official_company_material",
    claim:
      "Acme requests India suppliers to collect teleoperated robot trajectories through its public request page.",
    excerpt: "Seeking India suppliers for teleoperated data collection.",
    englishSummary:
      "Acme publicly requests India suppliers for teleoperated robot data collection.",
    publishedAt: "2026-07-29T00:00:00.000Z",
    observedAt: OBSERVED_AT,
    evidenceConfidence: 90,
    translationConfidence: null,
    isPrimarySource: true,
    isOfficialProcurementSource: false,
    isSyndicated: false,
    supportsDirectDemand: true,
    supportsIndiaRelevance: true,
    supportedFieldPaths: [
      "signal.factualSummary",
      "signal.announcedAt",
      "signal.effectiveFrom",
      "directDemandAsk.data_collection_request",
      "indiaRelevance.explicit_India.collection",
      "responsePath",
      "scoreComponents.actionability",
      "scoreComponents.commercialPotential",
      "scoreComponents.repeatability",
      "scoreComponents.strategicLearning",
      "scoreComponents.complianceComplexity",
    ],
    rawMetadata: {},
    ...overrides,
  };
}

function systemsContext() {
  return {
    stackType: "physical_data",
    higherLevelSystemGoal: "Improve robot-learning model reliability.",
    relevantStackLayer: "annotation",
    lowerLevelInputsRequired: ["real_world_access", "sensor_capture"],
    transformationOrCapabilityAdded:
      "Convert captured trajectories into reviewed training examples.",
    downstreamModelOrRobotBehavior:
      "Robots generalize manipulation skills across environments.",
    whyTheRequirementMatters:
      "Reliable trajectories make physical policy learning measurable.",
    possibleIndianExecutionRole:
      "An Indian operator can run evidence-backed teleoperation workflows.",
    factualElements: ["The organisation requested trajectory data."],
    inferredElements: ["India could supply compliant operations."],
    systemsContextSummary: Array.from(
      { length: 80 },
      (_, index) => `context${index}`,
    ).join(" "),
  };
}

function directSignal(overrides: Record<string, unknown> = {}) {
  return {
    externalSignalId: "signal-acme-request",
    signalClass: "direct_demand",
    primaryEntityRef: "entity-acme",
    associatedEntities: [],
    demandDomain: "robot_learning_and_manipulation",
    signalType: "data_collection_request",
    directDemandAsk: {
      type: "data_collection_request",
      isExplicit: true,
      expiresAt: "2026-08-29T00:00:00.000Z",
    },
    precursorDevelopmentType: null,
    momentumMetrics: null,
    title: "Acme requests teleoperated robot trajectories",
    factualSummary:
      "Acme published a current request for teleoperated robot trajectories.",
    interpretationSummary:
      "Mewtuals interprets the public request as external physical-data demand.",
    theme: "robot_teleoperation_demonstrations",
    sourceCountry: "United States",
    targetGeographies: ["India"],
    collectionGeographies: ["India"],
    manufacturingGeographies: null,
    deliveryGeographies: ["Global"],
    industry: "robotics",
    targetModelOrSystem: null,
    indiaRelevance: {
      proposedType: "explicit_India",
      rationale: "The official request explicitly includes India.",
      reasons: ["India is named as an eligible collection geography."],
      constraints: [],
      unknowns: [],
      confidence: 90,
      regulatoryFacts: null,
      logisticsFacts: null,
    },
    scoreComponents: {
      explicitness: 5,
      evidenceConfidence: 5,
      freshness: 5,
      actionability: 80,
      indiaFit: 5,
      commercialPotential: 80,
      repeatability: 80,
      responseAccessibility: 5,
      strategicLearning: 80,
      complianceComplexity: 20,
    },
    announcedAt: "2026-07-29T00:00:00.000Z",
    effectiveFrom: "2026-07-29T00:00:00.000Z",
    evergreen: false,
    reobserveBy: null,
    responsePath: {
      type: "supplier_or_partner_registration",
      url: SOURCE_URL,
      businessEmail: null,
      evidenceUrl: SOURCE_URL,
    },
    systemsContext: systemsContext(),
    sensitiveDataAndCompliance: {
      sensitiveDataFlags: ALL_UNKNOWN_SENSITIVE_DATA,
      complianceFacts: {
        consent: null,
        deIdentification: null,
        legalReview: null,
        knownResidencyRequirements: null,
        participantRightsComplexity: null,
      },
    },
    rawMetadata: {},
    requirements: [requirement()],
    evidence: [evidence()],
    ...overrides,
  };
}

function precursorSignal(overrides: Record<string, unknown> = {}) {
  return directSignal({
    externalSignalId: "signal-acme-funding",
    signalClass: "demand_precursor",
    signalType: "hiring",
    directDemandAsk: null,
    precursorDevelopmentType: "funding",
    momentumMetrics: null,
    scoreComponents: {
      evidenceConfidence: 5,
      proximityToExternalDemand: 80,
      fundingDeploymentMomentum: 80,
      likelyDataHardwareIntensity: 80,
      indiaFit: 5,
      estimatedTimeHorizon: 5,
      strategicRelevance: 80,
    },
    evergreen: null,
    reobserveBy: null,
    responsePath: null,
    indiaRelevance: {
      proposedType: "no_current_India_fit",
      rationale: "No current India fit is publicly supported.",
      reasons: [],
      constraints: [],
      unknowns: ["Future counterparties remain unknown."],
      confidence: 70,
      regulatoryFacts: null,
      logisticsFacts: null,
    },
    evidence: [
      evidence({
        claim:
          "Acme announced new funding for a robotics deployment and facility expansion.",
        englishSummary:
          "Acme announced funding for a robotics deployment and facility expansion.",
        supportsDirectDemand: false,
        supportsIndiaRelevance: false,
        supportedFieldPaths: [
          "signal.factualSummary",
          "signal.effectiveFrom",
          "precursorDevelopment.funding",
          "scoreComponents.proximityToExternalDemand",
          "scoreComponents.fundingDeploymentMomentum",
          "scoreComponents.likelyDataHardwareIntensity",
          "scoreComponents.strategicRelevance",
        ],
      }),
    ],
    ...overrides,
  });
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "global-radar-batch-v1",
    promptVersion: "codex-public-web-v1",
    taxonomyVersion: "global-radar-v1",
    runId: RUN_ID,
    planFingerprint: PLAN_FINGERPRINT,
    executedQueries: [],
    entities: [
      {
        entityRef: "entity-acme",
        canonicalName: "Acme Robotics",
        websiteUrl: "https://acme.example/about",
        linkedinOrganizationUrl:
          "https://www.linkedin.com/company/acme-robotics/",
        stablePublicIdentifiers: [
          { namespace: "official_registry", value: "acme-robotics" },
        ],
        canonicalCorporateGroupId: "group:acme-robotics" as string | null,
        headquartersCountry: "United States",
        headquartersCity: "Austin",
        operatingCountries: ["United States", "India"],
        organisationType: "robotics_company",
        sector: "robotics",
        shortDescription: "Builds public robot-learning systems.",
        rawMetadata: {},
      },
    ],
    signals: [directSignal()],
    sourceErrors: [],
    ...overrides,
  };
}

function executedQuery(overrides: Record<string, unknown> = {}) {
  return {
    fingerprint: "b".repeat(64),
    query: "robotics supplier registration",
    language: "en",
    sourceCountry: "United States",
    theme: "robot_teleoperation_demonstrations",
    signalIntent: "direct_demand",
    sourceAdapter: "codex_public_web",
    recencyDays: 30,
    ordinal: 0,
    executedAt: "2026-07-29T18:00:00.000Z",
    resultsExamined: 4,
    error: null,
    ...overrides,
  };
}

function momentumBatch() {
  const proposal = structuredClone(batch());
  proposal.entities.push({
    ...proposal.entities[0]!,
    entityRef: "entity-beta",
    canonicalName: "Beta Robotics",
    websiteUrl: "https://beta.example",
    linkedinOrganizationUrl: "https://www.linkedin.com/company/beta-robotics",
    stablePublicIdentifiers: [
      { namespace: "official_registry", value: "beta-robotics" },
    ],
    canonicalCorporateGroupId: "group:beta-robotics",
  });
  proposal.signals = [
    directSignal({
      externalSignalId: "signal-robotics-momentum",
      signalClass: "ecosystem_momentum",
      signalType: "ecosystem_direction",
      primaryEntityRef: null,
      associatedEntities: [
        { entityRef: "entity-acme", role: "contributor", confidence: 90 },
        { entityRef: "entity-beta", role: "contributor", confidence: 85 },
      ],
      directDemandAsk: null,
      precursorDevelopmentType: null,
      momentumMetrics: { taxonomyConsistency: 90, evidenceQuality: 90 },
      scoreComponents: null,
      evergreen: null,
      reobserveBy: null,
      responsePath: null,
      systemsContext: null,
      indiaRelevance: {
        proposedType: "no_current_India_fit",
        rationale: "No current India fit is publicly supported.",
        reasons: [],
        constraints: [],
        unknowns: ["Future counterparties remain unknown."],
        confidence: 70,
        regulatoryFacts: null,
        logisticsFacts: null,
      },
      evidence: [
        evidence({
          contributorEntityRef: "entity-acme",
          supportsDirectDemand: false,
          supportsIndiaRelevance: false,
          supportedFieldPaths: [
            "signal.factualSummary",
            "momentumMetrics.taxonomyConsistency",
            "momentumMetrics.evidenceQuality",
          ],
        }),
        evidence({
          contributorEntityRef: "entity-beta",
          sourceUrl: "https://beta.example/research-direction",
          canonicalSourceUrl: "https://beta.example/research-direction",
          sourceName: "Beta Robotics",
          sourceFamily: "official_research",
          claim:
            "Beta published a physical AI research direction for robot learning.",
          englishSummary:
            "Beta published a physical AI direction focused on robot learning.",
          supportsDirectDemand: false,
          supportsIndiaRelevance: false,
          supportedFieldPaths: ["signal.factualSummary"],
        }),
      ],
    }),
  ];
  return proposal;
}

const context: RadarValidationContext = {
  clock: { now: () => new Date("2026-07-31T00:00:00.000Z") },
  expectedRunId: RUN_ID,
  expectedPlanFingerprint: PLAN_FINGERPRINT,
};

function validate(input: unknown) {
  return validateGlobalRadarBatch(input, context);
}

describe("Global Radar server-authoritative validation pipeline", () => {
  it("exposes the Task 12 evidence and pipeline boundary", () => {
    expect({
      evidence: globalRadarDomain.normalizeRadarEvidence,
      proposal: globalRadarDomain.globalRadarValidationProposalSchema,
      validate: globalRadarDomain.validateGlobalRadarBatch,
    }).toEqual({
      evidence: expect.any(Function),
      proposal: globalRadarValidationProposalSchema,
      validate: validateGlobalRadarBatch,
    });
  });

  it("strictly parses the rich factual proposal independently of Task 1", () => {
    expect(globalRadarValidationProposalSchema.safeParse(batch()).success).toBe(
      true,
    );
    expect(
      globalRadarValidationProposalSchema.safeParse({
        ...batch(),
        workerSecret: "must-not-pass",
      }).success,
    ).toBe(false);
    expect(
      globalRadarValidationProposalSchema.safeParse({
        ...batch(),
        signals: [{ ...directSignal(), unclassified: true }],
      }).success,
    ).toBe(false);
    expect(
      globalRadarValidationProposalSchema.safeParse({
        ...batch(),
        signals: [
          directSignal({ factualSummary: "<article>copied page</article>" }),
        ],
      }).success,
    ).toBe(false);
  });

  it("applies recursive sensitive-record guards to every rich metadata carrier", () => {
    const unsafeRecord = {
      publicSummary: "Authorization: Bearer private-radar-worker-value",
    };
    const indiaRelevance = directSignal().indiaRelevance;
    const proposals = [
      batch({
        entities: [{ ...batch().entities[0]!, rawMetadata: unsafeRecord }],
      }),
      batch({ signals: [directSignal({ rawMetadata: unsafeRecord })] }),
      batch({
        signals: [
          directSignal({ evidence: [evidence({ rawMetadata: unsafeRecord })] }),
        ],
      }),
      batch({
        signals: [
          directSignal({
            indiaRelevance: {
              ...indiaRelevance,
              regulatoryFacts: unsafeRecord,
            },
          }),
        ],
      }),
      batch({
        signals: [
          directSignal({
            indiaRelevance: {
              ...indiaRelevance,
              logisticsFacts: unsafeRecord,
            },
          }),
        ],
      }),
      ...[
        "rawMetadata",
        "scaleSpecifications",
        "technicalSpecifications",
        "qualitySpecifications",
        "rightsAndComplianceSpecifications",
      ].map((field) =>
        batch({
          signals: [
            directSignal({
              requirements: [requirement({ [field]: unsafeRecord })],
            }),
          ],
        }),
      ),
    ];

    expect(
      proposals.map(
        (proposal) =>
          globalRadarValidationProposalSchema.safeParse(proposal).success,
      ),
    ).toEqual(proposals.map(() => false));
  });

  it("rejects sensitive strings from every rich proposal and normalized batch field", () => {
    const credential =
      "Authorization: Bearer private-radar-worker-credential-value";
    const proposals = [
      batch({
        entities: [
          { ...batch().entities[0]!, shortDescription: credential },
        ],
      }),
      batch({
        executedQueries: [executedQuery({ query: credential })],
      }),
      batch({
        signals: [directSignal({ factualSummary: credential })],
      }),
      batch({
        signals: [
          directSignal({
            evidence: [evidence({ claim: credential })],
          }),
        ],
      }),
      batch({
        signals: [
          directSignal({
            requirements: [requirement({ summary: credential })],
          }),
        ],
      }),
    ];

    expect(
      proposals.map(
        (proposal) =>
          globalRadarValidationProposalSchema.safeParse(proposal).success,
      ),
    ).toEqual(proposals.map(() => false));
    for (const proposal of proposals) {
      expect(() => validate(proposal)).toThrow(
        "Invalid Global Radar validation proposal: proposal contains sensitive content",
      );
    }

    const validated = validate(batch());
    const tampered = {
      ...validated,
      entities: [
        { ...validated.entities[0]!, shortDescription: credential },
      ],
    };
    expect(persistableGlobalRadarBatchObjectSchema.safeParse(tampered).success).toBe(
      false,
    );
    expect(canonicalizeGlobalRadarPersistenceBatch(tampered)).toEqual({
      valid: false,
      reason: "invalid_batch",
    });
  });

  it("recomputes the complete persistence graph and validates it twice", () => {
    const validated = validate(batch());

    expect(validated.signals).toHaveLength(1);
    const signal = validated.signals[0]!;
    expect(signal).toMatchObject({
      signalClass: "direct_demand",
      actionabilityInput: 80,
      initialStatus: "needs_review",
      taxonomyVersion: "global-radar-v1",
      extractionMethod: "codex_public_web",
      primaryEntityRef: "entity-acme",
      targetCapabilityTags: ["teleoperated_trajectories"],
      requiredCounterpartyArchetypes: ["robotics_data_company"],
      targetModelOrSystem: null,
      indiaRelevance: {
        relevanceType: "explicit_India",
        basis: "exact_public_evidence",
      },
      score: {
        valid: true,
        signalClass: "direct_demand",
        scoreVersion: "global-radar-score-v1",
        qualificationGatesPassed: true,
        components: {
          explicitness: 100,
          evidenceConfidence: 90,
          freshness: 100,
          indiaFit: 100,
          responseAccessibility: 100,
        },
      },
    });
    expect(signal.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
    expect(signal.evidence[0]?.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(signal.evidence[0]?.supportedFieldPaths).toContain(
      "indiaRelevance.explicit_India.collection",
    );
    const scoreEntityIds = new Map(
      signal.evidence.flatMap(({ contributorEntityRef }, index) =>
        contributorEntityRef === null
          ? []
          : [[contributorEntityRef, `entity-${index + 1}`] as const],
      ),
    );
    expect(createWorkerScoreEvidenceSnapshot(signal, scoreEntityIds)).toMatchObject({
      signalClass: "direct_demand",
      componentEvidence: expect.arrayContaining([
        expect.objectContaining({
          component: "actionability",
          basis: "server_adjusted",
          assessmentBasis: "worker_evidence",
          inputValue: 80,
        }),
      ]),
    });
    expect(validated.canonicalSubmissionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persistableGlobalRadarBatchObjectSchema.safeParse(validated).success).toBe(
      true,
    );
    expect(canonicalizeGlobalRadarPersistenceBatch(validated)).toMatchObject({
      valid: true,
    });
  });

  it("assigns initial score-evidence ordinals independently of caller evidence order", () => {
    const secondaryUrl = "https://acme.example/secondary-public-request";
    const validated = validate(
      batch({
        signals: [
          directSignal({
            evidence: [
              evidence(),
              evidence({
                sourceUrl: secondaryUrl,
                canonicalSourceUrl: secondaryUrl,
                sourceName: "Acme secondary request",
              }),
            ],
          }),
        ],
      }),
    );
    const signal = validated.signals[0];
    if (!signal) throw new Error("Ordinal fixture signal was not produced.");
    expect(signal.evidence).toHaveLength(2);
    const entityIds = new Map([["entity-acme", "entity-acme-stored"]]);
    const canonical = createWorkerScoreEvidenceSnapshot(signal, entityIds);
    const reversed = createWorkerScoreEvidenceSnapshot(
      { ...signal, evidence: [...signal.evidence].reverse() },
      entityIds,
    );

    expect(reversed).toMatchObject({
      evidenceBoundaryOrdinal: 2,
      evidenceSetCount: 2,
      evidenceSetDigest: canonical.evidenceSetDigest,
    });
  });

  it("produces the same canonical hash from the same normalized proposal", () => {
    const first = validate(batch());
    const second = validate(structuredClone(batch()));

    expect(second).toEqual(first);
    expect(second.canonicalSubmissionHash).toBe(first.canonicalSubmissionHash);
  });

  it("rejects a replay whose pre-policy actionability no longer matches the score", () => {
    const validated = validate(batch());
    const signal = validated.signals[0];
    if (!signal || signal.signalClass !== "direct_demand") {
      throw new Error("Direct-demand validation fixture was not produced.");
    }
    const { canonicalSubmissionHash: _ignored, ...withoutHash } = validated;
    void _ignored;
    const tamperedWithoutHash = {
      ...withoutHash,
      signals: [{ ...signal, actionabilityInput: 100 }],
    };
    const tampered = {
      ...tamperedWithoutHash,
      canonicalSubmissionHash:
        createGlobalRadarPersistenceHash(tamperedWithoutHash),
    };

    expect(canonicalizeGlobalRadarPersistenceBatch(tampered)).toEqual({
      valid: false,
      reason: "invalid_batch",
    });
  });

  it("rejects canonical persistence when a negated claim is mislabeled as positive India evidence", () => {
    const validated = structuredClone(validate(batch()));
    const signal = validated.signals[0];
    const indiaEvidence = signal?.evidence[0];
    if (!signal || !indiaEvidence) {
      throw new Error("Positive India persistence fixture was not produced.");
    }
    indiaEvidence.claim =
      "Acme does not collect physical data in India and excludes India.";
    const { canonicalSubmissionHash: _ignored, ...withoutHash } = validated;
    void _ignored;
    const tampered = {
      ...withoutHash,
      canonicalSubmissionHash: createGlobalRadarPersistenceHash(withoutHash),
    };

    expect(canonicalizeGlobalRadarPersistenceBatch(tampered)).toEqual({
      valid: false,
      reason: "invalid_batch",
    });
  });

  it("deduplicates repeated evidence fingerprints before persistence and hashing", () => {
    const single = validate(batch());
    const duplicate = validate(
      batch({
        signals: [directSignal({ evidence: [evidence(), evidence()] })],
      }),
    );

    expect(duplicate.signals[0]?.evidence).toHaveLength(1);
    expect(duplicate.canonicalSubmissionHash).toBe(
      single.canonicalSubmissionHash,
    );
  });

  it("recomputes query fingerprints and rewrites bounded source-error references", () => {
    const proposedFingerprint = "b".repeat(64);
    const query = executedQuery({ fingerprint: proposedFingerprint });
    const validated = validate(
      batch({
        executedQueries: [query],
        sourceErrors: [
          {
            sourceName: "Public web search",
            message: "One source did not respond.",
            queryFingerprint: proposedFingerprint,
          },
        ],
      }),
    );
    const expectedFingerprint = createQueryFingerprint(query);

    expect(validated.executedQueries[0]?.fingerprint).toBe(expectedFingerprint);
    expect(validated.sourceErrors[0]?.queryFingerprint).toBe(
      expectedFingerprint,
    );
    expect(canonicalizeGlobalRadarPersistenceBatch(validated)).toMatchObject({
      valid: true,
    });
  });

  it("rejects duplicate proposed query fingerprint aliases", () => {
    expect(() =>
      validate(
        batch({
          executedQueries: [
            executedQuery({ query: "robotics suppliers", ordinal: 0 }),
            executedQuery({ query: "robotics manufacturers", ordinal: 1 }),
          ],
        }),
      ),
    ).toThrow(/duplicate proposed query fingerprint/i);
  });

  it("rejects payload-like query and source diagnostics while allowing safe summaries", () => {
    const unsafeDiagnostics = [
      "<html>raw rejected response body</html>",
      "SQLSTATE 42P01: relation private.users does not exist",
      "Error: connection failed\n    at query (/Users/service/db.ts:12:4)",
      "Authorization: Bearer secret-token-value",
      "password=plain-text-credential",
      'Rejected response body: {"private":"payload"}',
      Array.from({ length: 90 }, (_, index) => `pageword${index}`).join(" "),
    ];

    for (const message of unsafeDiagnostics) {
      expect(
        globalRadarValidationProposalSchema.safeParse(
          batch({ executedQueries: [executedQuery({ error: message })] }),
        ).success,
      ).toBe(false);
      expect(
        globalRadarValidationProposalSchema.safeParse(
          batch({
            sourceErrors: [
              {
                sourceName: "Public web search",
                message,
                queryFingerprint: null,
              },
            ],
          }),
        ).success,
      ).toBe(false);
    }
    expect(
      globalRadarValidationProposalSchema.safeParse(
        batch({
          executedQueries: [executedQuery({ error: "Search request timed out." })],
          sourceErrors: [
            {
              sourceName: "Public web search",
              message: "The source did not respond before the timeout.",
              queryFingerprint: null,
            },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("canonicalizes unordered proposal collections before hashing", () => {
    const query = (ordinal: number) => ({
      fingerprint: String(ordinal + 1).repeat(64),
      query: `robotics supplier registration ${ordinal}`,
      language: "en",
      sourceCountry: "United States",
      theme: "robot_teleoperation_demonstrations",
      signalIntent: "direct_demand",
      sourceAdapter: "codex_public_web",
      recencyDays: 30,
      ordinal,
      executedAt: "2026-07-29T18:00:00.000Z",
      resultsExamined: ordinal,
      error: null,
    });
    const forward = validate(batch({ executedQueries: [query(0), query(1)] }));
    const reversed = validate(batch({ executedQueries: [query(1), query(0)] }));

    expect(reversed.executedQueries.map(({ ordinal }) => ordinal)).toEqual([
      0, 1,
    ]);
    expect(reversed.canonicalSubmissionHash).toBe(
      forward.canonicalSubmissionHash,
    );
  });

  it("derives the direct subtype from the cited ask instead of the worker label", () => {
    const validated = validate(
      batch({ signals: [directSignal({ signalType: "rfp" })] }),
    );

    expect(validated.signals[0]?.signalType).toBe("data_collection_request");
  });

  it("derives exact India relevance from evidence instead of the worker label", () => {
    const validated = validate(
      batch({
        signals: [
          directSignal({
            indiaRelevance: {
              proposedType: "no_current_India_fit",
              rationale: "The evidence controls the final relevance type.",
              reasons: [],
              constraints: [],
              unknowns: [],
              confidence: 90,
              regulatoryFacts: null,
              logisticsFacts: null,
            },
          }),
        ],
      }),
    );

    expect(validated.signals[0]?.indiaRelevance).toMatchObject({
      relevanceType: "explicit_India",
      basis: "exact_public_evidence",
    });
  });

  it("validates a dated precursor and recomputes its class-local score", () => {
    const precursor = precursorSignal();
    const validated = validate(batch({ signals: [precursor] }));

    expect(validated.signals).toHaveLength(1);
    expect(validated.signals[0]).toMatchObject({
      signalClass: "demand_precursor",
      signalType: "funding",
      expiresAt: null,
      score: {
        signalClass: "demand_precursor",
        scoreVersion: "global-radar-score-v1",
        components: {
          evidenceConfidence: 90,
          indiaFit: 0,
        },
      },
    });
    expect(canonicalizeGlobalRadarPersistenceBatch(validated)).toMatchObject({
      valid: true,
    });
  });

  it("requires evidence for each non-null worker-scored direct component", () => {
    const accepted = validate(batch());
    const missingEvidencePath = evidence({
      supportedFieldPaths: evidence().supportedFieldPaths.filter(
        (path) => path !== "scoreComponents.repeatability",
      ),
    });
    const rejected = validate(
      batch({
        signals: [directSignal({ evidence: [missingEvidencePath] })],
      }),
    );

    expect(accepted.signals).toHaveLength(1);
    expect(rejected.signals).toEqual([]);
    expect(rejected.rejections.invalid_evidence).toBe(1);
  });

  it("requires exact evidence for non-null worker-origin actionability", () => {
    const missingActionability = evidence({
      supportedFieldPaths: evidence().supportedFieldPaths.filter(
        (path) => path !== "scoreComponents.actionability",
      ),
    });
    const accepted = validate(batch());
    const rejected = validate(
      batch({ signals: [directSignal({ evidence: [missingActionability] })] }),
    );

    expect(accepted.signals).toHaveLength(1);
    expect(rejected.signals).toEqual([]);
    expect(rejected.rejections.invalid_evidence).toBe(1);
  });

  it("rejects active server-derived direct components without field evidence", () => {
    const missingFreshnessEvidence = evidence({
      supportedFieldPaths: evidence().supportedFieldPaths.filter(
        (path) =>
          path !== "signal.announcedAt" && path !== "signal.effectiveFrom",
      ),
    });
    const rejected = validate(
      batch({
        signals: [directSignal({ evidence: [missingFreshnessEvidence] })],
      }),
    );

    expect(rejected.signals).toEqual([]);
    expect(rejected.rejections.invalid_evidence).toBe(1);
  });

  it("requires evidence for each non-null worker-scored precursor component", () => {
    const fullyLinked = precursorSignal();
    const fullyLinkedEvidence = fullyLinked.evidence[0]!;
    const rejected = validate(
      batch({
        signals: [
          precursorSignal({
            evidence: [
              {
                ...fullyLinkedEvidence,
                supportedFieldPaths:
                  fullyLinkedEvidence.supportedFieldPaths.filter(
                    (path) =>
                      path !== "scoreComponents.fundingDeploymentMomentum",
                  ),
              },
            ],
          }),
        ],
      }),
    );

    expect(validate(batch({ signals: [fullyLinked] })).signals).toHaveLength(1);
    expect(rejected.signals).toEqual([]);
    expect(rejected.rejections.invalid_evidence).toBe(1);
  });

  it("rejects active server-derived precursor components without field evidence", () => {
    const precursor = precursorSignal();
    const source = precursor.evidence[0]!;
    const rejected = validate(
      batch({
        signals: [
          precursorSignal({
            effectiveFrom: "2026-09-15T00:00:00.000Z",
            evidence: [
              {
                ...source,
                supportedFieldPaths: source.supportedFieldPaths.filter(
                  (path) => path !== "signal.effectiveFrom",
                ),
              },
            ],
          }),
        ],
      }),
    );

    expect(rejected.signals).toEqual([]);
    expect(rejected.rejections.invalid_evidence).toBe(1);
  });

  it("does not require evidence for a null worker-scored component", () => {
    const scoreComponents = {
      ...directSignal().scoreComponents,
      repeatability: null,
    };
    const withoutRepeatabilityPath = evidence({
      supportedFieldPaths: evidence().supportedFieldPaths.filter(
        (path) => path !== "scoreComponents.repeatability",
      ),
    });
    const validated = validate(
      batch({
        signals: [
          directSignal({
            scoreComponents,
            evidence: [withoutRepeatabilityPath],
          }),
        ],
      }),
    );

    expect(validated.signals).toHaveLength(1);
    expect(validated.rejections.invalid_evidence).toBe(0);
  });

  it("derives valid momentum from independent entity evidence", () => {
    const proposal = momentumBatch();
    const validated = validate(proposal);

    expect(validated.entities).toHaveLength(2);
    expect(validated.signals[0]).toMatchObject({
      signalClass: "ecosystem_momentum",
      signalType: "ecosystem_direction",
      primaryEntityRef: null,
      score: {
        signalClass: "ecosystem_momentum",
        scoreVersion: "global-radar-score-v1",
        qualificationGatesPassed: true,
        counts: {
          evidenceItems: 2,
          independentEntities: 2,
          primarySources: 2,
          sourceFamilies: 2,
        },
      },
    });
    expect(canonicalizeGlobalRadarPersistenceBatch(validated)).toMatchObject({
      valid: true,
    });
  });

  it("requires exact evidence for both worker-origin momentum metrics", () => {
    const fullyLinked = momentumBatch();
    expect(validate(fullyLinked).signals).toHaveLength(1);

    for (const missingPath of [
      "momentumMetrics.taxonomyConsistency",
      "momentumMetrics.evidenceQuality",
    ]) {
      const missingMetricEvidence = momentumBatch();
      missingMetricEvidence.signals[0]!.evidence[0]!.supportedFieldPaths =
        missingMetricEvidence.signals[0]!.evidence[0]!.supportedFieldPaths.filter(
          (path) => path !== missingPath,
        );

      const rejected = validate(missingMetricEvidence);
      expect(rejected.signals).toEqual([]);
      expect(rejected.rejections.invalid_evidence).toBe(1);
    }
  });

  it.each(["syndicated", "unrelated"] as const)(
    "rejects worker momentum metrics supported only by %s evidence",
    (ineligibleKind) => {
      const proposal = momentumBatch();
      const signal = proposal.signals[0]!;
      signal.evidence.forEach((item) => {
        item.supportedFieldPaths = item.supportedFieldPaths.filter(
          (path) => !path.startsWith("momentumMetrics."),
        );
      });
      if (ineligibleKind === "unrelated") {
        proposal.entities.push({
          ...proposal.entities[0]!,
          entityRef: "entity-unrelated",
          canonicalName: "Unrelated Robotics",
          websiteUrl: "https://unrelated.example",
          linkedinOrganizationUrl:
            "https://www.linkedin.com/company/unrelated-robotics",
          stablePublicIdentifiers: [
            { namespace: "official_registry", value: "unrelated-robotics" },
          ],
          canonicalCorporateGroupId: "group:unrelated-robotics",
        });
      }
      signal.evidence.push(
        evidence({
          contributorEntityRef:
            ineligibleKind === "unrelated"
              ? "entity-unrelated"
              : "entity-acme",
          sourceUrl: `https://${ineligibleKind}.example/momentum-metrics`,
          canonicalSourceUrl: `https://${ineligibleKind}.example/momentum-metrics`,
          sourceName: `${ineligibleKind} metric carrier`,
          isPrimarySource: false,
          isSyndicated: ineligibleKind === "syndicated",
          supportsDirectDemand: false,
          supportsIndiaRelevance: false,
          supportedFieldPaths: [
            "momentumMetrics.taxonomyConsistency",
            "momentumMetrics.evidenceQuality",
          ],
        }),
      );

      const rejected = validate(proposal);
      expect(rejected.signals).toEqual([]);
      expect(rejected.rejections.invalid_evidence).toBe(1);
    },
  );

  it("does not count aliased public identities as independent momentum", () => {
    const proposal = momentumBatch();
    proposal.entities[0]!.canonicalCorporateGroupId = null;
    proposal.entities[1]!.canonicalCorporateGroupId = null;
    proposal.entities[0]!.stablePublicIdentifiers.push({
      namespace: "official_registry",
      value: "shared-robotics-entity",
    });
    proposal.entities[1]!.stablePublicIdentifiers.push({
      namespace: "official_registry",
      value: "shared-robotics-entity",
    });

    const validated = validate(proposal);

    expect(validated.signals).toEqual([]);
    expect(validated.entities).toEqual([]);
    expect(validated.rejections.insufficient_momentum_evidence).toBe(1);
    expect(canonicalizeGlobalRadarPersistenceBatch(validated)).toMatchObject({
      valid: true,
    });
  });

  it("applies compliance actionability reductions before direct-demand scoring", () => {
    const unresolved = validate(batch());
    const severe = validate(
      batch({
        signals: [
          directSignal({
            sensitiveDataAndCompliance: {
              sensitiveDataFlags: {
                ...ALL_UNKNOWN_SENSITIVE_DATA,
                faces: "severe",
              },
              complianceFacts: {
                consent: null,
                deIdentification: null,
                legalReview: null,
                knownResidencyRequirements: null,
                participantRightsComplexity: null,
              },
            },
          }),
        ],
      }),
    );

    expect(unresolved.signals[0]).toMatchObject({
      initialStatus: "needs_review",
      score: { components: { actionability: 70 } },
    });
    expect(severe.signals[0]).toMatchObject({
      initialStatus: "needs_review",
      score: { components: { actionability: 60 } },
    });
  });

  it("accepts an honest zero without inventing entities or signals", () => {
    const validated = validate(
      batch({ entities: [], signals: [], sourceErrors: [] }),
    );

    expect(validated.entities).toEqual([]);
    expect(validated.signals).toEqual([]);
    expect(Object.values(validated.rejections).every((count) => count === 0)).toBe(
      true,
    );
    expect(canonicalizeGlobalRadarPersistenceBatch(validated)).toMatchObject({
      valid: true,
    });
  });

  it("keeps valid records in a partial batch and bounds rejection counts", () => {
    const rejected = directSignal({
      externalSignalId: "signal-generic-marketing",
      directDemandAsk: {
        type: "data_collection_request",
        isExplicit: false,
        expiresAt: "2026-08-29T00:00:00.000Z",
      },
      title: "Acme describes its platform",
    });
    const validated = validate(batch({ signals: [directSignal(), rejected] }));

    expect(validated.signals).toHaveLength(1);
    expect(validated.rejections.missing_explicit_current_ask).toBe(1);
    expect(Object.values(validated.rejections).reduce((a, b) => a + b, 0)).toBe(
      1,
    );
    expect(canonicalizeGlobalRadarPersistenceBatch(validated)).toMatchObject({
      valid: true,
    });
  });

  it("rejects weak or non-original evidence without rejecting the envelope", () => {
    const validated = validate(
      batch({
        signals: [
          directSignal({
            evidence: [evidence({ sourceKind: "summary" })],
          }),
        ],
      }),
    );

    expect(validated.signals).toEqual([]);
    expect(validated.entities).toEqual([]);
    expect(validated.rejections.summary_is_not_evidence).toBe(1);
  });

  it("rejects unsupported India assertions instead of trusting the label", () => {
    const validated = validate(
      batch({
        signals: [
          directSignal({
            evidence: [
              evidence({
                claim:
                  "Acme requests suppliers to collect teleoperated robot trajectories.",
                englishSummary:
                  "Acme requests suppliers for teleoperated robot data collection.",
              }),
            ],
          }),
        ],
      }),
    );

    expect(validated.signals).toEqual([]);
    expect(validated.rejections.insufficient_evidence).toBe(1);
  });

  it("rejects a qualifying record when its systems context is absent", () => {
    const validated = validate(
      batch({ signals: [directSignal({ systemsContext: null })] }),
    );

    expect(validated.signals).toEqual([]);
    expect(validated.rejections.insufficient_evidence).toBe(1);
  });

  it("rejects a direct ask that expired after observation but before validation", () => {
    const validated = validate(
      batch({
        signals: [
          directSignal({
            directDemandAsk: {
              type: "data_collection_request",
              isExplicit: true,
              expiresAt: "2026-07-30T00:00:00.000Z",
            },
          }),
        ],
      }),
    );

    expect(validated.signals).toEqual([]);
    expect(validated.rejections.expired_direct_demand).toBe(1);
  });

  it("rejects an invalid public response path at the classification stage", () => {
    const validated = validate(
      batch({
        signals: [
          directSignal({
            responsePath: {
              type: "supplier_or_partner_registration",
              url: "https://acme.example/uncited-supplier-form",
              businessEmail: null,
              evidenceUrl: SOURCE_URL,
            },
          }),
        ],
      }),
    );

    expect(validated.signals).toEqual([]);
    expect(validated.rejections.response_path_not_cited).toBe(1);
  });

  it("requires every evidence contributor to belong to the signal graph", () => {
    const proposal = structuredClone(batch());
    proposal.entities.push({
      ...proposal.entities[0]!,
      entityRef: "entity-beta",
      canonicalName: "Beta Robotics",
      websiteUrl: "https://beta.example",
      linkedinOrganizationUrl: "https://www.linkedin.com/company/beta-robotics",
      stablePublicIdentifiers: [
        { namespace: "official_registry", value: "beta-robotics" },
      ],
      canonicalCorporateGroupId: "group:beta-robotics",
    });
    proposal.signals[0]!.evidence[0]!.contributorEntityRef = "entity-beta";

    const validated = validate(proposal);

    expect(validated.signals).toEqual([]);
    expect(validated.rejections.invalid_evidence).toBe(1);
  });

  it("rejects insufficient momentum and never persists unclassified", () => {
    const momentum = directSignal({
      externalSignalId: "signal-one-source-momentum",
      signalClass: "ecosystem_momentum",
      signalType: "ecosystem_direction",
      primaryEntityRef: null,
      associatedEntities: [
        { entityRef: "entity-acme", role: "contributor", confidence: 90 },
      ],
      directDemandAsk: null,
      precursorDevelopmentType: null,
      momentumMetrics: { taxonomyConsistency: 90, evidenceQuality: 90 },
      scoreComponents: null,
      evergreen: null,
      reobserveBy: null,
      responsePath: null,
      systemsContext: null,
      indiaRelevance: {
        proposedType: "no_current_India_fit",
        rationale: "No current India fit is publicly supported.",
        reasons: [],
        constraints: [],
        unknowns: ["Future counterparties are unknown."],
        confidence: 70,
        regulatoryFacts: null,
        logisticsFacts: null,
      },
      evidence: [
        evidence({
          supportsDirectDemand: false,
          supportsIndiaRelevance: false,
          supportedFieldPaths: ["signal.factualSummary"],
        }),
      ],
    });
    const validated = validate(batch({ signals: [momentum] }));

    expect(validated.signals).toEqual([]);
    expect(validated.rejections.insufficient_momentum_evidence).toBe(1);
    expect(
      JSON.stringify(validated).toLowerCase().includes("unclassified"),
    ).toBe(false);
  });

  it("fails closed on mismatched trusted run context", () => {
    expect(() =>
      validateGlobalRadarBatch(batch(), {
        ...context,
        expectedRunId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow(/run/i);
  });
});
