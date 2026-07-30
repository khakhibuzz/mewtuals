import { describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_DETAIL_SECTION_IDS,
  serializeGlobalRadarPromotion,
  serializeGlobalRadarRun,
  serializeGlobalRadarSignalDetail,
  serializeGlobalRadarSignalListItem,
  serializeGlobalRadarWatchlistItem,
} from "../app/server/global-radar/dto";

function detailReadModel() {
  const observedAt = new Date("2026-07-31T04:00:00.000Z");
  return {
    organisation: {
      id: "00000000-0000-4000-8000-000000000001",
      canonicalName: "Example Robotics",
      canonicalDomain: "example.com",
      websiteUrl: "https://example.com/",
      linkedinUrl: "https://www.linkedin.com/company/example-robotics",
      canonicalCorporateGroupId: null,
      stablePublicIdentifiers: ["domain:example.com"],
      headquartersCountry: "China",
      headquartersCity: "Shenzhen",
      operatingCountries: ["China", "India"],
      organisationType: "company",
      sector: "robotics",
      shortDescription: "A fictional robotics organisation.",
      entityStatus: "qualified",
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      promotedCandidateId: null,
      revision: 3,
      createdAt: observedAt,
      updatedAt: observedAt,
    },
    associatedOrganisations: { total: 0, truncated: false, items: [] },
    signal: {
      id: "00000000-0000-4000-8000-000000000002",
      signalClass: "direct_demand",
      title: "Public supplier request",
      factualSummary: "The organisation published a supplier request.",
      theme: "robotics_manufacturing",
      sourceCountry: "China",
      demandDomain: "robot_hardware_and_components",
      indiaRelevanceType: "globally_open",
      status: "qualified",
      score: 82,
      expiresAt: null,
      reobserveBy: new Date("2026-08-31T04:00:00.000Z"),
      observedAt,
      revision: 4,
      entity: {
        id: "00000000-0000-4000-8000-000000000001",
        canonicalName: "Example Robotics",
        headquartersCountry: "China",
      },
      signalType: "supplier_registration",
      interpretationSummary: "Mewtuals could assess an evidence-only response path.",
      industry: "robotics",
      targetGeographies: ["Global"],
      collectionGeographies: null,
      manufacturingGeographies: ["India"],
      deliveryGeographies: ["China"],
      targetModelOrSystem: "industrial robot",
      requiredCounterpartyArchetypes: ["contract_manufacturer"],
      indiaRelevanceRationale: "The public request is globally open.",
      indiaFitReasons: ["Global supplier route"],
      indiaFitConstraints: ["Public qualification required"],
      indiaFitUnknowns: ["Volume"],
      indiaFitConfidence: 75,
      indiaRegulatoryFacts: { known: false },
      indiaLogisticsFacts: { leadTimeKnown: false },
      targetCapabilityTags: ["contract_manufacturing"],
      responsePathType: "supplier_or_partner_registration",
      responsePathUrl: "https://example.com/suppliers",
      responseBusinessEmail: null,
      partnerApplicationUrl: "https://example.com/suppliers",
      sourceLanguage: "zh-CN",
      extractionMethod: "public_web",
      taxonomyVersion: "global-radar-v1",
      firstRunId: "00000000-0000-4000-8000-000000000003",
      mostRecentRunId: "00000000-0000-4000-8000-000000000003",
      mergedIntoSignalId: null,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      createdAt: observedAt,
      updatedAt: observedAt,
    },
    scoreRationale: {
      directDemand: {
        demandExplicitness: 90,
        evidenceConfidence: 80,
        freshness: 90,
        actionability: 80,
        indiaFit: 75,
        commercialPotential: 70,
        repeatability: 70,
        responseAccessibility: 85,
        strategicLearning: 80,
        complianceComplexity: 20,
        score: 82,
      },
      precursor: {
        evidenceConfidence: null,
        proximityToExternalDemand: null,
        fundingDeploymentMomentum: null,
        likelyDataHardwareIntensity: null,
        indiaFit: null,
        estimatedTimeHorizon: null,
        strategicRelevance: null,
        score: null,
      },
      momentum: {
        independentEntityCount: null,
        primarySourceCount: null,
        sourceFamilyCount: null,
        volume7Days: null,
        volume30Days: null,
        volume90Days: null,
        independentEntityBreadth: null,
        primarySourceDepth: null,
        sourceDiversity: null,
        weightedVolume: null,
        growthVsPreviousPeriod: null,
        taxonomyConsistency: null,
        evidenceQuality: null,
        score: null,
        policyVersion: null,
        qualificationGatesPassed: null,
      },
      coverage: 100,
      policyVersion: "global-radar-score-v1",
    },
    timeline: {
      announcedAt: observedAt,
      effectiveFrom: observedAt,
      expiresAt: null,
      evergreen: true,
      reobserveBy: new Date("2026-08-31T04:00:00.000Z"),
      observedAt,
    },
    systemsContext: {
      summary: "Components support an industrial robot system.",
      stackType: "robotics_hardware",
      higherLevelSystemGoal: "Reliable manipulation",
      relevantStackLayer: "hardware",
      lowerLevelInputsRequired: ["components"],
      transformationOrCapabilityAdded: "Assembly",
      downstreamModelOrRobotBehavior: "Reliable motion",
      whyTheRequirementMatters: "It enables deployment.",
      possibleIndianExecutionRole: "Contract manufacturing",
      factualElements: ["Supplier request"],
      inferredElements: ["Possible Indian execution"],
    },
    compliance: {
      sensitiveDataFlags: {
        faces: null,
        voices: null,
        biometrics: null,
        gaze: null,
        health: null,
        children: null,
        homeInteriors: null,
        workplaceMonitoring: null,
        preciseLocation: null,
        roadUsers: null,
        employeeData: null,
        industrialSecrets: "possible",
        defenceOrDualUse: null,
        copyrightedMaterial: null,
        exportControls: "possible",
      },
      facts: {
        consent: null,
        deIdentification: null,
        legalReview: true,
        knownResidencyRequirements: null,
        participantRightsComplexity: null,
      },
    },
    requirements: {
      total: 1,
      truncated: false,
      items: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          kind: "robotics_hardware",
          capabilityTag: "contract_manufacturing",
          summary: "Contract-manufactured robot components.",
          dataFamilies: null,
          sensorModalities: null,
          environments: ["factory"],
          taskFamilies: ["assembly"],
          collectionMethods: null,
          humanRoles: ["quality engineer"],
          robotEmbodiments: ["industrial arm"],
          indianExecutionArchetypes: ["robotics_hardware_manufacturing"],
          scaleSpecification: { quantity: "unknown" },
          technicalSpecification: { tolerance: "unknown" },
          qualitySpecification: { certification: "required" },
          rightsAndComplianceSpecification: { exportReview: true },
          confidence: 80,
          createdAt: observedAt,
          updatedAt: observedAt,
        },
      ],
    },
    evidence: {
      total: 1,
      truncated: false,
      items: [
        {
          id: "00000000-0000-4000-8000-000000000005",
          runId: "00000000-0000-4000-8000-000000000003",
          globalEntityId: "00000000-0000-4000-8000-000000000001",
          sourceUrl: "https://example.com/suppliers",
          canonicalSourceUrl: "https://example.com/suppliers",
          sourceName: "Example Robotics",
          sourceType: "official_page",
          sourceLanguage: "zh-CN",
          sourceCountry: "China",
          sourceFamily: "official_partner_supplier_pages",
          evidenceClaim: "该公司公开邀请供应商申请。",
          sourceExcerpt: "供应商申请现已开放。",
          englishSummary: "The company publicly invites supplier applications.",
          publishedAt: observedAt,
          observedAt,
          evidenceConfidence: 90,
          translationConfidence: 90,
          isPrimarySource: true,
          isSyndicated: false,
          supportsDirectDemand: true,
          supportsIndiaRelevance: false,
          supportedFieldPaths: ["signal.factualSummary"],
          createdAt: observedAt,
        },
      ],
    },
    history: { total: 0, truncated: false, items: [] },
    notes: {
      total: 1,
      truncated: false,
      items: [
        {
          id: "00000000-0000-4000-8000-000000000006",
          body: "Review public supplier requirements.",
          actorEmail: "admin@example.com",
          observedAt,
          createdAt: observedAt,
        },
      ],
    },
    watchlist: null,
    promotion: null,
    allowedActions: ["append_note", "promote"],
  };
}

describe("Global Radar DTO serializers", () => {
  it("serializes the authenticated detail as exactly the twenty approved sections", () => {
    const dto = serializeGlobalRadarSignalDetail(detailReadModel());

    expect(dto.sections.map(({ id }) => id)).toEqual(
      GLOBAL_RADAR_DETAIL_SECTION_IDS,
    );
    expect(dto.sections.map(({ title }) => title)).toEqual([
      "Organisation",
      "What changed",
      "Signal class",
      "Publicly supported facts",
      "Mewtuals interpretation",
      "Required capabilities",
      "Physical-data or hardware specifications",
      "Target environments and tasks",
      "Indian execution archetypes",
      "India-fit reasoning and constraints",
      "Systems-context explanation",
      "Scale and timeline",
      "Public response path",
      "Compliance flags",
      "Supporting evidence",
      "Original-language source",
      "English summary",
      "Score rationale",
      "Signal history",
      "Admin notes and actions",
    ]);
    expect(dto.sections).toHaveLength(20);
  });

  it("keeps facts, inference, translation, scores, and authenticated notes distinct", () => {
    const dto = serializeGlobalRadarSignalDetail(detailReadModel());
    const section = (id: (typeof GLOBAL_RADAR_DETAIL_SECTION_IDS)[number]) =>
      dto.sections.find((candidate) => candidate.id === id)!;

    expect(dto).toMatchObject({
      id: "00000000-0000-4000-8000-000000000002",
      revision: 4,
      signalClass: "direct_demand",
      status: "qualified",
    });
    expect(section("publicly_supported_facts").data).toMatchObject({
      factualSummary: "The organisation published a supplier request.",
    });
    expect(section("mewtuals_interpretation").data).toEqual({
      summary: "Mewtuals could assess an evidence-only response path.",
    });
    expect(section("original_language_source").data).toMatchObject({
      items: [
        expect.objectContaining({
          lang: "zh-CN",
          dir: "ltr",
          claim: "该公司公开邀请供应商申请。",
        }),
      ],
    });
    expect(section("english_summary").data).toMatchObject({
      items: [
        expect.objectContaining({
          lang: "en",
          summary: "The company publicly invites supplier applications.",
        }),
      ],
    });
    expect(section("score_rationale").data).toMatchObject({
      activeClass: "direct_demand",
      score: 82,
      coverage: 100,
    });
    expect(section("admin_notes_and_actions").data).toMatchObject({
      notes: {
        total: 1,
        items: [
          expect.objectContaining({
            body: "Review public supplier requirements.",
          }),
        ],
      },
      allowedActions: ["append_note", "promote"],
    });
  });

  it("allowlists every DTO and never copies recursive private material", () => {
    const privateMaterial = {
      workerSecret: "radar-worker-private",
      leaseTokenHash: "lease-hash-private",
      submissionHash: "submission-hash-private",
      rawMetadata: { promptInternals: "prompt-private" },
      rawPayload: { rejectedBody: "rejected-private" },
      fullPageText: "full-page-private",
      privateFailure: { sql: "select private", exception: "private-stack" },
      claimPath: "/private/claim.json",
    };
    const detail = detailReadModel();
    Object.assign(detail, privateMaterial);
    Object.assign(detail.signal, privateMaterial);
    Object.assign(detail.evidence.items[0]!, privateMaterial);

    const list = serializeGlobalRadarSignalListItem({
      ...detail.signal,
      notes: detail.notes,
      ...privateMaterial,
    });
    const watchlist = serializeGlobalRadarWatchlistItem({
      id: "00000000-0000-4000-8000-000000000007",
      globalEntityId: "00000000-0000-4000-8000-000000000001",
      state: "enabled",
      priority: 4,
      theme: "robotics_manufacturing",
      category: "robot components",
      categorySearchTermEn: "robot components",
      categorySearchTermZhCn: "机器人组件",
      countries: ["China"],
      languages: ["en", "zh-CN"],
      cadenceDays: 7,
      nextScanAt: new Date("2026-08-07T04:00:00.000Z"),
      reason: "Monitor public evidence.",
      revision: 2,
      entity: {
        canonicalName: "Example Robotics",
        headquartersCountry: "China",
        entityStatus: "watchlisted",
        revision: 3,
        ...privateMaterial,
      },
      notes: detail.notes,
      ...privateMaterial,
    });
    const promotion = serializeGlobalRadarPromotion({
      id: "00000000-0000-4000-8000-000000000008",
      globalEntityId: "00000000-0000-4000-8000-000000000001",
      primarySignalId: "00000000-0000-4000-8000-000000000002",
      supportingSignalIds: [],
      eligibilityPath: "qualified_india_direct_demand",
      discoveryRunId: null,
      discoveryCandidateId: null,
      status: "active",
      promotedAt: new Date("2026-07-31T04:00:00.000Z"),
      reversedAt: null,
      revisionContext: {
        expectedEntity: 3,
        expectedPrimarySignal: 4,
        promotedEntity: 4,
        promotedPrimarySignal: 5,
      },
      createdAt: new Date("2026-07-31T04:00:00.000Z"),
      updatedAt: new Date("2026-07-31T04:00:00.000Z"),
      notes: detail.notes,
      ...privateMaterial,
    });
    const run = serializeGlobalRadarRun({
      id: "00000000-0000-4000-8000-000000000009",
      trigger: "scheduled",
      scanMode: "daily",
      status: "failed",
      startedAt: new Date("2026-07-31T04:00:00.000Z"),
      completedAt: new Date("2026-07-31T05:00:00.000Z"),
      sourceCountries: ["China"],
      sourceLanguages: ["zh-CN"],
      targetDomains: ["robotics_manufacturing"],
      targetSignalTypes: ["direct_demand"],
      sourcesUsed: ["codex_public_web"],
      numberResultsExamined: 2,
      numberEntitiesObserved: 1,
      numberSignalsFound: 0,
      numberDirectDemands: 0,
      numberPrecursors: 0,
      numberMomentumRecords: 0,
      numberNew: 0,
      numberUpdated: 0,
      numberDuplicates: 0,
      numberRejectedForWeakEvidence: 1,
      numberSourceErrors: 1,
      failure: { code: "worker_failed", message: "SQL private-failure" },
      sourceErrors: [{ sourceName: "private", message: "private-stack" }],
      createdAt: new Date("2026-07-31T04:00:00.000Z"),
      updatedAt: new Date("2026-07-31T05:00:00.000Z"),
      notes: detail.notes,
      ...privateMaterial,
    });

    const outputs = [
      serializeGlobalRadarSignalDetail(detail),
      list,
      watchlist,
      promotion,
      run,
    ];
    for (const output of outputs) {
      const serialized = JSON.stringify(output);
      for (const forbidden of [
        "radar-worker-private",
        "lease-hash-private",
        "submission-hash-private",
        "prompt-private",
        "rejected-private",
        "full-page-private",
        "private-stack",
        "select private",
        "/private/claim.json",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
    expect(JSON.stringify(list)).not.toContain("Review public supplier");
    expect(JSON.stringify(watchlist)).not.toContain("Review public supplier");
    expect(JSON.stringify(promotion)).not.toContain("Review public supplier");
    expect(JSON.stringify(run)).not.toContain("Review public supplier");
  });

  it("maps the promotion repository's flat revision columns", () => {
    expect(
      serializeGlobalRadarPromotion({
        id: "00000000-0000-4000-8000-000000000008",
        globalEntityId: "00000000-0000-4000-8000-000000000001",
        primarySignalId: "00000000-0000-4000-8000-000000000002",
        supportingSignalIds: [
          "00000000-0000-4000-8000-000000000002",
        ],
        eligibilityPath: "qualified_india_direct_demand",
        discoveryRunId: "00000000-0000-4000-8000-000000000010",
        discoveryCandidateId: "00000000-0000-4000-8000-000000000011",
        status: "active",
        promotedAt: new Date("2026-07-31T04:00:00.000Z"),
        reversedAt: null,
        expectedEntityRevision: 3,
        expectedPrimarySignalRevision: 4,
        promotedEntityRevision: 4,
        promotedPrimarySignalRevision: 5,
        createdAt: new Date("2026-07-31T04:00:00.000Z"),
        updatedAt: new Date("2026-07-31T04:00:00.000Z"),
        actorEmail: "admin@example.com",
        reason: "private audit reason",
        sourceSnapshotDigest: "private digest",
      }),
    ).toEqual({
      id: "00000000-0000-4000-8000-000000000008",
      globalEntityId: "00000000-0000-4000-8000-000000000001",
      primarySignalId: "00000000-0000-4000-8000-000000000002",
      supportingSignalIds: [
        "00000000-0000-4000-8000-000000000002",
      ],
      eligibilityPath: "qualified_india_direct_demand",
      discoveryRunId: "00000000-0000-4000-8000-000000000010",
      discoveryCandidateId: "00000000-0000-4000-8000-000000000011",
      status: "active",
      promotedAt: "2026-07-31T04:00:00.000Z",
      reversedAt: null,
      revisionContext: {
        expectedEntity: 3,
        expectedPrimarySignal: 4,
        promotedEntity: 4,
        promotedPrimarySignal: 5,
      },
      createdAt: "2026-07-31T04:00:00.000Z",
      updatedAt: "2026-07-31T04:00:00.000Z",
    });
  });
});
