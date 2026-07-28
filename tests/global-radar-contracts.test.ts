import { describe, expect, it } from "vitest";

import * as globalRadarDomain from "../app/domain/global-radar";

import {
  GLOBAL_RADAR_PROMPT_VERSION,
  GLOBAL_RADAR_SCHEMA_VERSION,
  boundedShortStringSchema,
  boundedRecordSchema,
  confidenceSchema,
  executedQuerySchema,
  evidenceSchema,
  globalRadarBatchSchema,
  indiaRelevanceTypeLookup,
  indiaRelevanceTypes,
  isoTimestampSchema,
  nullableBoundedStringArraySchema,
  observedEntitySchema,
  professionalResponsePathTypeLookup,
  professionalResponsePathSchema,
  promotionEligibilityPaths,
  promotionEligibilityPathLookup,
  professionalResponsePathTypes,
  publicHttpUrlSchema,
  radarRunStatusLookup,
  radarRunStatuses,
  radarRunTriggerLookup,
  radarRunTriggers,
  radarScanModeLookup,
  radarScanModes,
  requirementKindLookup,
  requirementKinds,
  requirementSchema,
  scoreComponentSchema,
  serializedJsonByteLength,
  signalClassLookup,
  signalClasses,
  signalDraftSchema,
  signalStatusLookup,
  signalStatuses,
  sourceErrorSchema,
} from "../app/domain/global-radar/contracts";

function honestEmptyBatch() {
  return {
    schemaVersion: GLOBAL_RADAR_SCHEMA_VERSION,
    promptVersion: GLOBAL_RADAR_PROMPT_VERSION,
    taxonomyVersion: "global-radar-v1",
    runId: "11111111-1111-4111-8111-111111111111",
    planFingerprint: "a".repeat(64),
    executedQueries: [],
    entities: [],
    signals: [],
    sourceErrors: [],
  };
}

function executedQuery(overrides: Record<string, unknown> = {}) {
  return {
    fingerprint: "b".repeat(64),
    query: "robotics supplier registration",
    language: "en",
    sourceCountry: "US",
    theme: "robotics_manufacturing",
    signalIntent: "direct_demand",
    sourceAdapter: "codex_public_web",
    executedAt: "2026-07-28T10:30:00.000Z",
    resultsExamined: 4,
    error: null,
    ...overrides,
  };
}

function observedEntity(overrides: Record<string, unknown> = {}) {
  return {
    name: "Example Robotics",
    websiteUrl: "https://example.com",
    linkedinOrganizationUrl: null,
    sourceCountry: "US",
    rawMetadata: {},
    ...overrides,
  };
}

function evidenceItem(overrides: Record<string, unknown> = {}) {
  return {
    sourceUrl: "https://example.com/suppliers",
    sourceName: "Example Robotics",
    sourceFamily: "official_partner_supplier_pages",
    sourceLanguage: "en",
    sourceCountry: "US",
    claim: "The company opened supplier registration.",
    excerpt: null,
    englishSummary: "Example Robotics is accepting supplier registrations.",
    publishedAt: null,
    observedAt: "2026-07-28T10:30:00.000Z",
    evidenceConfidence: 90,
    translationConfidence: null,
    isPrimarySource: true,
    supportedFieldPaths: ["factualSummary"],
    rawMetadata: {},
    ...overrides,
  };
}

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    kind: "manufacturing",
    summary: "Contract manufacturing capacity",
    confidence: 85,
    rawMetadata: {},
    ...overrides,
  };
}

function signalDraft(overrides: Record<string, unknown> = {}) {
  return {
    signalClass: "direct_demand",
    title: "Supplier registration opened",
    factualSummary: "Example Robotics opened a supplier registration path.",
    interpretationSummary: "This may create an execution requirement.",
    sourceCountry: "US",
    observedAt: "2026-07-28T10:30:00.000Z",
    evidence: [evidenceItem()],
    requirements: [requirement()],
    rawMetadata: {},
    ...overrides,
  };
}

function sourceError(overrides: Record<string, unknown> = {}) {
  return {
    sourceName: "Public web search",
    message: "The source timed out.",
    queryFingerprint: null,
    ...overrides,
  };
}

describe("Global Radar contracts", () => {
  it("exposes the deliberate Task 1 public domain API", () => {
    expect({
      batch: globalRadarDomain.globalRadarBatchSchema,
      evidence: globalRadarDomain.evidenceSchema,
      taxonomyVersion: globalRadarDomain.GLOBAL_RADAR_TAXONOMY_VERSION,
    }).toEqual({
      batch: globalRadarBatchSchema,
      evidence: evidenceSchema,
      taxonomyVersion: "global-radar-v1",
    });
  });

  it("locks the provider-neutral batch versions", () => {
    expect({
      prompt: GLOBAL_RADAR_PROMPT_VERSION,
      schema: GLOBAL_RADAR_SCHEMA_VERSION,
    }).toEqual({
      prompt: "codex-public-web-v1",
      schema: "global-radar-batch-v1",
    });
  });

  it("accepts only the strict versioned honest-empty envelope", () => {
    const batch = honestEmptyBatch();

    expect({
      fictional: globalRadarBatchSchema.safeParse({
        ...batch,
        fictionalExample: true,
      }).success,
      prompt: globalRadarBatchSchema.safeParse({
        ...batch,
        promptVersion: "other-prompt",
      }).success,
      schema: globalRadarBatchSchema.safeParse({
        ...batch,
        schemaVersion: "other-schema",
      }).success,
      taxonomy: globalRadarBatchSchema.safeParse({
        ...batch,
        taxonomyVersion: "other-taxonomy",
      }).success,
      valid: globalRadarBatchSchema.safeParse(batch).success,
    }).toEqual({
      fictional: false,
      prompt: false,
      schema: false,
      taxonomy: false,
      valid: true,
    });
  });

  it("caps executed queries at 120", () => {
    expect({
      atLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        executedQueries: Array.from({ length: 120 }, () => executedQuery()),
      }).success,
      aboveLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        executedQueries: Array.from({ length: 121 }, () => executedQuery()),
      }).success,
    }).toEqual({ atLimit: true, aboveLimit: false });
  });

  it("caps observed entities at 50", () => {
    expect({
      atLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        entities: Array.from({ length: 50 }, () => observedEntity()),
      }).success,
      aboveLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        entities: Array.from({ length: 51 }, () => observedEntity()),
      }).success,
    }).toEqual({ atLimit: true, aboveLimit: false });
  });

  it("caps accepted signals at 20", () => {
    expect({
      atLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals: Array.from({ length: 20 }, () => signalDraft()),
      }).success,
      aboveLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals: Array.from({ length: 21 }, () => signalDraft()),
      }).success,
    }).toEqual({ atLimit: true, aboveLimit: false });
  });

  it("caps source errors at 50", () => {
    expect({
      atLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals: [signalDraft()],
        sourceErrors: Array.from({ length: 50 }, () => sourceError()),
      }).success,
      aboveLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals: [signalDraft()],
        sourceErrors: Array.from({ length: 51 }, () => sourceError()),
      }).success,
    }).toEqual({ atLimit: true, aboveLimit: false });
  });

  it("accepts only strict bounded executed queries", () => {
    expect({
      badAdapter: executedQuerySchema.safeParse(
        executedQuery({ sourceAdapter: "other_adapter" }),
      ).success,
      badFingerprint: executedQuerySchema.safeParse(
        executedQuery({ fingerprint: "short" }),
      ).success,
      badResults: executedQuerySchema.safeParse(
        executedQuery({ resultsExamined: -1 }),
      ).success,
      badTheme: executedQuerySchema.safeParse(
        executedQuery({ theme: "other_theme" }),
      ).success,
      fictional: executedQuerySchema.safeParse(
        executedQuery({ fictionalExample: true }),
      ).success,
      valid: executedQuerySchema.safeParse(executedQuery()).success,
    }).toEqual({
      badAdapter: false,
      badFingerprint: false,
      badResults: false,
      badTheme: false,
      fictional: false,
      valid: true,
    });
  });

  it("enforces every executed-query field bound", () => {
    expect({
      country: executedQuerySchema.safeParse(
        executedQuery({ sourceCountry: "x".repeat(101) }),
      ).success,
      error: executedQuerySchema.safeParse(
        executedQuery({ error: "x".repeat(1_001) }),
      ).success,
      language: executedQuerySchema.safeParse(
        executedQuery({ language: "x".repeat(36) }),
      ).success,
      query: executedQuerySchema.safeParse(
        executedQuery({ query: "x".repeat(1_001) }),
      ).success,
      results: executedQuerySchema.safeParse(
        executedQuery({ resultsExamined: 10_001 }),
      ).success,
      timestamp: executedQuerySchema.safeParse(
        executedQuery({ executedAt: "2026-07-28T10:30:00" }),
      ).success,
    }).toEqual({
      country: false,
      error: false,
      language: false,
      query: false,
      results: false,
      timestamp: false,
    });
  });

  it("accepts only strict bounded observed entities with public URLs", () => {
    expect({
      fictional: observedEntitySchema.safeParse(
        observedEntity({ fictionalExample: true }),
      ).success,
      privateWebsite: observedEntitySchema.safeParse(
        observedEntity({ websiteUrl: "http://127.0.0.1/company" }),
      ).success,
      publicLinkedInOrganization: observedEntitySchema.safeParse(
        observedEntity({
          linkedinOrganizationUrl: "https://www.linkedin.com/company/example",
        }),
      ).success,
      unrelatedLinkedInUrl: observedEntitySchema.safeParse(
        observedEntity({ linkedinOrganizationUrl: "https://example.com/team" }),
      ).success,
      valid: observedEntitySchema.safeParse(observedEntity()).success,
    }).toEqual({
      fictional: false,
      privateWebsite: false,
      publicLinkedInOrganization: true,
      unrelatedLinkedInUrl: false,
      valid: true,
    });
  });

  it("enforces every observed-entity string and metadata bound", () => {
    expect({
      country: observedEntitySchema.safeParse(
        observedEntity({ sourceCountry: "x".repeat(101) }),
      ).success,
      metadataBytes: observedEntitySchema.safeParse(
        observedEntity({ rawMetadata: { value: "x".repeat(8_193) } }),
      ).success,
      metadataDepth: observedEntitySchema.safeParse(
        observedEntity({ rawMetadata: { a: { b: { c: { d: true } } } } }),
      ).success,
      metadataKeys: observedEntitySchema.safeParse(
        observedEntity({
          rawMetadata: Object.fromEntries(
            Array.from({ length: 21 }, (_, index) => [`key${index}`, index]),
          ),
        }),
      ).success,
      name: observedEntitySchema.safeParse(
        observedEntity({ name: "x".repeat(201) }),
      ).success,
    }).toEqual({
      country: false,
      metadataBytes: false,
      metadataDepth: false,
      metadataKeys: false,
      name: false,
    });
  });

  it("accepts only concise strict evidence records from public sources", () => {
    expect({
      body: evidenceSchema.safeParse(evidenceItem({ body: "full page" }))
        .success,
      fullPage: evidenceSchema.safeParse(
        evidenceItem({ fullPage: "full page" }),
      ).success,
      html: evidenceSchema.safeParse(evidenceItem({ html: "<main />" }))
        .success,
      longExcerpt: evidenceSchema.safeParse(
        evidenceItem({ excerpt: "x".repeat(501) }),
      ).success,
      privateUrl: evidenceSchema.safeParse(
        evidenceItem({ sourceUrl: "http://localhost/evidence" }),
      ).success,
      rawContent: evidenceSchema.safeParse(
        evidenceItem({ rawContent: "full page" }),
      ).success,
      unknownSourceFamily: evidenceSchema.safeParse(
        evidenceItem({ sourceFamily: "unknown_source" }),
      ).success,
      valid: evidenceSchema.safeParse(evidenceItem()).success,
    }).toEqual({
      body: false,
      fullPage: false,
      html: false,
      longExcerpt: false,
      privateUrl: false,
      rawContent: false,
      unknownSourceFamily: false,
      valid: true,
    });
  });

  it("enforces every evidence field and collection bound", () => {
    expect({
      claim: evidenceSchema.safeParse(
        evidenceItem({ claim: "x".repeat(1_001) }),
      ).success,
      country: evidenceSchema.safeParse(
        evidenceItem({ sourceCountry: "x".repeat(101) }),
      ).success,
      evidenceConfidence: evidenceSchema.safeParse(
        evidenceItem({ evidenceConfidence: 101 }),
      ).success,
      language: evidenceSchema.safeParse(
        evidenceItem({ sourceLanguage: "x".repeat(36) }),
      ).success,
      sourceName: evidenceSchema.safeParse(
        evidenceItem({ sourceName: "x".repeat(201) }),
      ).success,
      summary: evidenceSchema.safeParse(
        evidenceItem({ englishSummary: "x".repeat(2_001) }),
      ).success,
      supportedFieldPath: evidenceSchema.safeParse(
        evidenceItem({ supportedFieldPaths: ["x".repeat(201)] }),
      ).success,
      supportedFieldPaths: evidenceSchema.safeParse(
        evidenceItem({
          supportedFieldPaths: Array.from(
            { length: 51 },
            (_, index) => `field.${index}`,
          ),
        }),
      ).success,
      timestamp: evidenceSchema.safeParse(
        evidenceItem({ observedAt: "2026-07-28T10:30:00" }),
      ).success,
      translationConfidence: evidenceSchema.safeParse(
        evidenceItem({ translationConfidence: -1 }),
      ).success,
    }).toEqual({
      claim: false,
      country: false,
      evidenceConfidence: false,
      language: false,
      sourceName: false,
      summary: false,
      supportedFieldPath: false,
      supportedFieldPaths: false,
      timestamp: false,
      translationConfidence: false,
    });
  });

  it("accepts only strict bounded requirement drafts", () => {
    expect({
      fictional: requirementSchema.safeParse(
        requirement({ fictionalExample: true }),
      ).success,
      longSummary: requirementSchema.safeParse(
        requirement({ summary: "x".repeat(1_001) }),
      ).success,
      unknownKind: requirementSchema.safeParse(
        requirement({ kind: "other_requirement" }),
      ).success,
      valid: requirementSchema.safeParse(requirement()).success,
    }).toEqual({
      fictional: false,
      longSummary: false,
      unknownKind: false,
      valid: true,
    });
  });

  it("enforces every requirement-draft field bound", () => {
    expect({
      confidence: requirementSchema.safeParse(requirement({ confidence: 101 }))
        .success,
      summary: requirementSchema.safeParse(
        requirement({ summary: "x".repeat(1_001) }),
      ).success,
    }).toEqual({ confidence: false, summary: false });
  });

  it("accepts only evidence-backed strict signal drafts", () => {
    expect({
      emptyEvidence: signalDraftSchema.safeParse(
        signalDraft({ evidence: [] }),
      ).success,
      emptyRequirements: signalDraftSchema.safeParse(
        signalDraft({ requirements: [] }),
      ).success,
      fictional: signalDraftSchema.safeParse(
        signalDraft({ fictionalExample: true }),
      ).success,
      unknownClass: signalDraftSchema.safeParse(
        signalDraft({ signalClass: "unclassified" }),
      ).success,
      valid: signalDraftSchema.safeParse(signalDraft()).success,
    }).toEqual({
      emptyEvidence: false,
      emptyRequirements: false,
      fictional: false,
      unknownClass: false,
      valid: true,
    });
  });

  it("enforces every signal-draft field and nested collection bound", () => {
    expect({
      country: signalDraftSchema.safeParse(
        signalDraft({ sourceCountry: "x".repeat(101) }),
      ).success,
      evidence: signalDraftSchema.safeParse(
        signalDraft({
          evidence: Array.from({ length: 101 }, () => evidenceItem()),
        }),
      ).success,
      factualSummary: signalDraftSchema.safeParse(
        signalDraft({ factualSummary: "x".repeat(2_001) }),
      ).success,
      interpretationSummary: signalDraftSchema.safeParse(
        signalDraft({ interpretationSummary: "x".repeat(2_001) }),
      ).success,
      requirements: signalDraftSchema.safeParse(
        signalDraft({
          requirements: Array.from({ length: 101 }, () => requirement()),
        }),
      ).success,
      timestamp: signalDraftSchema.safeParse(
        signalDraft({ observedAt: "2026-07-28T10:30:00" }),
      ).success,
      title: signalDraftSchema.safeParse(
        signalDraft({ title: "x".repeat(301) }),
      ).success,
    }).toEqual({
      country: false,
      evidence: false,
      factualSummary: false,
      interpretationSummary: false,
      requirements: false,
      timestamp: false,
      title: false,
    });
  });

  it("accepts only strict bounded source errors", () => {
    expect({
      badFingerprint: sourceErrorSchema.safeParse(
        sourceError({ queryFingerprint: "short" }),
      ).success,
      fictional: sourceErrorSchema.safeParse(
        sourceError({ fictionalExample: true }),
      ).success,
      longMessage: sourceErrorSchema.safeParse(
        sourceError({ message: "x".repeat(1_001) }),
      ).success,
      valid: sourceErrorSchema.safeParse(sourceError()).success,
    }).toEqual({
      badFingerprint: false,
      fictional: false,
      longMessage: false,
      valid: true,
    });
  });

  it("enforces every source-error string bound", () => {
    expect({
      message: sourceErrorSchema.safeParse(
        sourceError({ message: "x".repeat(1_001) }),
      ).success,
      sourceName: sourceErrorSchema.safeParse(
        sourceError({ sourceName: "x".repeat(201) }),
      ).success,
    }).toEqual({ message: false, sourceName: false });
  });

  it("applies the shared metadata limits at every nested metadata field", () => {
    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`key${index}`, index]),
    );

    expect({
      entity: observedEntitySchema.safeParse(
        observedEntity({ rawMetadata: tooManyKeys }),
      ).success,
      evidence: evidenceSchema.safeParse(
        evidenceItem({ rawMetadata: tooManyKeys }),
      ).success,
      requirement: requirementSchema.safeParse(
        requirement({ rawMetadata: tooManyKeys }),
      ).success,
      signal: signalDraftSchema.safeParse(
        signalDraft({ rawMetadata: tooManyKeys }),
      ).success,
    }).toEqual({
      entity: false,
      evidence: false,
      requirement: false,
      signal: false,
    });
  });

  it("applies shared public-host safety to every batch URL field", () => {
    expect({
      evidence: evidenceSchema.safeParse(
        evidenceItem({ sourceUrl: "http://10.0.0.1/evidence" }),
      ).success,
      linkedin: observedEntitySchema.safeParse(
        observedEntity({
          linkedinOrganizationUrl: "http://127.0.0.1/company/example",
        }),
      ).success,
      website: observedEntitySchema.safeParse(
        observedEntity({ websiteUrl: "http://localhost/company" }),
      ).success,
    }).toEqual({ evidence: false, linkedin: false, website: false });
  });

  it("caps evidence at 100 items across the entire batch", () => {
    const signals = Array.from({ length: 20 }, () =>
      signalDraft({
        evidence: Array.from({ length: 5 }, () => evidenceItem()),
      }),
    );
    const tooManyEvidence = signals.map((signal, index) =>
      index === 0
        ? { ...signal, evidence: [...signal.evidence, evidenceItem()] }
        : signal,
    );

    expect({
      atLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals,
      }).success,
      aboveLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals: tooManyEvidence,
      }).success,
    }).toEqual({ atLimit: true, aboveLimit: false });
  });

  it("caps requirements at 100 items across the entire batch", () => {
    const signals = Array.from({ length: 20 }, () =>
      signalDraft({
        requirements: Array.from({ length: 5 }, () => requirement()),
      }),
    );
    const tooManyRequirements = signals.map((signal, index) =>
      index === 0
        ? {
            ...signal,
            requirements: [...signal.requirements, requirement()],
          }
        : signal,
    );

    expect({
      atLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals,
      }).success,
      aboveLimit: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals: tooManyRequirements,
      }).success,
    }).toEqual({ atLimit: true, aboveLimit: false });
  });

  it("rejects a valid-shape batch above two serialized MiB", () => {
    const rawMetadata = { padding: "x".repeat(8_150) };
    const signals = Array.from({ length: 20 }, () =>
      signalDraft({
        evidence: Array.from({ length: 5 }, () =>
          evidenceItem({ rawMetadata }),
        ),
        requirements: Array.from({ length: 5 }, () =>
          requirement({ rawMetadata }),
        ),
        rawMetadata,
      }),
    );
    const batch = {
      ...honestEmptyBatch(),
      entities: Array.from({ length: 50 }, () =>
        observedEntity({ rawMetadata }),
      ),
      signals,
    };

    expect({
      bytesAboveLimit: serializedJsonByteLength(batch) > 2 * 1_024 * 1_024,
      nestedShapeValid: signalDraftSchema.safeParse(signals[0]).success,
      valid: globalRadarBatchSchema.safeParse(batch).success,
    }).toEqual({
      bytesAboveLimit: true,
      nestedShapeValid: true,
      valid: false,
    });
  });

  it("accepts honest empty and partial batches but rejects failed empty batches", () => {
    expect({
      honestEmpty: globalRadarBatchSchema.safeParse(honestEmptyBatch()).success,
      partial: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        signals: [signalDraft()],
        sourceErrors: [sourceError()],
      }).success,
      zeroSignalsWithError: globalRadarBatchSchema.safeParse({
        ...honestEmptyBatch(),
        sourceErrors: [sourceError()],
      }).success,
    }).toEqual({
      honestEmpty: true,
      partial: true,
      zeroSignalsWithError: false,
    });
  });

  it("defines the exact managed contract vocabularies", () => {
    expect(signalClasses).toEqual([
      "direct_demand",
      "demand_precursor",
      "ecosystem_momentum",
    ]);
    expect(indiaRelevanceTypes).toEqual([
      "explicit_India",
      "existing_India_presence",
      "India_expansion",
      "globally_open",
      "inferred_India_compatible",
      "no_current_India_fit",
    ]);
    expect(signalStatuses).toEqual([
      "newly_discovered",
      "needs_review",
      "monitoring",
      "qualified",
      "dismissed",
      "expired",
      "promoted",
    ]);
    expect(requirementKinds).toEqual([
      "physical_data",
      "robotics_hardware",
      "manufacturing",
      "deployment",
      "market_access",
      "research",
      "operational_service",
    ]);
    expect(radarRunStatuses).toEqual([
      "queued",
      "running",
      "succeeded",
      "partial",
      "failed",
    ]);
    expect(radarRunTriggers).toEqual(["scheduled", "manual", "trial"]);
    expect(radarScanModes).toEqual([
      "daily",
      "thematic",
      "watchlist_refresh",
      "manual",
    ]);
    expect(promotionEligibilityPaths).toEqual([
      "qualified_india_direct_demand",
      "repeated_india_compatible_signals",
      "documented_indian_relationship",
      "exceptional_strategic_relevance",
    ]);
    expect(professionalResponsePathTypes).toEqual([
      "supplier_or_partner_registration",
      "procurement_or_rfp_portal",
      "distributor_application",
      "official_enquiry_or_india_contact",
      "research_form",
      "official_business_email",
    ]);
  });

  it("exposes readonly lookups for every managed contract vocabulary", () => {
    expect({
      indiaRelevanceTypeLookup,
      professionalResponsePathTypeLookup,
      promotionEligibilityPathLookup,
      radarRunStatusLookup,
      radarRunTriggerLookup,
      radarScanModeLookup,
      requirementKindLookup,
      signalClassLookup,
      signalStatusLookup,
    }).toEqual({
      indiaRelevanceTypeLookup: Object.fromEntries(
        indiaRelevanceTypes.map((value) => [value, true]),
      ),
      professionalResponsePathTypeLookup: Object.fromEntries(
        professionalResponsePathTypes.map((value) => [value, true]),
      ),
      promotionEligibilityPathLookup: Object.fromEntries(
        promotionEligibilityPaths.map((value) => [value, true]),
      ),
      radarRunStatusLookup: Object.fromEntries(
        radarRunStatuses.map((value) => [value, true]),
      ),
      radarRunTriggerLookup: Object.fromEntries(
        radarRunTriggers.map((value) => [value, true]),
      ),
      radarScanModeLookup: Object.fromEntries(
        radarScanModes.map((value) => [value, true]),
      ),
      requirementKindLookup: Object.fromEntries(
        requirementKinds.map((value) => [value, true]),
      ),
      signalClassLookup: Object.fromEntries(
        signalClasses.map((value) => [value, true]),
      ),
      signalStatusLookup: Object.fromEntries(
        signalStatuses.map((value) => [value, true]),
      ),
    });
  });

  it("normalizes public HTTP(S) URLs with the shared safety rules", () => {
    expect(
      publicHttpUrlSchema.parse(
        "https://WWW.Example.com/evidence/?utm_source=test#claim",
      ),
    ).toBe("https://example.com/evidence");
  });

  it("preserves nullable versus known-empty bounded arrays", () => {
    expect([
      nullableBoundedStringArraySchema.parse(null),
      nullableBoundedStringArraySchema.parse([]),
    ]).toEqual([null, []]);
  });

  it("bounds common string arrays", () => {
    expect(
      nullableBoundedStringArraySchema.safeParse(
        Array.from({ length: 51 }, () => "value"),
      ).success,
    ).toBe(false);
  });

  it("trims and bounds common strings", () => {
    expect({
      tooLong: boundedShortStringSchema.safeParse("x".repeat(201)).success,
      value: boundedShortStringSchema.parse("  supported fact  "),
    }).toEqual({ tooLong: false, value: "supported fact" });
  });

  it("bounds JSON records by keys, depth, and serialized bytes", () => {
    expect({
      empty: boundedRecordSchema.parse({}),
      tooDeep: boundedRecordSchema.safeParse({ a: { b: { c: { d: true } } } })
        .success,
      tooLarge: boundedRecordSchema.safeParse({ value: "x".repeat(8_193) })
        .success,
      tooManyKeys: boundedRecordSchema.safeParse(
        Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [`key${index}`, index]),
        ),
      ).success,
    }).toEqual({
      empty: {},
      tooDeep: false,
      tooLarge: false,
      tooManyKeys: false,
    });
  });

  it("accepts only integer confidence and score components from 0 to 100", () => {
    expect({
      confidence: confidenceSchema.parse(73),
      fractional: scoreComponentSchema.safeParse(73.5).success,
      high: scoreComponentSchema.safeParse(101).success,
      low: scoreComponentSchema.safeParse(-1).success,
    }).toEqual({ confidence: 73, fractional: false, high: false, low: false });
  });

  it("accepts only ISO timestamps with an explicit timezone", () => {
    expect({
      dateOnly: isoTimestampSchema.safeParse("2026-07-28").success,
      invalid: isoTimestampSchema.safeParse("2026-02-30T10:30:00Z").success,
      valid: isoTimestampSchema.parse("2026-07-28T10:30:00.000Z"),
    }).toEqual({
      dateOnly: false,
      invalid: false,
      valid: "2026-07-28T10:30:00.000Z",
    });
  });

  it("requires one evidence-backed professional response channel", () => {
    const evidenceUrl = "https://example.com/suppliers";

    expect({
      email: professionalResponsePathSchema.parse({
        type: "official_business_email",
        url: null,
        businessEmail: "  PARTNERS@EXAMPLE.COM ",
        evidenceUrl,
      }),
      mismatched: professionalResponsePathSchema.safeParse({
        type: "official_business_email",
        url: "https://example.com/contact",
        businessEmail: null,
        evidenceUrl,
      }).success,
      portal: professionalResponsePathSchema.parse({
        type: "procurement_or_rfp_portal",
        url: "https://example.com/procurement",
        businessEmail: null,
        evidenceUrl,
      }),
    }).toEqual({
      email: {
        type: "official_business_email",
        url: null,
        businessEmail: "partners@example.com",
        evidenceUrl,
      },
      mismatched: false,
      portal: {
        type: "procurement_or_rfp_portal",
        url: "https://example.com/procurement",
        businessEmail: null,
        evidenceUrl,
      },
    });
  });
});
