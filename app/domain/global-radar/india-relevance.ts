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

function escapeRegexTerm(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termsPatternSource(terms: readonly string[]): string {
  return [...terms]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegexTerm)
    .join("|");
}

function boundedEnglishTermsPattern(terms: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${termsPatternSource(terms)})\\b`, "iu");
}

const explicitIndiaEnglishSupportTerms = [
  "accept",
  "accepts",
  "accepted",
  "accepting",
  "apply",
  "applies",
  "applying",
  "collect",
  "collects",
  "collecting",
  "deploy",
  "deploys",
  "deploying",
  "distribute",
  "distributes",
  "distributing",
  "eligible",
  "establish",
  "established",
  "expand",
  "expands",
  "expanding",
  "has",
  "have",
  "install",
  "installs",
  "installing",
  "invite",
  "invites",
  "inviting",
  "launch",
  "launches",
  "launching",
  "maintain",
  "maintains",
  "manufacture",
  "manufactures",
  "manufacturing",
  "offer",
  "offers",
  "offering",
  "operate",
  "operates",
  "operating",
  "permit",
  "permits",
  "permitted",
  "produce",
  "produces",
  "producing",
  "provide",
  "provides",
  "providing",
  "recruit",
  "recruits",
  "recruiting",
  "seek",
  "seeks",
  "seeking",
  "service",
  "services",
  "servicing",
  "support",
  "supports",
  "supporting",
  "use",
  "uses",
  "using",
  "welcome",
  "welcomes",
  "welcoming",
] as const;
const existingPresenceEnglishSupportTerms = [
  "active",
  "current",
  "currently",
  "established",
  "existing",
  "has",
  "have",
  "maintain",
  "maintains",
  "operate",
  "operates",
  "operating",
  "present",
] as const;
const expansionEnglishSupportTerms = [
  "enter",
  "entering",
  "expand",
  "expands",
  "expanding",
  "expansion",
  "grow",
  "growing",
  "launch",
  "launches",
  "launching",
  "new",
] as const;
const englishSupportTermsByRelevanceType: Readonly<
  Record<ExactIndiaRelevanceType, readonly string[]>
> = Object.freeze({
  explicit_India: explicitIndiaEnglishSupportTerms,
  existing_India_presence: existingPresenceEnglishSupportTerms,
  India_expansion: expansionEnglishSupportTerms,
});
const englishSupportPatternsByRelevanceType: Readonly<
  Record<ExactIndiaRelevanceType, RegExp>
> = Object.freeze({
  explicit_India: boundedEnglishTermsPattern(explicitIndiaEnglishSupportTerms),
  existing_India_presence: boundedEnglishTermsPattern(
    existingPresenceEnglishSupportTerms,
  ),
  India_expansion: boundedEnglishTermsPattern(expansionEnglishSupportTerms),
});
const explicitIndiaSupportPatterns = [
  englishSupportPatternsByRelevanceType.explicit_India,
  /स्वीकार|तलाश|भर्ती|चालू|संचालित|विस्तार|प्रदान|संग्रह|संकलन|स्थापना|सेवा|विनिर्माण/u,
  /接受|寻找|招募|运营|设有|扩大|扩张|拓展|提供|收集|采集|安装|部署|服务|维护|制造|分销/u,
] as const;
const existingPresencePatterns = [
  englishSupportPatternsByRelevanceType.existing_India_presence,
  /वर्तमान|चालू|संचालित|मौजूद|स्थापित/u,
  /目前|现有|已有|运营|设有|已建立|在印度/u,
] as const;
const expansionPatterns = [
  englishSupportPatternsByRelevanceType.India_expansion,
  /विस्तार|प्रवेश|शुरू|नया/u,
  /扩大|扩张|拓展|进入|新增|启动|正在/u,
] as const;
const globalScopePatterns = [
  /\b(?:global|globally|international|internationally|worldwide)\b/iu,
  /\b(?:all|any)\s+(?:countries|country)\b/iu,
  /\baround\s+the\s+world\b/iu,
  /全球|国际|世界各地|任何国家|各国/u,
] as const;
const englishOpennessSupportTerms = [
  "accept",
  "accepts",
  "accepted",
  "accepting",
  "apply",
  "applies",
  "applying",
  "available",
  "eligible",
  "invite",
  "invites",
  "inviting",
  "open",
  "opened",
  "opens",
  "permit",
  "permits",
  "permitted",
  "welcome",
  "welcomes",
  "welcoming",
] as const;
const opennessActionPatterns = [
  boundedEnglishTermsPattern(englishOpennessSupportTerms),
  /开放|接受|欢迎|可申请|面向/u,
] as const;

const englishNegationAdverbs = [
  "actively",
  "currently",
  "now",
  "presently",
  "yet",
] as const;
const englishNegationAuxiliaries = [
  "are",
  "can",
  "could",
  "did",
  "do",
  "does",
  "had",
  "has",
  "have",
  "is",
  "must",
  "shall",
  "should",
  "was",
  "were",
  "will",
  "would",
] as const;
const englishNegationIntentTerms = [
  "continue",
  "continued",
  "continuing",
  "expect",
  "expected",
  "expecting",
  "going",
  "intend",
  "intended",
  "intending",
  "plan",
  "planned",
  "planning",
] as const;
const englishNegationHaveTerms = ["had", "has", "have", "having"] as const;
const englishNegationAdverbSource = `(?:${termsPatternSource(englishNegationAdverbs)})`;
const englishNegationAuxiliarySource = `(?:${termsPatternSource(englishNegationAuxiliaries)})`;
const englishNegationIntentSource = `(?:${termsPatternSource(englishNegationIntentTerms)})`;
const englishNegationPlanningSource =
  `(?:${englishNegationIntentSource}\\s+to|` +
  `(?:${termsPatternSource(englishNegationHaveTerms)})\\s+` +
  `(?:a\\s+plan|plans)\\s+to)`;
const englishNegationBridgeSource =
  `(?:${englishNegationAdverbSource}\\s+)?` +
  `(?:(?:be|been|being)\\s+)?` +
  `(?:${englishNegationAdverbSource}\\s+)?` +
  `(?:${englishNegationPlanningSource}\\s+` +
  `(?:${englishNegationAdverbSource}\\s+)?` +
  `(?:(?:be|been|being)\\s+)?)?` +
  `(?:${englishNegationAdverbSource}\\s+)?`;

function negatedEnglishSupportPatterns(
  terms: readonly string[],
): readonly RegExp[] {
  const termSource = termsPatternSource(terms);
  return Object.freeze([
    new RegExp(
      `\\b${englishNegationAuxiliarySource}\\s+not\\s+(?!only\\b)${englishNegationBridgeSource}(?:${termSource})\\b`,
      "iu",
    ),
    new RegExp(
      `\\b(?:cannot|never)\\s+${englishNegationBridgeSource}(?:${termSource})\\b`,
      "iu",
    ),
    new RegExp(
      `\\bnot\\s+(?!only\\b)${englishNegationBridgeSource}(?:${termSource})\\b`,
      "iu",
    ),
    new RegExp(
      `\\b(?:decided\\s+)?against\\s+(?:${termSource})\\b`,
      "iu",
    ),
    new RegExp(
      `\\bno\\s+longer\\s+${englishNegationBridgeSource}(?:${termSource})\\b`,
      "iu",
    ),
  ]);
}

const englishNegatedSupportPatternsByRelevanceType: Readonly<
  Record<ExactIndiaRelevanceType, readonly RegExp[]>
> = Object.freeze({
  explicit_India: negatedEnglishSupportPatterns(
    englishSupportTermsByRelevanceType.explicit_India,
  ),
  existing_India_presence: negatedEnglishSupportPatterns(
    englishSupportTermsByRelevanceType.existing_India_presence,
  ),
  India_expansion: negatedEnglishSupportPatterns(
    englishSupportTermsByRelevanceType.India_expansion,
  ),
});
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
const cancellationSubjectSource =
  "(?:(?:distribution|expansion)\\s+(?:initiative|plan|proposal|project|programme|program)|expansion|plans?)";
const cancellationAdverbSource =
  "(?:already|formally|later|now|officially|since|subsequently)";
const abandonedPlanContinuationPatterns = [
  new RegExp(
    `^(?:(?:we|they|the\\s+(?:company|organisation|organization))\\s+)?` +
      `(?:${cancellationAdverbSource}\\s+)?` +
      `(?:(?:had|has|have)\\s+(?:${cancellationAdverbSource}\\s+)?)?` +
      `(?:abandoned|cancelled|canceled|withdrew|withdrawn)\\s+` +
      `(?:(?:the|this|that|our|their|those)\\s+)?${cancellationSubjectSource}\\b`,
    "iu",
  ),
  new RegExp(
    `^(?:(?:the|this|that|our|their|those)\\s+)?${cancellationSubjectSource}\\s+` +
      `(?:(?:is|was)\\s+(?:${cancellationAdverbSource}\\s+)?|` +
      `(?:had|has)\\s+(?:${cancellationAdverbSource}\\s+)?been\\s+` +
      `(?:${cancellationAdverbSource}\\s+)?)` +
      `(?:abandoned|cancelled|canceled|withdrawn)\\b`,
    "iu",
  ),
] as const;
const negatedOpennessPatterns = [
  ...negatedEnglishSupportPatterns(englishOpennessSupportTerms),
  /\b(?:closed|ineligible|unavailable)\b/iu,
  /不(?:开放|接受|欢迎)|未开放|不可申请|关闭/u,
] as const;
const globalScopeOnlyRestrictionPatterns = [
  /\b(?:domestic|local)[-\s]+only\b|\bonly\s+(?:domestic|local)\b/iu,
  /仅限(?:国内|本国)|(?:国内|本国)限定/u,
] as const;
const globalAccessRestrictionContinuationPatterns = [
  /^(?:but\s+|however\s+)?(?:except|excluding|limited\s+to|only|other\s+than|restricted\s+to)\b/iu,
  /^(?:但|但是|不过)?(?:仅限(?:于)?|只限(?:于)?|限于|限制(?:为|于|在|到)|排除|不包括)/u,
] as const;
const adverbialOnlyScopeRestrictionPatterns = [
  /\b(?:except|excluding|from|limited|other\s+than|restricted)\b/iu,
] as const;
const englishGlobalAccessActorTerms = [
  "applicant",
  "applicants",
  "businesses",
  "company",
  "companies",
  "counterparty",
  "counterparties",
  "distributor",
  "distributors",
  "entity",
  "entities",
  "laboratory",
  "laboratories",
  "organisation",
  "organisations",
  "organization",
  "organizations",
  "partner",
  "partners",
  "participant",
  "participants",
  "research institution",
  "research institutions",
  "research institute",
  "research institutes",
  "research lab",
  "research labs",
  "researcher",
  "researchers",
  "supplier",
  "suppliers",
  "university",
  "universities",
  "vendor",
  "vendors",
] as const;
const englishAccessChannelTerms = [
  "digital",
  "email",
  "offline",
  "online",
  "paper",
  "physical",
  "portal",
  "postal",
  "web",
] as const;
const englishAccessClaimNounSource =
  "(?:application\\s+forms?|applications?|submission\\s+forms?|submissions?|forms?)";
const englishEligibilityQualifierTerms = [
  "accredited",
  "approved",
  "authorized",
  "authorised",
  "eligible",
  "licensed",
  "prequalified",
  "qualified",
  "registered",
  "verified",
] as const;
const englishEligibilityExclusionQualifierTerms = [
  "ineligible",
  "unaccredited",
  "unapproved",
  "unauthorized",
  "unauthorised",
  "unlicensed",
  "unqualified",
  "unregistered",
  "unverified",
] as const;
const chineseGlobalAccessActorTerms = [
  "公司",
  "企业",
  "供应商",
  "供货商",
  "厂商",
  "合作方",
  "经销商",
  "分销商",
  "申请人",
  "申请者",
  "研究人员",
  "参与者",
  "高校",
  "大学",
  "研究机构",
  "研究所",
  "实验室",
] as const;
const chineseEligibilityQualifierTerms = [
  "注册",
  "已注册",
  "合格",
  "获批",
  "经批准",
  "认可",
  "认证",
  "核准",
  "符合资格",
] as const;
const chineseEligibilityExclusionQualifierTerms = [
  "未注册",
  "不合格",
  "未获批",
  "未经批准",
  "不符合资格",
] as const;
const englishGlobalAccessActorSource = termsPatternSource(
  englishGlobalAccessActorTerms,
);
const chineseGlobalAccessActorSource = termsPatternSource(
  chineseGlobalAccessActorTerms,
);
const globalAccessCounterpartyPatterns = [
  boundedEnglishTermsPattern(englishGlobalAccessActorTerms),
  new RegExp(`(?:${chineseGlobalAccessActorSource})`, "u"),
] as const;
const globalAccessPolicyTermPatterns = [
  boundedEnglishTermsPattern(["eligibility", "eligible"]),
  /申请|资格/u,
] as const;
const englishAccessChannelSource = `(?:${termsPatternSource(englishAccessChannelTerms)})`;
const leadingChannelAccessClaimPattern = new RegExp(
  `\\b${englishAccessChannelSource}\\s+${englishAccessClaimNounSource}\\b`,
  "giu",
);
const trailingChannelAccessClaimPattern = new RegExp(
  `\\b${englishAccessClaimNounSource}\\s+(?:by|through|via)\\s+` +
    `(?:(?:a|an|the)\\s+)?${englishAccessChannelSource}\\b`,
  "giu",
);
const englishAccessClaimNounPattern = new RegExp(
  `\\b${englishAccessClaimNounSource}\\b`,
  "iu",
);
const allowedEnglishEligibilityScopeTargetPattern =
  new RegExp(
    `^(?:only\\s+)?(?:(?:${termsPatternSource(englishEligibilityQualifierTerms)})\\s+)?(?:${englishGlobalAccessActorSource})$`,
    "iu",
  );
const allowedEnglishEligibilityExclusionTargetPattern =
  new RegExp(
    `^(?:${termsPatternSource(englishEligibilityExclusionQualifierTerms)})\\s+(?:${englishGlobalAccessActorSource})$`,
    "iu",
  );
const allowedChineseEligibilityScopeTargetPattern =
  new RegExp(
    `^(?:(?:${termsPatternSource(chineseEligibilityQualifierTerms)})的?)?(?:${chineseGlobalAccessActorSource})(?:申请|参与)?$`,
    "u",
  );
const allowedChineseEligibilityExclusionTargetPattern =
  new RegExp(
    `^(?:${termsPatternSource(chineseEligibilityExclusionQualifierTerms)})的?(?:${chineseGlobalAccessActorSource})$`,
    "u",
  );
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

const englishFreshNegatedPredicateSource =
  `(?:(?:[\\p{L}\\p{N}'’-]+\\s+){0,4})?` +
  `(?:${englishNegationAuxiliarySource}\\s+not\\b|` +
  `cannot\\b|never\\b|no\\s+longer\\b|not\\s+(?!only\\b))`;
const semanticPredicateBoundaryPattern = new RegExp(
  `(?:\\s*\\b(?:but|however|whereas)\\b\\s*|` +
    `\\s*(?:但是|不过|然而|但)\\s*|` +
    `\\s*\\band\\b\\s*(?=${englishFreshNegatedPredicateSource})|` +
    `\\s*(?:并且|而且|且)\\s*(?=(?:并)?(?:不再|不|未|没有)))`,
  "giu",
);

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

function semanticPredicateUnits(clause: string): readonly string[] {
  return Object.freeze(
    clause
      .split(semanticPredicateBoundaryPattern)
      .map((unit) => unit.trim())
      .filter(Boolean),
  );
}

function claimPredicateUnits(value: string): readonly string[] {
  return Object.freeze(
    claimClauses(value).flatMap((clause) => semanticPredicateUnits(clause)),
  );
}

function hasIndiaMarker(value: string): boolean {
  return (
    latinIndiaMarkerPattern.test(value) ||
    originalLanguageIndiaMarkers.some((marker) => value.includes(marker))
  );
}

function hasUnqualifiedEnglishAccessClaim(value: string): boolean {
  const withoutChannelFormats = value
    .replace(leadingChannelAccessClaimPattern, " ")
    .replace(trailingChannelAccessClaimPattern, " ");
  const removedChannelAccessClaim = withoutChannelFormats !== value;
  return (
    englishAccessClaimNounPattern.test(withoutChannelFormats) ||
    (removedChannelAccessClaim && hasIndiaMarker(withoutChannelFormats))
  );
}

function concernsGlobalAccessPolicy(unit: string): boolean {
  return (
    matchesAny(unit, globalScopePatterns) ||
    matchesAny(unit, globalAccessCounterpartyPatterns) ||
    matchesAny(unit, globalAccessPolicyTermPatterns) ||
    hasUnqualifiedEnglishAccessClaim(unit)
  );
}

function positivelyClaimsGlobalOpenness(clause: string): boolean {
  return (
    matchesAny(clause, globalScopePatterns) &&
    matchesAny(clause, opennessActionPatterns)
  );
}

function isGlobalAccessPolicyRestrictionUnit(
  units: readonly string[],
  index: number,
): boolean {
  const unit = units[index];
  if (unit === undefined) return false;
  if (concernsGlobalAccessPolicy(unit)) return true;
  if (index === 0) return false;
  const previousUnit = units[index - 1];
  return (
    previousUnit !== undefined &&
    positivelyClaimsGlobalOpenness(previousUnit) &&
    matchesAny(unit, globalAccessRestrictionContinuationPatterns)
  );
}

function isAllowedEnglishEligibilityScopeTarget(target: string): boolean {
  const normalizedTarget = target
    .trim()
    .replace(/\s+(?:are\s+eligible|may\s+apply)$/iu, "");
  return allowedEnglishEligibilityScopeTargetPattern.test(normalizedTarget);
}

function isAllowedEnglishEligibilityExclusionTarget(target: string): boolean {
  return allowedEnglishEligibilityExclusionTargetPattern.test(target.trim());
}

function hasDisallowedGlobalScopeRestriction(clause: string): boolean {
  if (matchesAny(clause, globalScopeOnlyRestrictionPatterns)) {
    return true;
  }

  for (const match of clause.matchAll(/\b(?:limited|restricted)\s+to\b/giu)) {
    const target = clause
      .slice((match.index ?? 0) + match[0].length)
      .trim();
    if (!isAllowedEnglishEligibilityScopeTarget(target)) return true;
  }

  for (const match of clause.matchAll(
    /\b(?:except|excluding|other\s+than)\b/giu,
  )) {
    const target = clause
      .slice((match.index ?? 0) + match[0].length)
      .trim();
    if (!isAllowedEnglishEligibilityExclusionTarget(target)) return true;
  }

  for (const match of clause.matchAll(/\bonly\b/giu)) {
    const target = clause
      .slice((match.index ?? 0) + match[0].length)
      .trim();
    const directlyModifiesOpennessAction = opennessActionPatterns.some(
      (pattern) => target.match(pattern)?.index === 0,
    );
    const isUnrestrictedOpennessAction =
      directlyModifiesOpennessAction &&
      matchesAny(target, globalScopePatterns) &&
      !matchesAny(target, adverbialOnlyScopeRestrictionPatterns);
    if (isUnrestrictedOpennessAction) continue;
    if (!isAllowedEnglishEligibilityScopeTarget(target)) return true;
  }

  for (const match of clause.matchAll(
    /(?:仅限(?:于)?|只限(?:于)?|限于|限制(?:为|于|在|到))\s*/gu,
  )) {
    const target = clause
      .slice((match.index ?? 0) + match[0].length)
      .replace(/\s+/gu, "")
      .trim();
    if (!allowedChineseEligibilityScopeTargetPattern.test(target)) return true;
  }

  for (const match of clause.matchAll(/(?:排除|不包括)\s*/gu)) {
    const target = clause
      .slice((match.index ?? 0) + match[0].length)
      .replace(/\s+/gu, "")
      .trim();
    if (!allowedChineseEligibilityExclusionTargetPattern.test(target)) {
      return true;
    }
  }

  for (const match of clause.matchAll(/([^\s，,；;。.!?！？]+)\s*除外/gu)) {
    const target = (match[1] ?? "").replace(/\s+/gu, "").trim();
    if (!allowedChineseEligibilityExclusionTargetPattern.test(target)) {
      return true;
    }
  }

  return false;
}

function hasNegativeFactDeterminer(
  clause: string,
  factKind: IndiaEvidenceFactKind,
): boolean {
  for (const match of clause.matchAll(
    /\bno\s+(?:(?:active|current|currently|established|existing|India|Indian|Indians|new|planned|proposed)\s+){0,3}([\p{L}\p{N}][\p{L}\p{N}-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}-]*){0,2})/giu,
  )) {
    if (matchesAny(match[1] ?? "", factSupportPatterns[factKind])) return true;
  }
  return false;
}

function hasNegativeFactIntent(
  clause: string,
  factKind: IndiaEvidenceFactKind,
): boolean {
  for (const match of clause.matchAll(
    /\b(?:no\s+plans?\s+(?:for|to)|(?:did|do|does)\s+not\s+include)\b/giu,
  )) {
    const target = clause
      .slice((match.index ?? 0) + match[0].length)
      .split(/[,，]|\b(?:although|but|however)\b/iu, 1)[0]
      ?.trim();
    if (matchesAny(target ?? "", factSupportPatterns[factKind])) return true;
  }
  return false;
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
  return matchesAny(clause, explicitIndiaSupportPatterns);
}

function isNegativeExactIndiaClause(
  clause: string,
  relevanceType: ExactIndiaRelevanceType,
  factKind: IndiaEvidenceFactKind,
): boolean {
  if (matchesAny(clause, indiaSpecificExclusionPatterns)) return true;
  const units = semanticPredicateUnits(clause);
  const targetsRequestedFact = (unit: string): boolean =>
    hasIndiaMarker(unit) &&
    matchesAny(unit, factSupportPatterns[factKind]);
  const supportsRequestedFact = (unit: string): boolean =>
    targetsRequestedFact(unit) && supportsRelevanceType(unit, relevanceType);

  if (
    units.some(
      (unit) =>
        targetsRequestedFact(unit) &&
        (hasNegativeFactDeterminer(unit, factKind) ||
          hasNegativeFactIntent(unit, factKind) ||
          matchesAny(
            unit,
            englishNegatedSupportPatternsByRelevanceType[relevanceType],
          ) ||
          matchesAny(unit, phraseLevelRelevantNegativePatterns)),
    )
  ) {
    return true;
  }

  return units.some((unit, index) => {
    if (!supportsRequestedFact(unit)) return false;
    if (matchesAny(unit, abandonedPlanContinuationPatterns)) return true;
    const continuation = units[index + 1];
    return (
      continuation !== undefined &&
      matchesAny(continuation, abandonedPlanContinuationPatterns)
    );
  });
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
      semanticPredicateUnits(clause).some(
        (unit) =>
          hasIndiaMarker(unit) &&
          matchesAny(unit, factSupportPatterns[factKind]) &&
          supportsRelevanceType(unit, relevanceType),
      ),
  );
}

function positivelySupportsGlobalOpenness(value: string): boolean {
  const predicateUnits = claimPredicateUnits(value);
  const hasPositiveGlobalOpenness = predicateUnits.some(
    positivelyClaimsGlobalOpenness,
  );
  if (!hasPositiveGlobalOpenness) return false;
  if (
    predicateUnits.some(
      (unit, index) =>
        isGlobalAccessPolicyRestrictionUnit(predicateUnits, index) &&
        hasDisallowedGlobalScopeRestriction(unit),
    )
  ) {
    return false;
  }
  if (
    predicateUnits.some(
      (unit) =>
        matchesAny(unit, negatedOpennessPatterns) &&
        concernsGlobalAccessPolicy(unit),
    )
  ) {
    return false;
  }
  return true;
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
