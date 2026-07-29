import { z } from "zod";

import {
  boundedRecordSchema,
  boundedShortStringSchema,
  candidateEvidenceSchema,
  confidenceSchema,
  indiaRelevanceTypes,
} from "./contracts";
import { normalizedRequirementSchema } from "./requirements";

export const indiaEvidenceFactKinds = [
  "suppliers",
  "participants",
  "languages",
  "roads_or_environments",
  "manufacturing",
  "distribution",
  "collection",
  "installation",
  "service",
] as const;
type IndiaEvidenceFactKind = (typeof indiaEvidenceFactKinds)[number];
type ExactIndiaRelevanceType =
  | "explicit_India"
  | "existing_India_presence"
  | "India_expansion";
const exactEvidenceRelevanceTypes = new Set([
  "explicit_India",
  "existing_India_presence",
  "India_expansion",
]);
const latinIndiaMarkerPattern =
  /(?:^|[^\p{L}\p{N}])(?:India|Indian|Indians)(?=$|[^\p{L}\p{N}])/iu;
const originalLanguageIndiaMarkers = ["भारत", "भारतीय", "印度"] as const;
const excludingClaimPatterns = [
  /\b(?:no|not|never|cannot|can't|won't|without)\b/iu,
  /\b(?:abandon|abandoned|against|ban|banned|cancelled|canceled|ceased|closed|except|exclude|excluded|excludes|excluding|only|outside|prohibit|prohibited|unavailable|withdraw|withdrawn)\b/iu,
  /नहीं|नही|बहिष्कृत|बंद|प्रतिबंधित/u,
  /不|无|未|仅|排除|关闭|禁止/u,
] as const;
const positiveActionPatterns = [
  /\b(?:accept|accepts|accepted|accepting|collect|collects|collecting|deploy|deploys|deploying|distribute|distributes|distributing|establish|established|expand|expands|expanding|has|have|install|installs|installing|invite|invites|inviting|launch|launches|launching|maintain|maintains|manufacture|manufactures|manufacturing|offer|offers|offering|operate|operates|operating|produce|produces|producing|provide|provides|providing|recruit|recruits|recruiting|seek|seeks|seeking|service|services|servicing|support|supports|supporting|use|uses|using)\b/iu,
  /स्वीकार|तलाश|भर्ती|चालू|संचालित|विस्तार|प्रदान|संग्रह|संकलन|स्थापना|सेवा|विनिर्माण/u,
  /接受|寻找|招募|运营|设有|扩大|扩张|拓展|提供|收集|采集|安装|部署|服务|维护|制造|分销/u,
] as const;
const existingPresencePatterns = [
  /\b(?:active|current|currently|established|existing|has|have|maintain|maintains|operate|operates|operating|present)\b/iu,
  /वर्तमान|चालू|संचालित|मौजूद|स्थापित/u,
  /目前|现有|已有|运营|设有|已建立/u,
] as const;
const expansionPatterns = [
  /\b(?:enter|entering|expand|expands|expanding|expansion|grow|growing|launch|launches|launching|new)\b/iu,
  /विस्तार|प्रवेश|शुरू|नया/u,
  /扩大|扩张|拓展|进入|新增|启动|正在/u,
] as const;
const globalScopePatterns = [
  /\b(?:global|globally|international|internationally|worldwide)\b/iu,
  /\b(?:all|any)\s+(?:countries|country)\b/iu,
  /\baround\s+the\s+world\b/iu,
  /全球|国际|世界各地|任何国家|各国/u,
] as const;
const opennessActionPatterns = [
  /\b(?:accept|accepts|accepted|accepting|available|eligible|invite|invites|inviting|open|opened|opens|welcome|welcomes|welcoming)\b/iu,
  /开放|接受|欢迎|可申请|面向/u,
] as const;
const restrictingOpennessPatterns = [
  /\b(?:domestic|domestic-only|limited\s+to|local-only|restricted\s+to)\b/iu,
  /仅限|只限|限于|国内/u,
] as const;
const factSupportPatterns: Readonly<
  Record<IndiaEvidenceFactKind, readonly RegExp[]>
> = {
  suppliers: [
    /\b(?:procurement|sourcing|supplier|suppliers|vendor|vendors)\b/iu,
    /आपूर्तिकर्त/u,
    /供应商|供货商|采购/u,
  ],
  participants: [
    /\b(?:participant|participants|recruit|recruitment)\b/iu,
    /प्रतिभाग|भर्ती/u,
    /参与者|参与人员|招募/u,
  ],
  languages: [
    /\b(?:language|languages|linguistic)\b/iu,
    /भाष/u,
    /语言/u,
  ],
  roads_or_environments: [
    /\b(?:environment|environments|field|road|roads|site|sites)\b/iu,
    /सड़क|परिवेश|वातावरण|स्थल/u,
    /道路|环境|场地/u,
  ],
  manufacturing: [
    /\b(?:factories|factory|manufacture|manufactures|manufacturing|plant|plants|produce|produces|production)\b/iu,
    /विनिर्माण|निर्माण|उत्पादन/u,
    /制造|工厂|生产/u,
  ],
  distribution: [
    /\b(?:distribute|distributes|distributing|distribution|distributor|distributors)\b/iu,
    /वितरण/u,
    /分销|经销|配送/u,
  ],
  collection: [
    /\b(?:capture|collect|collecting|collection)\b/iu,
    /संग्रह|संकलन/u,
    /收集|采集/u,
  ],
  installation: [
    /\b(?:deploy|deploying|deployment|install|installation|installs|installing)\b/iu,
    /स्थापना|इंस्टॉल/u,
    /安装|部署/u,
  ],
  service: [
    /\b(?:maintain|maintains|maintenance|service|services|servicing|support|supports)\b/iu,
    /सेवा|रखरखाव/u,
    /服务|维护/u,
  ],
};

const assessedRequirementSchema = z.strictObject({
  requirement: normalizedRequirementSchema,
  globallyDeliverable: z.boolean().nullable(),
  openToExternalCounterparties: z.boolean().nullable(),
});

const boundedAssessmentStrings = z.array(boundedShortStringSchema).max(50);

export const indiaRelevanceInputSchema = z.strictObject({
  proposedType: z.enum(indiaRelevanceTypes),
  evidence: z.array(candidateEvidenceSchema).max(100),
  exclusionEvidence: z.array(candidateEvidenceSchema).max(100),
  requirements: z.array(assessedRequirementSchema).max(100),
  reasons: boundedAssessmentStrings,
  constraints: boundedAssessmentStrings,
  unknowns: boundedAssessmentStrings,
  confidence: confidenceSchema,
  regulatoryFacts: boundedRecordSchema.nullable(),
  logisticsFacts: boundedRecordSchema.nullable(),
});

export const indiaRelevanceAssessmentFailureReasons = [
  "invalid_assessment_input",
  "missing_exact_original_evidence",
  "missing_global_openness_evidence",
  "missing_open_requirement",
  "missing_indian_execution_archetype",
  "india_exclusion_present",
] as const;

export const indiaRelevanceAssessmentSchema = z.discriminatedUnion(
  "assessed",
  [
    z.strictObject({
      assessed: z.literal(true),
      relevanceType: z.enum(indiaRelevanceTypes),
      basis: z.enum([
        "exact_public_evidence",
        "mewtuals_interpretation",
        "globally_open",
        "no_current_fit",
      ]),
      reasons: boundedAssessmentStrings,
      constraints: boundedAssessmentStrings,
      unknowns: boundedAssessmentStrings,
      confidence: confidenceSchema,
      supportedEvidencePaths: z
        .array(boundedShortStringSchema)
        .max(100),
      regulatoryFacts: boundedRecordSchema.nullable(),
      logisticsFacts: boundedRecordSchema.nullable(),
      monitorable: z.boolean(),
    }),
    z.strictObject({
      assessed: z.literal(false),
      reason: z.enum(indiaRelevanceAssessmentFailureReasons),
    }),
  ],
);

export type IndiaRelevanceInput = Readonly<
  z.input<typeof indiaRelevanceInputSchema>
>;
export type IndiaRelevanceAssessment = Readonly<
  z.output<typeof indiaRelevanceAssessmentSchema>
>;

function rejectIndiaAssessment(
  reason: (typeof indiaRelevanceAssessmentFailureReasons)[number],
): IndiaRelevanceAssessment {
  return Object.freeze({ assessed: false, reason });
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
    );
  }
  return value;
}

function deepFreezeJson(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const item of Object.values(value)) deepFreezeJson(item);
  Object.freeze(value);
}

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function hasIndiaMarker(value: string): boolean {
  return (
    latinIndiaMarkerPattern.test(value) ||
    originalLanguageIndiaMarkers.some((marker) => value.includes(marker))
  );
}

function positivelySupportsExactIndiaFact(
  value: string,
  relevanceType: ExactIndiaRelevanceType,
  factKind: IndiaEvidenceFactKind,
): boolean {
  if (
    !hasIndiaMarker(value) ||
    matchesAny(value, excludingClaimPatterns) ||
    !matchesAny(value, factSupportPatterns[factKind]) ||
    !matchesAny(value, positiveActionPatterns)
  ) {
    return false;
  }
  if (relevanceType === "existing_India_presence") {
    return matchesAny(value, existingPresencePatterns);
  }
  if (relevanceType === "India_expansion") {
    return matchesAny(value, expansionPatterns);
  }
  return true;
}

function positivelySupportsGlobalOpenness(value: string): boolean {
  return (
    !matchesAny(value, excludingClaimPatterns) &&
    !matchesAny(value, restrictingOpennessPatterns) &&
    matchesAny(value, globalScopePatterns) &&
    matchesAny(value, opennessActionPatterns)
  );
}

function acceptIndiaAssessment(
  assessment: z.output<typeof indiaRelevanceInputSchema>,
  basis:
    | "exact_public_evidence"
    | "globally_open"
    | "mewtuals_interpretation"
    | "no_current_fit",
  supportedEvidencePaths: readonly string[],
): IndiaRelevanceAssessment {
  const result = indiaRelevanceAssessmentSchema.parse({
    assessed: true,
    relevanceType: assessment.proposedType,
    basis,
    reasons: Object.freeze(assessment.reasons),
    constraints: Object.freeze(assessment.constraints),
    unknowns: Object.freeze(assessment.unknowns),
    confidence: assessment.confidence,
    supportedEvidencePaths,
    regulatoryFacts: cloneJsonValue(assessment.regulatoryFacts),
    logisticsFacts: cloneJsonValue(assessment.logisticsFacts),
    monitorable: true,
  });
  if (!result.assessed) {
    throw new Error("India relevance success output failed validation.");
  }
  Object.freeze(result.reasons);
  Object.freeze(result.constraints);
  Object.freeze(result.unknowns);
  Object.freeze(result.supportedEvidencePaths);
  deepFreezeJson(result.regulatoryFacts);
  deepFreezeJson(result.logisticsFacts);
  return Object.freeze(result);
}

function exactEvidencePaths(
  input: z.output<typeof indiaRelevanceInputSchema>,
): readonly string[] {
  if (!exactEvidenceRelevanceTypes.has(input.proposedType)) {
    return Object.freeze([]);
  }
  const relevanceType = input.proposedType as ExactIndiaRelevanceType;
  const allowedPathFacts: ReadonlyMap<string, IndiaEvidenceFactKind> = new Map(
    indiaEvidenceFactKinds.map(
      (factKind) => [
        `indiaRelevance.${relevanceType}.${factKind}`,
        factKind,
      ] as const,
    ),
  );
  return Object.freeze([
    ...new Set(
      input.evidence.flatMap((item) =>
        item.sourceKind === "original"
          ? item.supportedFieldPaths.filter((path) => {
              const factKind = allowedPathFacts.get(path);
              return (
                factKind !== undefined &&
                positivelySupportsExactIndiaFact(
                  item.originalText,
                  relevanceType,
                  factKind,
                )
              );
            })
          : [],
      ),
    ),
  ]);
}

export function assessIndiaRelevance(
  input: IndiaRelevanceInput | unknown,
): IndiaRelevanceAssessment {
  const parsed = indiaRelevanceInputSchema.safeParse(input);
  if (!parsed.success) {
    return rejectIndiaAssessment("invalid_assessment_input");
  }

  const assessment = parsed.data;
  const supportedEvidencePaths = exactEvidencePaths(assessment);
  if (assessment.proposedType === "no_current_India_fit") {
    return acceptIndiaAssessment(assessment, "no_current_fit", []);
  }
  if (assessment.proposedType === "globally_open") {
    const hasOpenRequirement = assessment.requirements.some(
      (item) =>
        item.globallyDeliverable === true ||
        item.openToExternalCounterparties === true,
    );
    if (!hasOpenRequirement) {
      return rejectIndiaAssessment("missing_open_requirement");
    }
    const opennessPath = "indiaRelevance.globally_open.requirement_access";
    const hasOriginalOpennessEvidence = assessment.evidence.some(
      (item) =>
        item.sourceKind === "original" &&
        item.supportedFieldPaths.includes(opennessPath) &&
        positivelySupportsGlobalOpenness(item.originalText),
    );
    if (!hasOriginalOpennessEvidence) {
      return rejectIndiaAssessment("missing_global_openness_evidence");
    }
    return acceptIndiaAssessment(
      assessment,
      "globally_open",
      Object.freeze([opennessPath]),
    );
  }
  if (assessment.proposedType === "inferred_India_compatible") {
    const hasOriginalExclusion = [
      assessment.evidence,
      assessment.exclusionEvidence,
    ].some((evidenceItems) =>
      evidenceItems.some(
        (item) =>
          item.sourceKind === "original" &&
          item.supportedFieldPaths.some((path) =>
            path.startsWith("indiaRelevance.no_current_India_fit."),
          ),
      ),
    );
    if (hasOriginalExclusion) {
      return rejectIndiaAssessment("india_exclusion_present");
    }
    const openRequirements = assessment.requirements.filter(
      (item) =>
        item.globallyDeliverable === true ||
        item.openToExternalCounterparties === true,
    );
    if (openRequirements.length === 0) {
      return rejectIndiaAssessment("missing_open_requirement");
    }
    if (
      !openRequirements.some(
        (item) => item.requirement.indianExecutionArchetypes.length > 0,
      )
    ) {
      return rejectIndiaAssessment("missing_indian_execution_archetype");
    }
    return acceptIndiaAssessment(
      assessment,
      "mewtuals_interpretation",
      supportedEvidencePaths,
    );
  }
  if (
    !exactEvidenceRelevanceTypes.has(assessment.proposedType) ||
    supportedEvidencePaths.length === 0
  ) {
    return rejectIndiaAssessment("missing_exact_original_evidence");
  }
  return acceptIndiaAssessment(
    assessment,
    "exact_public_evidence",
    supportedEvidencePaths,
  );
}
