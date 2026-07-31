import {
  directDemandAskTypes,
  globalRadarDemandFamilies,
  precursorDevelopmentTypes,
  type DirectDemandComponents,
  type MomentumComponents,
  type PrecursorComponents,
} from "../../domain/global-radar";
import type { GlobalRadarSignalClass } from "./types";

type ScoreComponentsByClass = {
  direct_demand: DirectDemandComponents;
  demand_precursor: PrecursorComponents;
  ecosystem_momentum: MomentumComponents;
};

const assessmentFieldTuples = {
  direct_demand: [
    ["actionability", "Base actionability"],
    ["commercialPotential", "Commercial potential"],
    ["repeatability", "Repeatability"],
    ["strategicLearning", "Strategic learning"],
    ["complianceComplexity", "Compliance complexity"],
  ],
  demand_precursor: [
    ["proximityToExternalDemand", "Proximity to external demand"],
    ["fundingDeploymentMomentum", "Funding deployment momentum"],
    ["likelyDataHardwareIntensity", "Likely data hardware intensity"],
    ["strategicRelevance", "Strategic relevance"],
  ],
  ecosystem_momentum: [
    ["taxonomyConsistency", "Taxonomy consistency"],
    ["evidenceQuality", "Evidence quality"],
  ],
} as const satisfies {
  [SignalClass in GlobalRadarSignalClass]: readonly (readonly [
    Extract<keyof ScoreComponentsByClass[SignalClass], string>,
    string,
  ])[];
};

export type AssessmentKeyByClass = {
  [SignalClass in GlobalRadarSignalClass]:
    (typeof assessmentFieldTuples)[SignalClass][number][0];
};

export type AssessmentField<SignalClass extends GlobalRadarSignalClass> =
  SignalClass extends GlobalRadarSignalClass
    ? Readonly<{
        key: AssessmentKeyByClass[SignalClass];
        sourceKey: AssessmentKeyByClass[SignalClass];
        label: string;
      }>
    : never;

export type AssessmentDraftsByClass = {
  [SignalClass in GlobalRadarSignalClass]: {
    [Key in AssessmentKeyByClass[SignalClass]]: string;
  };
};

type NullableAssessmentValues<SignalClass extends GlobalRadarSignalClass> = {
  [Key in AssessmentKeyByClass[SignalClass]]: number | null;
};

type ClassificationAssessmentsByClass = {
  direct_demand: NullableAssessmentValues<"direct_demand">;
  demand_precursor: NullableAssessmentValues<"demand_precursor">;
  ecosystem_momentum: {
    [Key in AssessmentKeyByClass["ecosystem_momentum"]]: number;
  };
};
type SignalTypeByClass = {
  direct_demand: (typeof directDemandAskTypes)[number];
  demand_precursor: (typeof precursorDevelopmentTypes)[number];
  ecosystem_momentum: "ecosystem_direction";
};

export type SignalTypeDraftsByClass = {
  [SignalClass in GlobalRadarSignalClass]:
    | SignalTypeByClass[SignalClass]
    | "";
};

type DemandDomain = (typeof globalRadarDemandFamilies)[number];

type ClassificationRequestByClass = {
  direct_demand: Readonly<{
    signalClass: "direct_demand";
    signalType: SignalTypeByClass["direct_demand"];
    demandDomain: DemandDomain;
    primaryEntityId: string;
    assessments: ClassificationAssessmentsByClass["direct_demand"];
    activity: Readonly<{
      evergreen: boolean;
      expiresAt: string | null;
      reobserveBy: string | null;
    }>;
  }>;
  demand_precursor: Readonly<{
    signalClass: "demand_precursor";
    signalType: SignalTypeByClass["demand_precursor"];
    demandDomain: DemandDomain;
    primaryEntityId: string;
    assessments: ClassificationAssessmentsByClass["demand_precursor"];
  }>;
  ecosystem_momentum: Readonly<{
    signalClass: "ecosystem_momentum";
    signalType: SignalTypeByClass["ecosystem_momentum"];
    demandDomain: DemandDomain;
    assessments: ClassificationAssessmentsByClass["ecosystem_momentum"];
  }>;
};

type ClassificationRequest =
  ClassificationRequestByClass[GlobalRadarSignalClass];

export type ClassificationRequestResult =
  | Readonly<{ valid: true; request: ClassificationRequest }>
  | Readonly<{
      valid: false;
      reason: "invalid_assessments" | "invalid_target";
    }>;

export const signalClasses: readonly GlobalRadarSignalClass[] = [
  "direct_demand",
  "demand_precursor",
  "ecosystem_momentum",
];

export const signalTypeOptions = {
  direct_demand: directDemandAskTypes,
  demand_precursor: precursorDevelopmentTypes,
  ecosystem_momentum: ["ecosystem_direction"],
} as const satisfies {
  [SignalClass in GlobalRadarSignalClass]: readonly SignalTypeByClass[SignalClass][];
};

export function assessmentFieldsFor<
  SignalClass extends GlobalRadarSignalClass,
>(signalClass: SignalClass) {
  return assessmentFieldTuples[signalClass].map(([key, label]) => ({
    key,
    sourceKey: key,
    label,
  })) as unknown as readonly AssessmentField<SignalClass>[];
}

export function assessmentDraftValue<
  SignalClass extends GlobalRadarSignalClass,
>(
  drafts: AssessmentDraftsByClass,
  signalClass: SignalClass,
  key: AssessmentKeyByClass[SignalClass],
) {
  const classDrafts = drafts[signalClass] as Readonly<
    Record<AssessmentKeyByClass[SignalClass], string>
  >;
  return classDrafts[key];
}

export function isSignalTypeForClass<
  SignalClass extends GlobalRadarSignalClass,
>(
  signalClass: SignalClass,
  value: string,
): value is SignalTypeByClass[SignalClass] {
  return (signalTypeOptions[signalClass] as readonly string[]).includes(value);
}

export function createInitialSignalTypeDrafts(
  currentClass: GlobalRadarSignalClass,
  currentSignalType: string,
): SignalTypeDraftsByClass {
  const initialValue = <SignalClass extends GlobalRadarSignalClass>(
    signalClass: SignalClass,
  ) =>
    currentClass === signalClass &&
    isSignalTypeForClass(signalClass, currentSignalType)
      ? currentSignalType
      : "";
  return {
    direct_demand: initialValue("direct_demand"),
    demand_precursor: initialValue("demand_precursor"),
    ecosystem_momentum: initialValue("ecosystem_momentum"),
  };
}

function initialAssessmentDraft<SignalClass extends GlobalRadarSignalClass>(
  signalClass: SignalClass,
  currentClass: GlobalRadarSignalClass,
  components: Readonly<Record<string, unknown>>,
  actionabilityInputValue: unknown,
): AssessmentDraftsByClass[SignalClass] {
  return Object.fromEntries(
    assessmentFieldsFor(signalClass).map(({ key, sourceKey }) => {
      const value = key === "actionability"
        ? actionabilityInputValue
        : components[sourceKey];
      return [
        key,
        signalClass === currentClass && typeof value === "number"
          ? String(value)
          : "",
      ];
    }),
  ) as AssessmentDraftsByClass[SignalClass];
}

export function createInitialAssessmentDrafts(
  currentClass: GlobalRadarSignalClass,
  components: Readonly<Record<string, unknown>>,
  actionabilityInputValue: unknown,
): AssessmentDraftsByClass {
  return {
    direct_demand: initialAssessmentDraft(
      "direct_demand",
      currentClass,
      components,
      actionabilityInputValue,
    ),
    demand_precursor: initialAssessmentDraft(
      "demand_precursor",
      currentClass,
      components,
      actionabilityInputValue,
    ),
    ecosystem_momentum: initialAssessmentDraft(
      "ecosystem_momentum",
      currentClass,
      components,
      actionabilityInputValue,
    ),
  };
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : undefined;
}

function parseAssessments<SignalClass extends GlobalRadarSignalClass>(
  signalClass: SignalClass,
  drafts: AssessmentDraftsByClass[SignalClass],
): ClassificationAssessmentsByClass[SignalClass] | null {
  const parsed: Partial<
    Record<AssessmentKeyByClass[SignalClass], number | null>
  > = {};
  for (const field of assessmentFieldsFor(signalClass)) {
    const key = field.key as AssessmentKeyByClass[SignalClass];
    const value = numberOrNull(drafts[key]);
    if (
      value === undefined ||
      (signalClass === "ecosystem_momentum" && value === null)
    ) {
      return null;
    }
    parsed[key] = value;
  }
  return parsed as ClassificationAssessmentsByClass[SignalClass];
}

function isDemandDomain(value: string): value is DemandDomain {
  return (globalRadarDemandFamilies as readonly string[]).includes(value);
}

export function createClassificationRequest({
  targetClass,
  signalTypesByClass,
  demandDomain,
  primaryEntityId,
  assessmentsByClass,
  evergreen,
  expiresAt,
  reobserveBy,
}: Readonly<{
  targetClass: GlobalRadarSignalClass;
  signalTypesByClass: SignalTypeDraftsByClass;
  demandDomain: string;
  primaryEntityId: string;
  assessmentsByClass: AssessmentDraftsByClass;
  evergreen: string;
  expiresAt: string;
  reobserveBy: string;
}>): ClassificationRequestResult {
  if (!isDemandDomain(demandDomain)) {
    return { valid: false, reason: "invalid_target" };
  }
  if (targetClass === "direct_demand") {
    const assessments = parseAssessments(
      targetClass,
      assessmentsByClass.direct_demand,
    );
    const signalType = signalTypesByClass.direct_demand;
    if (!assessments) {
      return { valid: false, reason: "invalid_assessments" };
    }
    if (!signalType || !["true", "false"].includes(evergreen)) {
      return { valid: false, reason: "invalid_target" };
    }
    return {
      valid: true,
      request: {
        signalClass: targetClass,
        signalType,
        demandDomain,
        primaryEntityId,
        assessments,
        activity: {
          evergreen: evergreen === "true",
          expiresAt: expiresAt.trim() || null,
          reobserveBy: reobserveBy.trim() || null,
        },
      },
    };
  }
  if (targetClass === "demand_precursor") {
    const assessments = parseAssessments(
      targetClass,
      assessmentsByClass.demand_precursor,
    );
    const signalType = signalTypesByClass.demand_precursor;
    if (!assessments) {
      return { valid: false, reason: "invalid_assessments" };
    }
    if (!signalType) return { valid: false, reason: "invalid_target" };
    return {
      valid: true,
      request: {
        signalClass: targetClass,
        signalType,
        demandDomain,
        primaryEntityId,
        assessments,
      },
    };
  }
  const assessments = parseAssessments(
    targetClass,
    assessmentsByClass.ecosystem_momentum,
  );
  const signalType = signalTypesByClass.ecosystem_momentum;
  if (!assessments) {
    return { valid: false, reason: "invalid_assessments" };
  }
  if (!signalType) return { valid: false, reason: "invalid_target" };
  return {
    valid: true,
    request: {
      signalClass: targetClass,
      signalType,
      demandDomain,
      assessments,
    },
  };
}
