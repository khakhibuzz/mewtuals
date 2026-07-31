export const GLOBAL_RADAR_TEST_NOW = "2026-07-31T00:00:00.000Z" as const;
export const GLOBAL_RADAR_TEST_OBSERVED_AT =
  "2026-07-30T12:00:00.000Z" as const;
export const GLOBAL_RADAR_TEST_PUBLISHED_AT =
  "2026-07-29T09:00:00.000Z" as const;
export const GLOBAL_RADAR_TEST_EXPIRES_AT =
  "2026-09-30T00:00:00.000Z" as const;

const systemsContextSummary =
  "This fictional systems context connects the publicly stated requirement to the operational stack without claiming a commercial match. It identifies the lower-level inputs, the transformation step, and the downstream robot or model behaviour that the signal could affect. The factual elements remain limited to the cited announcement or request. The possible Indian execution role is an interpretation for review, not evidence of availability, capability, compliance, or a partnership. Any live use would require fresh public verification, legal review, and an administrator decision before qualification or promotion.";

const sensitiveDataCategories = [
  "faces",
  "voices",
  "biometrics",
  "gaze",
  "health",
  "children",
  "home_interiors",
  "workplace_monitoring",
  "precise_location",
  "road_users",
  "employee_data",
  "industrial_secrets",
  "defence_or_dual_use",
  "copyrighted_material",
  "export_controls",
] as const;

type SensitiveDataState = "not_observed" | "possible" | "severe" | null;

function globalRadarTestSensitiveDataFlags(
  state: SensitiveDataState,
): SensitiveDataAndCompliance["sensitiveDataFlags"] {
  return Object.fromEntries(
    sensitiveDataCategories.map((category) => [category, state]),
  ) as SensitiveDataAndCompliance["sensitiveDataFlags"];
}

export function globalRadarTestResolvedCompliance(
  overrides: Partial<
    Record<(typeof sensitiveDataCategories)[number], SensitiveDataState>
  > = {},
): SensitiveDataAndCompliance {
  return {
    sensitiveDataFlags: {
      ...globalRadarTestSensitiveDataFlags("not_observed"),
      ...overrides,
    },
    complianceFacts: {
      consent: true,
      deIdentification: true,
      legalReview: true,
      knownResidencyRequirements: false,
      participantRightsComplexity: false,
    },
  };
}

export function globalRadarTestUnresolvedCompliance(): SensitiveDataAndCompliance {
  return {
    sensitiveDataFlags: globalRadarTestSensitiveDataFlags(null),
    complianceFacts: {
      consent: null,
      deIdentification: null,
      legalReview: null,
      knownResidencyRequirements: null,
      participantRightsComplexity: null,
    },
  };
}

export function globalRadarTestEntity(input: {
  entityRef: string;
  canonicalName: string;
  host: string;
  country: string;
  organisationType: string;
  sector: string;
  group: string;
}) {
  return {
    entityRef: input.entityRef,
    canonicalName: input.canonicalName,
    websiteUrl: `https://${input.host}.example/about`,
    linkedinOrganizationUrl: null,
    stablePublicIdentifiers: [
      { namespace: "fictional_registry", value: input.host },
    ],
    canonicalCorporateGroupId: input.group,
    headquartersCountry: input.country,
    headquartersCity: null,
    operatingCountries: [input.country],
    organisationType: input.organisationType,
    sector: input.sector,
    shortDescription: `${input.canonicalName} is a fictional organisation used only for contract tests.`,
    rawMetadata: {},
  };
}

export function globalRadarTestRequirement(input: {
  kind:
    | "physical_data"
    | "robotics_hardware"
    | "manufacturing"
    | "deployment"
    | "market_access"
    | "research"
    | "operational_service";
  capabilityTag: string;
  summary: string;
  archetypes: string[];
  dataFamilies?: string[];
  sensorModalities?: string[];
  environments?: string[];
  taskFamilies?: string[];
  collectionMethods?: string[];
  humanRoles?: string[];
  robotEmbodiments?: string[];
}) {
  return {
    kind: input.kind,
    capabilityTag: input.capabilityTag,
    summary: input.summary,
    dataFamilies: input.dataFamilies ?? [],
    sensorModalities: input.sensorModalities ?? [],
    environments: input.environments ?? [],
    taskFamilies: input.taskFamilies ?? [],
    collectionMethods: input.collectionMethods ?? [],
    humanRoles: input.humanRoles ?? [],
    robotEmbodiments: input.robotEmbodiments ?? [],
    indianExecutionArchetypes: input.archetypes,
    scaleSpecifications: null,
    technicalSpecifications: null,
    qualitySpecifications: null,
    rightsAndComplianceSpecifications: null,
    confidence: 90,
    globallyDeliverable: true,
    openToExternalCounterparties: true,
  };
}

export function globalRadarTestPhysicalDataSystemsContext(input: {
  goal: string;
  transformation: string;
  downstream: string;
  role: string;
  factualElement: string;
  layer?: "annotation" | "qa";
}) {
  const layer = input.layer ?? "annotation";
  return {
    stackType: "physical_data",
    higherLevelSystemGoal: input.goal,
    relevantStackLayer: layer,
    lowerLevelInputsRequired:
      layer === "qa"
        ? ["real_world_access", "sensor_capture", "ingestion", "annotation"]
        : ["real_world_access", "sensor_capture", "ingestion", "curation"],
    transformationOrCapabilityAdded: input.transformation,
    downstreamModelOrRobotBehavior: input.downstream,
    whyTheRequirementMatters:
      "The requested evidence is needed to evaluate a physical system against its stated operating conditions.",
    possibleIndianExecutionRole: input.role,
    factualElements: [input.factualElement],
    inferredElements: [
      "Execution in India would require separate capability, rights, and compliance verification.",
    ],
    systemsContextSummary,
  };
}

export function globalRadarTestHardwareSystemsContext(input: {
  goal: string;
  transformation: string;
  downstream: string;
  role: string;
  factualElement: string;
  layer?: "assembly" | "deployment";
}) {
  const layer = input.layer ?? "assembly";
  return {
    stackType: "hardware",
    higherLevelSystemGoal: input.goal,
    relevantStackLayer: layer,
    lowerLevelInputsRequired:
      layer === "deployment"
        ? [
            "components",
            "actuators_and_joints",
            "compute_and_chips",
            "assembly",
            "testing",
            "integration",
          ]
        : ["components", "actuators_and_joints", "compute_and_chips"],
    transformationOrCapabilityAdded: input.transformation,
    downstreamModelOrRobotBehavior: input.downstream,
    whyTheRequirementMatters:
      "The hardware stage connects specified components to a testable physical system outcome.",
    possibleIndianExecutionRole: input.role,
    factualElements: [input.factualElement],
    inferredElements: [
      "Execution in India would require separate supplier and compliance verification.",
    ],
    systemsContextSummary,
  };
}

export function globalRadarTestDirectScoreComponents() {
  return {
    explicitness: 90,
    evidenceConfidence: 90,
    freshness: 90,
    actionability: 85,
    indiaFit: 85,
    commercialPotential: 80,
    repeatability: 75,
    responseAccessibility: null,
    strategicLearning: 80,
    complianceComplexity: 25,
  };
}

export function globalRadarTestPrecursorScoreComponents() {
  return {
    evidenceConfidence: 90,
    proximityToExternalDemand: 70,
    fundingDeploymentMomentum: 85,
    likelyDataHardwareIntensity: 85,
    indiaFit: 60,
    estimatedTimeHorizon: 70,
    strategicRelevance: 85,
  };
}

export function globalRadarTestEvidence(input: {
  contributorEntityRef: string;
  url: string;
  sourceName: string;
  sourceCountry: string;
  sourceFamily:
    | "official_company_material"
    | "official_partner_supplier_pages"
    | "official_research"
    | "government_and_industry_sources";
  claim: string;
  englishSummary: string;
  supportedFieldPaths: string[];
  sourceLanguage?: string;
  translationConfidence?: number | null;
  isPrimarySource?: boolean;
}) {
  return {
    contributorEntityRef: input.contributorEntityRef,
    sourceUrl: input.url,
    canonicalSourceUrl: input.url,
    sourceName: input.sourceName,
    sourceType: "official fictional publication",
    sourceKind: "original",
    sourceLanguage: input.sourceLanguage ?? "en",
    sourceCountry: input.sourceCountry,
    sourceFamily: input.sourceFamily,
    claim: input.claim,
    excerpt: input.claim,
    englishSummary: input.englishSummary,
    publishedAt: GLOBAL_RADAR_TEST_PUBLISHED_AT,
    observedAt: GLOBAL_RADAR_TEST_OBSERVED_AT,
    evidenceConfidence: 90,
    translationConfidence: input.translationConfidence ?? null,
    isPrimarySource: input.isPrimarySource ?? true,
    isOfficialProcurementSource: false,
    isSyndicated: false,
    supportsDirectDemand: input.supportedFieldPaths.some((path) =>
      path.startsWith("directDemandAsk."),
    ),
    supportsIndiaRelevance: input.supportedFieldPaths.some((path) =>
      path.startsWith("indiaRelevance."),
    ),
    supportedFieldPaths: input.supportedFieldPaths,
    rawMetadata: {},
  };
}

export function globalRadarTestExecutedQuery(input: {
  fingerprintCharacter: string;
  query: string;
  language: string;
  sourceCountry: string;
  theme:
    | "robot_teleoperation_demonstrations"
    | "autonomous_mobility_and_drones"
    | "multilingual_speech_and_human_robot_interaction"
    | "robotics_manufacturing"
    | "physical_ai_evaluation";
  signalIntent: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
}) {
  return {
    fingerprint: input.fingerprintCharacter.repeat(64),
    query: input.query,
    language: input.language,
    sourceCountry: input.sourceCountry,
    theme: input.theme,
    signalIntent: input.signalIntent,
    sourceAdapter: "codex_public_web",
    recencyDays: 30,
    ordinal: 0,
    executedAt: "2026-07-30T11:30:00.000Z",
    resultsExamined: 3,
    error: null,
  };
}

export function globalRadarTestEnvelope(input: {
  runId: string;
  planFingerprintCharacter: string;
  executedQuery: ReturnType<typeof globalRadarTestExecutedQuery>;
  entities: ReturnType<typeof globalRadarTestEntity>[];
  signal: Record<string, unknown>;
}) {
  return {
    schemaVersion: "global-radar-batch-v1",
    promptVersion: "codex-public-web-v1",
    taxonomyVersion: "global-radar-v1",
    runId: input.runId,
    planFingerprint: input.planFingerprintCharacter.repeat(64),
    executedQueries: [input.executedQuery],
    entities: input.entities,
    signals: [input.signal],
    sourceErrors: [],
  };
}
import type { SensitiveDataAndCompliance } from "../../app/domain/global-radar";
