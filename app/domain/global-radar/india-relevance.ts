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
const positiveActionPatterns = [
  /\b(?:accept|accepts|accepted|accepting|apply|applies|applying|collect|collects|collecting|deploy|deploys|deploying|distribute|distributes|distributing|eligible|establish|established|expand|expands|expanding|has|have|install|installs|installing|invite|invites|inviting|launch|launches|launching|maintain|maintains|manufacture|manufactures|manufacturing|offer|offers|offering|operate|operates|operating|permit|permits|permitted|produce|produces|producing|provide|provides|providing|recruit|recruits|recruiting|seek|seeks|seeking|service|services|servicing|support|supports|supporting|use|uses|using|welcome|welcomes|welcoming)\b/iu,
  /\b(?:can|may)\s+apply\b/iu,
  /स्वीकार|तलाश|भर्ती|चालू|संचालित|विस्तार|प्रदान|संग्रह|संकलन|स्थापना|सेवा|विनिर्माण/u,
  /接受|寻找|招募|运营|设有|扩大|扩张|拓展|提供|收集|采集|安装|部署|服务|维护|制造|分销/u,
] as const;
const existingPresencePatterns = [
  /\b(?:active|current|currently|established|existing|has|have|maintain|maintains|operate|operates|operating|present)\b/iu,
  /वर्तमान|चालू|संचालित|मौजूद|स्थापित/u,
  /目前|现有|已有|运营|设有|已建立|在印度/u,
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
  /\b(?:accept|accepts|accepted|accepting|apply|applies|applying|available|eligible|invite|invites|inviting|open|opened|opens|permit|permits|permitted|welcome|welcomes|welcoming)\b/iu,
  /\b(?:can|may)\s+apply\b/iu,
  /开放|接受|欢迎|可申请|面向/u,
] as const;
const englishNegatedRelevantActionPatterns = [
  /\b(?:are|can|could|did|do|does|had|has|have|is|must|shall|should|was|were|will|would)\s+not\s+(?!only\b)(?:currently\s+)?(?:accept|accepted|accepting|active|apply|available|collect|deploy|distribute|eligible|establish|expand|expanding|have|install|invite|launch|maintain|manufacture|offer|open|operate|operating|permit|permitted|present|produce|provide|recruit|seek|service|support|use|welcome)\b/iu,
  /\b(?:cannot|never)\s+(?:accept|apply|collect|deploy|distribute|establish|expand|have|install|invite|launch|maintain|manufacture|offer|open|operate|permit|produce|provide|recruit|seek|service|support|use|welcome)\b/iu,
  /\bnot\s+(?!only\b)(?:accepted|accepting|active|available|eligible|established|expanding|open|operating|permitted|present|welcome)\b/iu,
  /\b(?:decided\s+)?against\s+(?:accepting|collecting|deploying|distributing|establishing|expanding|installing|inviting|launching|maintaining|manufacturing|offering|operating|permitting|producing|providing|recruiting|seeking|servicing|supporting|using|welcoming)\b/iu,
  /\bno\s+longer\s+(?:accept|collect|deploy|distribute|establish|expand|have|install|invite|launch|maintain|manufacture|offer|open|operate|permit|produce|provide|recruit|seek|service|support|use|welcome)\b/iu,
] as const;
const indiaSpecificExclusionPatterns = [
  /\b(?:against|except|excluding|other\s+than|outside)\s+(?:India|Indian|Indians)\b/iu,
  /\b(?:India|Indian|Indians)\b.{0,80}\b(?:banned|excluded|ineligible|prohibited|unavailable|unwelcome)\b/iu,
  /\b(?:India|Indian|Indians)\b.{0,80}\bnot\s+(?:accepted|eligible|included|permitted|welcome)\b/iu,
  /\bnon[-\s]?Indian\b.{0,40}\bonly\b|\bonly\b.{0,40}\bnon[-\s]?Indian\b/iu,
  /(?:भारत|भारतीय).{0,60}(?:नहीं|नही|बहिष्कृत|बंद|प्रतिबंधित)|(?:नहीं|नही|बहिष्कृत|बंद|प्रतिबंधित).{0,60}(?:भारत|भारतीय)/u,
  /(?:不接受|不包括|不向|不在|排除)印度|印度(?:除外|被排除|不接受|不包括|不可|不允许)/u,
] as const;
const phraseLevelRelevantNegativePatterns = [
  /不(?:接受|招募|运营|制造|分销|收集|采集|安装|部署|服务|维护|扩大|扩张|拓展|开放|欢迎)|未(?:接受|招募|运营|制造|分销|收集|采集|安装|部署|服务|维护|扩大|扩张|拓展|开放)/u,
] as const;
const abandonedIntentPatterns = [
  /\b(?:abandon|abandoned|cancelled|canceled|ceased|withdraw|withdrawn)\b/iu,
] as const;
const negatedOpennessPatterns = [
  /\b(?:are|can|could|did|do|does|had|has|have|is|must|shall|should|was|were|will|would)\s+not\s+(?!only\b)(?:accept|accepted|accepting|apply|available|eligible|invite|open|opened|permit|permitted|welcome)\b/iu,
  /\b(?:cannot|never)\s+(?:accept|apply|invite|open|permit|welcome)\b/iu,
  /\b(?:closed|ineligible|unavailable)\b/iu,
  /不(?:开放|接受|欢迎)|未开放|不可申请|关闭/u,
] as const;
const geographicRestrictionPatterns = [
  /\b(?:domestic|local)[-\s]+only\b|\bonly\s+(?:domestic|local)\b/iu,
  /\b(?:limited|restricted)\s+to\s+(?:Australia|Canada|China|domestic|France|Germany|India|Japan|local|Singapore|the\s+United\s+Kingdom|the\s+United\s+States|UK|US|USA)\b/iu,
  /\b(?:except|excluding|other\s+than)\s+(?:Australia|Canada|China|France|Germany|India|Japan|Singapore|the\s+United\s+Kingdom|the\s+United\s+States|UK|US|USA)\b/iu,
  /\b(?:limited|restricted)\s+to\s+(?:the\s+)?[A-Z][\p{L}-]*(?:\s+[A-Z][\p{L}-]*){0,3}\b/u,
  /\b(?:except|excluding|other\s+than)\s+(?:the\s+)?[A-Z][\p{L}-]*(?:\s+[A-Z][\p{L}-]*){0,3}\b/u,
  /仅限(?:国内|本国|中国|印度)|(?:限制|限于)(?:国内|本国|中国|印度)|(?:中国|印度)除外/u,
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

function claimClauses(value: string): readonly string[] {
  const normalized = value
    .normalize("NFKC")
    .replace(/[‘’‛]/gu, "'")
    .replace(/\b([A-Za-z]+)n't\b/giu, (_match, rawStem: string) => {
      const stem = rawStem.toLowerCase();
      const auxiliary =
        stem === "ca"
          ? "can"
          : stem === "wo"
            ? "will"
            : stem === "sha"
              ? "shall"
              : stem;
      return `${auxiliary} not`;
    });
  return Object.freeze(
    normalized
      .split(/[\n\r.!?;。！？；]+/u)
      .map((clause) => clause.trim())
      .filter(Boolean),
  );
}

function hasIndiaMarker(value: string): boolean {
  return (
    latinIndiaMarkerPattern.test(value) ||
    originalLanguageIndiaMarkers.some((marker) => value.includes(marker))
  );
}

function supportsRelevanceType(
  clause: string,
  relevanceType: ExactIndiaRelevanceType,
): boolean {
  if (relevanceType === "existing_India_presence") {
    return matchesAny(clause, existingPresencePatterns);
  }
  if (relevanceType === "India_expansion") {
    return matchesAny(clause, expansionPatterns);
  }
  return matchesAny(clause, positiveActionPatterns);
}

function isNegativeExactIndiaClause(
  clause: string,
  relevanceType: ExactIndiaRelevanceType,
  factKind: IndiaEvidenceFactKind,
): boolean {
  if (matchesAny(clause, indiaSpecificExclusionPatterns)) return true;
  if (
    !hasIndiaMarker(clause) ||
    !matchesAny(clause, factSupportPatterns[factKind])
  ) {
    return false;
  }
  if (
    matchesAny(clause, englishNegatedRelevantActionPatterns) ||
    matchesAny(clause, phraseLevelRelevantNegativePatterns)
  ) {
    return true;
  }
  return (
    supportsRelevanceType(clause, relevanceType) &&
    matchesAny(clause, abandonedIntentPatterns)
  );
}

function positivelySupportsExactIndiaFact(
  value: string,
  relevanceType: ExactIndiaRelevanceType,
  factKind: IndiaEvidenceFactKind,
): boolean {
  const clauses = claimClauses(value);
  if (
    clauses.some((clause) =>
      isNegativeExactIndiaClause(clause, relevanceType, factKind),
    )
  ) {
    return false;
  }
  return clauses.some(
    (clause) =>
      hasIndiaMarker(clause) &&
      matchesAny(clause, factSupportPatterns[factKind]) &&
      matchesAny(clause, positiveActionPatterns) &&
      supportsRelevanceType(clause, relevanceType),
  );
}

function positivelySupportsGlobalOpenness(value: string): boolean {
  const clauses = claimClauses(value);
  if (clauses.some((clause) => matchesAny(clause, geographicRestrictionPatterns))) {
    return false;
  }
  if (
    clauses.some(
      (clause) =>
        matchesAny(clause, negatedOpennessPatterns) &&
        (matchesAny(clause, globalScopePatterns) ||
          matchesAny(clause, opennessActionPatterns)),
    )
  ) {
    return false;
  }
  return clauses.some(
    (clause) =>
      matchesAny(clause, globalScopePatterns) &&
      matchesAny(clause, opennessActionPatterns),
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
