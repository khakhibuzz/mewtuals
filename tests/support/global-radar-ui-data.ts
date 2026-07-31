export const RADAR_SIGNAL_ID = "00000000-0000-4000-8000-000000000002";
export const RADAR_ENTITY_ID = "00000000-0000-4000-8000-000000000001";
export const RADAR_DUPLICATE_ID = "00000000-0000-4000-8000-000000000003";
export const RADAR_ASSOCIATED_ENTITY_ID = "00000000-0000-4000-8000-000000000012";

export const RADAR_DETAIL_HEADINGS = [
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
] as const;

export const RADAR_ALLOWED_ACTIONS = [
  "request_review",
  "monitor",
  "qualify",
  "dismiss",
  "expire",
  "reopen",
  "mark_no_india_fit",
  "edit_classification",
  "edit_expiry",
  "append_evidence",
  "append_note",
  "merge",
  "edit_watchlist",
  "qualify_entity",
  "promote",
  "reverse_promotion",
] as const;

const organisation = {
  id: RADAR_ENTITY_ID,
  canonicalName: "Fictional Robotics Example",
  canonicalDomain: "fictional-robotics.example",
  websiteUrl: "https://fictional-robotics.example/",
  linkedinUrl: "https://www.linkedin.com/company/fictional-robotics-example/",
  canonicalCorporateGroupId: null,
  stablePublicIdentifiers: ["domain:fictional-robotics.example"],
  headquartersCountry: "China",
  headquartersCity: "Shenzhen",
  operatingCountries: ["China", "India"],
  organisationType: "company",
  sector: "robotics",
  shortDescription: "A fictional robotics manufacturer used only in tests.",
  entityStatus: "observed",
  firstSeenAt: "2026-07-01T04:30:00.000Z",
  lastSeenAt: "2026-07-30T04:30:00.000Z",
  promotedCandidateId: "00000000-0000-4000-8000-000000000020",
  revision: 8,
};

const promotion = {
  id: "00000000-0000-4000-8000-000000000010",
  globalEntityId: RADAR_ENTITY_ID,
  primarySignalId: RADAR_SIGNAL_ID,
  supportingSignalIds: [RADAR_SIGNAL_ID],
  eligibilityPath: "qualified_india_direct_demand",
  discoveryRunId: "00000000-0000-4000-8000-000000000011",
  discoveryCandidateId: "00000000-0000-4000-8000-000000000020",
  status: "active",
  promotedAt: "2026-07-31T04:00:00.000Z",
  reversedAt: null,
  revisionContext: {
    expectedEntity: 7,
    expectedPrimarySignal: 3,
    promotedEntity: 8,
    promotedPrimarySignal: 4,
  },
  createdAt: "2026-07-31T04:00:00.000Z",
  updatedAt: "2026-07-31T04:00:00.000Z",
};

const watchlist = {
  id: "00000000-0000-4000-8000-000000000007",
  globalEntityId: RADAR_ENTITY_ID,
  state: "enabled",
  priority: 60,
  theme: "robotics_manufacturing",
  category: "contract_manufacturing",
  categorySearchTermEn: "robot contract manufacturing",
  categorySearchTermZhCn: "机器人合同制造",
  countries: ["China", "India"],
  languages: ["en", "zh-CN"],
  cadenceDays: 7,
  nextScanAt: "2026-08-02T04:30:00.000Z",
  reason: "Monitor public manufacturing demand.",
  revision: 5,
  entity: {
    canonicalName: organisation.canonicalName,
    headquartersCountry: organisation.headquartersCountry,
    entityStatus: organisation.entityStatus,
    revision: organisation.revision,
  },
  latestSignal: null,
  expiry: {
    expiresAt: "2026-08-30T04:30:00.000Z",
    reobserveBy: null,
  },
  promotion: null,
};

type DetailOptions = {
  allowedActions?: readonly string[];
  status?: string;
  revision?: number;
  signalClass?: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
  includePromotion?: boolean;
  includeWatchlist?: boolean;
  includePrimaryOrganisation?: boolean;
  entityStatus?: string;
  associatedEntityStatus?: string;
  associatedOrganisations?: readonly Readonly<{
    id: string;
    canonicalName: string;
    revision: number;
    entityStatus?: string;
  }>[];
  promotionEntityId?: string;
  promotedEntityRevision?: number;
  evidenceEntityId?: string | null;
  notes?: readonly Record<string, unknown>[];
};

export function globalRadarDetailFixture(options: DetailOptions = {}) {
  const allowedActions = [...(options.allowedActions ?? [])];
  const status = options.status ?? "monitoring";
  const revision = options.revision ?? 4;
  const signalClass = options.signalClass ?? "direct_demand";
  const signalType = signalClass === "direct_demand"
    ? "supplier_registration"
    : signalClass === "demand_precursor"
      ? "deployment"
      : "ecosystem_direction";
  const primaryEntity = {
    ...organisation,
    entityStatus: options.entityStatus ?? organisation.entityStatus,
  };
  const associatedEntity = {
    ...organisation,
    id: RADAR_ASSOCIATED_ENTITY_ID,
    canonicalName: "Fictional Partner Example",
    entityStatus:
      options.associatedEntityStatus ??
      options.entityStatus ??
      organisation.entityStatus,
  };
  const associatedOrganisations = options.associatedOrganisations?.map(
    (entity) => ({
      ...organisation,
      ...entity,
      entityStatus:
        entity.entityStatus ??
        options.associatedEntityStatus ??
        options.entityStatus ??
        organisation.entityStatus,
    }),
  ) ?? [associatedEntity];
  const activePromotion = {
    ...promotion,
    globalEntityId: options.promotionEntityId ?? promotion.globalEntityId,
    revisionContext: {
      ...promotion.revisionContext,
      promotedEntity:
        options.promotedEntityRevision ??
        promotion.revisionContext.promotedEntity,
    },
  };
  const scoreComponents = signalClass === "direct_demand"
    ? {
        demandExplicitness: 90,
        evidenceConfidence: 88,
        freshness: 84,
        actionability: 75,
        indiaFit: 80,
        commercialPotential: 70,
        repeatability: 65,
        responseAccessibility: 90,
        strategicLearning: 72,
        complianceComplexity: 35,
      }
    : signalClass === "demand_precursor"
      ? {
          evidenceConfidence: 80,
          proximityToExternalDemand: 65,
          fundingDeploymentMomentum: 70,
          likelyDataHardwareIntensity: 75,
          indiaFit: 78,
          estimatedTimeHorizon: 60,
          strategicRelevance: 72,
        }
      : { taxonomyConsistency: 82, evidenceQuality: 78 };
  const adminNotes = options.notes ?? [
    {
      id: "00000000-0000-4000-8000-000000000006",
      body: "Review public supplier requirements.",
      actorEmail: "admin@example.com",
      observedAt: "2026-07-30T04:30:00.000Z",
      createdAt: "2026-07-30T04:30:00.000Z",
    },
  ];
  const sections = [
    {
      id: "organisation",
      title: RADAR_DETAIL_HEADINGS[0],
      data: {
        primary:
          options.includePrimaryOrganisation === false ? null : primaryEntity,
        associated: {
          total: associatedOrganisations.length,
          truncated: false,
          items: associatedOrganisations.map((associatedOrganisation) => ({
            role: "contributor",
            confidence: 75,
            organisation: associatedOrganisation,
          })),
        },
      },
    },
    {
      id: "what_changed",
      title: RADAR_DETAIL_HEADINGS[1],
      data: {
        title: "Public manufacturing partner request",
        observedAt: "2026-07-30T04:30:00.000Z",
        firstSeenAt: "2026-07-29T04:30:00.000Z",
        lastSeenAt: "2026-07-30T04:30:00.000Z",
      },
    },
    {
      id: "signal_class",
      title: RADAR_DETAIL_HEADINGS[2],
      data: {
        signalClass,
        signalType,
        theme: "robotics_manufacturing",
        demandDomain: "robotics_hardware_and_ecosystem_demand",
        sourceCountry: "China",
        industry: "robotics",
        status,
      },
    },
    {
      id: "publicly_supported_facts",
      title: RADAR_DETAIL_HEADINGS[3],
      data: {
        factualSummary: "The organisation published a supplier registration page.",
        targetGeographies: ["Global"],
        collectionGeographies: null,
        manufacturingGeographies: ["India"],
        deliveryGeographies: ["Asia"],
        targetModelOrSystem: "Industrial robot platform",
      },
    },
    {
      id: "mewtuals_interpretation",
      title: RADAR_DETAIL_HEADINGS[4],
      data: { summary: "Mewtuals interprets this as evidence of external manufacturing demand." },
    },
    {
      id: "required_capabilities",
      title: RADAR_DETAIL_HEADINGS[5],
      data: {
        targetCapabilityTags: ["assembly", "testing_certification"],
        requiredCounterpartyArchetypes: ["contract_manufacturer"],
        requirements: {
          total: 1,
          truncated: false,
          items: [{ id: "00000000-0000-4000-8000-000000000013", kind: "manufacturing", capabilityTag: "assembly", summary: "Robot assembly capacity", confidence: 88 }],
        },
      },
    },
    {
      id: "physical_data_or_hardware_specifications",
      title: RADAR_DETAIL_HEADINGS[6],
      data: {
        items: [{
          id: "00000000-0000-4000-8000-000000000013",
          kind: "manufacturing",
          capabilityTag: "assembly",
          summary: "Robot assembly capacity",
          dataFamilies: null,
          sensorModalities: null,
          environments: ["industrial"],
          taskFamilies: ["assembly"],
          collectionMethods: null,
          humanRoles: ["technician"],
          robotEmbodiments: ["industrial_arm"],
          indianExecutionArchetypes: ["contract_manufacturer"],
          scaleSpecification: { units: 100 },
          technicalSpecification: { certification: "ISO 9001" },
          qualitySpecification: { inspection: "documented" },
          rightsAndComplianceSpecification: { public: true },
          confidence: 88,
        }],
      },
    },
    {
      id: "target_environments_and_tasks",
      title: RADAR_DETAIL_HEADINGS[7],
      data: { items: [{ requirementId: "00000000-0000-4000-8000-000000000013", environments: ["industrial"], taskFamilies: ["assembly"], collectionMethods: null, humanRoles: ["technician"], robotEmbodiments: ["industrial_arm"] }] },
    },
    {
      id: "indian_execution_archetypes",
      title: RADAR_DETAIL_HEADINGS[8],
      data: { items: ["contract_manufacturer"] },
    },
    {
      id: "india_fit_reasoning_and_constraints",
      title: RADAR_DETAIL_HEADINGS[9],
      data: {
        relevanceType: "explicit_India",
        rationale: "The public page names India as an eligible manufacturing geography.",
        reasons: ["Public India eligibility"],
        constraints: ["Certification must be verified"],
        unknowns: ["Exact volume"],
        confidence: 82,
        regulatoryFacts: { exportReview: "unknown" },
        logisticsFacts: { shipping: "required" },
      },
    },
    {
      id: "systems_context_explanation",
      title: RADAR_DETAIL_HEADINGS[10],
      data: {
        summary: "Assembly supplies the physical robot layer.",
        stackType: "hardware",
        higherLevelSystemGoal: "Reliable industrial automation",
        relevantStackLayer: "robot_hardware",
        lowerLevelInputsRequired: ["actuators"],
        transformationOrCapabilityAdded: "assembled robot",
        downstreamModelOrRobotBehavior: "physical execution",
        whyTheRequirementMatters: "Hardware quality constrains deployment.",
        possibleIndianExecutionRole: "contract manufacturing",
        factualElements: ["Assembly is requested"],
        inferredElements: ["India may provide execution capacity"],
      },
    },
    {
      id: "scale_and_timeline",
      title: RADAR_DETAIL_HEADINGS[11],
      data: {
        timeline: {
          announcedAt: "2026-07-29T04:30:00.000Z",
          effectiveFrom: "2026-07-30T04:30:00.000Z",
          expiresAt: "2026-08-30T04:30:00.000Z",
          evergreen: false,
          reobserveBy: null,
          observedAt: "2026-07-30T04:30:00.000Z",
        },
        requirements: [{ requirementId: "00000000-0000-4000-8000-000000000013", scaleSpecification: { units: 100 } }],
      },
    },
    {
      id: "public_response_path",
      title: RADAR_DETAIL_HEADINGS[12],
      data: {
        evidenceOnly: true,
        type: "supplier_or_partner_registration",
        url: "https://fictional-robotics.example/suppliers",
        businessEmail: "partners@fictional-robotics.example",
        partnerApplicationUrl: "https://fictional-robotics.example/suppliers/apply",
      },
    },
    {
      id: "compliance_flags",
      title: RADAR_DETAIL_HEADINGS[13],
      data: {
        sensitiveDataFlags: { industrialSecrets: "possible", defenceOrDualUse: "not_observed" },
        facts: { consent: null, legalReview: true },
      },
    },
    {
      id: "supporting_evidence",
      title: RADAR_DETAIL_HEADINGS[14],
      data: {
        total: 1,
        truncated: false,
        items: [{
          id: "00000000-0000-4000-8000-000000000014",
          globalEntityId:
            options.evidenceEntityId === undefined
              ? RADAR_ENTITY_ID
              : options.evidenceEntityId,
          sourceUrl: "https://fictional-robotics.example/suppliers",
          canonicalSourceUrl: "https://fictional-robotics.example/suppliers",
          sourceName: "Official supplier notice",
          sourceType: "official_supplier_page",
          sourceCountry: "China",
          sourceFamily: "official_partner_supplier_pages",
          publishedAt: "2026-07-29T04:30:00.000Z",
          observedAt: "2026-07-30T04:30:00.000Z",
          evidenceConfidence: 90,
          isPrimarySource: true,
          isSyndicated: false,
          supportsDirectDemand: true,
          supportsIndiaRelevance: true,
          supportedFieldPaths: ["signal.factualSummary"],
        }],
      },
    },
    {
      id: "original_language_source",
      title: RADAR_DETAIL_HEADINGS[15],
      data: {
        total: 1,
        truncated: false,
        items: [{ id: "00000000-0000-4000-8000-000000000014", sourceUrl: "https://fictional-robotics.example/suppliers", sourceName: "Official supplier notice", lang: "zh-CN", dir: "ltr", claim: "该公司公开邀请供应商申请。", excerpt: "我们正在寻找能够组装工业机器人的制造合作伙伴。" }],
      },
    },
    {
      id: "english_summary",
      title: RADAR_DETAIL_HEADINGS[16],
      data: {
        total: 1,
        truncated: false,
        items: [{ id: "00000000-0000-4000-8000-000000000014", sourceUrl: "https://fictional-robotics.example/suppliers", lang: "en", summary: "The company publicly invites supplier applications.", translationConfidence: 92 }],
      },
    },
    {
      id: "score_rationale",
      title: RADAR_DETAIL_HEADINGS[17],
      data: {
        activeClass: signalClass,
        score: 82,
        coverage: 100,
        policyVersion: "global-radar-score-v1",
        evidenceVersion: "global-radar-score-evidence-v1",
        components: scoreComponents,
        componentEvidence: [
          {
            component: "commercialPotential",
            value: 70,
            basis: "worker_evidence",
            rationale:
              "Worker score is supported by public evidence cited for this component.",
            evidence: [
              {
                id: "00000000-0000-4000-8000-000000000014",
                sourceUrl:
                  "https://fictional-robotics.example/suppliers",
                sourceName: "Official supplier notice",
                matchedFieldPaths: [
                  "scoreComponents.commercialPotential",
                ],
              },
            ],
          },
        ],
      },
    },
    {
      id: "signal_history",
      title: RADAR_DETAIL_HEADINGS[18],
      data: {
        total: 1,
        truncated: false,
        items: [{ id: "00000000-0000-4000-8000-000000000015", updateType: "reviewed", previousSafeState: { status: "newly_discovered" }, newSafeState: { status }, evidenceId: null, actorType: "administrator", actorEmail: "admin@example.com", reason: "Reviewed public evidence.", observedAt: "2026-07-30T04:30:00.000Z", createdAt: "2026-07-30T04:30:00.000Z" }],
      },
    },
    {
      id: "admin_notes_and_actions",
      title: RADAR_DETAIL_HEADINGS[19],
      data: {
        notes: { total: adminNotes.length, truncated: false, items: adminNotes },
        watchlist: options.includeWatchlist ? watchlist : null,
        promotion: options.includePromotion ? activePromotion : null,
        allowedActions,
      },
    },
  ];
  return {
    id: RADAR_SIGNAL_ID,
    revision,
    signalClass,
    status,
    allowedActions,
    sections,
  };
}
