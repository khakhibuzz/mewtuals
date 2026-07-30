import {
  GLOBAL_RADAR_TEST_EXPIRES_AT as EXPIRES_AT,
  GLOBAL_RADAR_TEST_NOW,
  GLOBAL_RADAR_TEST_PUBLISHED_AT as PUBLISHED_AT,
  globalRadarTestDirectScoreComponents as directScoreComponents,
  globalRadarTestEntity as entity,
  globalRadarTestEnvelope as envelope,
  globalRadarTestEvidence as evidence,
  globalRadarTestExecutedQuery as executedQuery,
  globalRadarTestHardwareSystemsContext as hardwareSystemsContext,
  globalRadarTestPhysicalDataSystemsContext as physicalDataSystemsContext,
  globalRadarTestPrecursorScoreComponents as precursorScoreComponents,
  globalRadarTestRequirement as requirement,
  globalRadarTestResolvedCompliance as resolvedCompliance,
  globalRadarTestUnresolvedCompliance as unresolvedCompliance,
} from "../support/global-radar-test-data";

export const GLOBAL_RADAR_FICTIONAL_NOW = GLOBAL_RADAR_TEST_NOW;

const teleoperatedEntity = entity({
  entityRef: "entity-atlas-teleop",
  canonicalName: "Atlas Teleoperation Labs",
  host: "atlas-teleop",
  country: "United States",
  organisationType: "robotics_company",
  sector: "robot learning",
  group: "group:atlas-teleop",
});
const teleoperatedSourceUrl =
  "https://atlas-teleop.example/public-data-request";
const teleoperatedRobotData = envelope({
  runId: "10000000-0000-4000-8000-000000000001",
  planFingerprintCharacter: "1",
  executedQuery: executedQuery({
    fingerprintCharacter: "a",
    query: "official teleoperated robot trajectory data request",
    language: "en",
    sourceCountry: "United States",
    theme: "robot_teleoperation_demonstrations",
    signalIntent: "direct_demand",
  }),
  entities: [teleoperatedEntity],
  signal: {
    externalSignalId: "signal-atlas-teleop-data",
    signalClass: "direct_demand",
    primaryEntityRef: teleoperatedEntity.entityRef,
    associatedEntities: [],
    demandDomain: "robot_learning_and_manipulation",
    signalType: "data_collection_request",
    directDemandAsk: {
      type: "data_collection_request",
      isExplicit: true,
      expiresAt: EXPIRES_AT,
    },
    precursorDevelopmentType: null,
    momentumMetrics: null,
    title: "Atlas requests teleoperated robot trajectory data",
    factualSummary:
      "Atlas published a current request for teleoperated manipulation trajectories.",
    interpretationSummary:
      "The official request is direct external demand, with unresolved compliance facts requiring review.",
    theme: "robot_teleoperation_demonstrations",
    sourceCountry: "United States",
    targetGeographies: null,
    collectionGeographies: null,
    manufacturingGeographies: null,
    deliveryGeographies: ["Global"],
    industry: "robotics",
    targetModelOrSystem: "Atlas manipulation policy",
    indiaRelevance: {
      proposedType: "no_current_India_fit",
      rationale: "The fictional request does not establish a current India fit.",
      reasons: [],
      constraints: [],
      unknowns: ["Eligible delivery geographies are not publicly specified."],
      confidence: 70,
      regulatoryFacts: null,
      logisticsFacts: null,
    },
    announcedAt: PUBLISHED_AT,
    effectiveFrom: PUBLISHED_AT,
    responsePath: null,
    systemsContext: physicalDataSystemsContext({
      goal: "Improve a robot manipulation policy with reviewed trajectories.",
      transformation:
        "Turn captured teleoperation sessions into quality-controlled training examples.",
      downstream:
        "The manipulation policy can be evaluated on successful and failed actions.",
      role:
        "A verified Indian robotics-data operator could be assessed for collection and review.",
      factualElement:
        "The fictional organisation requests teleoperated manipulation trajectories.",
    }),
    sensitiveDataAndCompliance: unresolvedCompliance(),
    rawMetadata: {},
    requirements: [
      requirement({
        kind: "physical_data",
        capabilityTag: "teleoperated_trajectories",
        summary:
          "Teleoperated manipulation trajectories with reviewed successful and failed outcomes.",
        archetypes: ["robotics_data_company", "teleoperation_centre"],
        dataFamilies: ["robot trajectories"],
        sensorModalities: ["rgb"],
        environments: ["warehouse"],
        taskFamilies: ["manipulation"],
        collectionMethods: ["teleoperation"],
        humanRoles: ["teleoperator", "quality reviewer"],
        robotEmbodiments: ["mobile manipulator"],
      }),
    ],
    evidence: [
      evidence({
        contributorEntityRef: teleoperatedEntity.entityRef,
        url: teleoperatedSourceUrl,
        sourceName: teleoperatedEntity.canonicalName,
        sourceCountry: "United States",
        sourceFamily: "official_company_material",
        claim:
          "Atlas requests external providers to deliver teleoperated robot manipulation trajectories before September 2026.",
        englishSummary:
          "Atlas publicly requests external providers for teleoperated robot trajectory data.",
        supportedFieldPaths: [
          "signal.factualSummary",
          "directDemandAsk.data_collection_request",
        ],
      }),
    ],
    scoreComponents: directScoreComponents(),
    evergreen: false,
    reobserveBy: null,
  },
});

const humanoidEntity = entity({
  entityRef: "entity-northstar-humanoid",
  canonicalName: "Northstar Humanoid Works",
  host: "northstar-humanoid",
  country: "Canada",
  organisationType: "robotics_company",
  sector: "humanoid robotics",
  group: "group:northstar-humanoid",
});
const humanoidDeployment = envelope({
  runId: "10000000-0000-4000-8000-000000000002",
  planFingerprintCharacter: "2",
  executedQuery: executedQuery({
    fingerprintCharacter: "b",
    query: "official humanoid deployment announcement",
    language: "en",
    sourceCountry: "Canada",
    theme: "physical_ai_evaluation",
    signalIntent: "demand_precursor",
  }),
  entities: [humanoidEntity],
  signal: {
    externalSignalId: "signal-northstar-humanoid-deployment",
    signalClass: "demand_precursor",
    primaryEntityRef: humanoidEntity.entityRef,
    associatedEntities: [],
    demandDomain: "robotics_hardware_and_ecosystem_demand",
    signalType: "deployment",
    directDemandAsk: null,
    precursorDevelopmentType: "deployment",
    momentumMetrics: null,
    title: "Northstar announces a humanoid deployment programme",
    factualSummary:
      "Northstar announced a dated programme to deploy fictional humanoid robots in pilot facilities.",
    interpretationSummary:
      "The announcement may precede external deployment demand but contains no supplier request.",
    theme: "physical_ai_evaluation",
    sourceCountry: "Canada",
    targetGeographies: ["Canada"],
    collectionGeographies: null,
    manufacturingGeographies: null,
    deliveryGeographies: ["Canada"],
    industry: "robotics",
    targetModelOrSystem: "Northstar humanoid pilot",
    indiaRelevance: {
      proposedType: "no_current_India_fit",
      rationale: "The announcement does not establish an India connection.",
      reasons: [],
      constraints: [],
      unknowns: ["Future supplier geographies are unknown."],
      confidence: 75,
      regulatoryFacts: null,
      logisticsFacts: null,
    },
    announcedAt: PUBLISHED_AT,
    effectiveFrom: "2026-09-15T00:00:00.000Z",
    responsePath: null,
    systemsContext: hardwareSystemsContext({
      goal: "Deploy a humanoid system in controlled pilot facilities.",
      transformation:
        "Integrate tested hardware and control software into a deployable pilot unit.",
      downstream:
        "The humanoid can perform documented pilot tasks under site supervision.",
      role:
        "An Indian integrator could be evaluated later if an external requirement is published.",
      factualElement:
        "The fictional organisation announced a dated humanoid pilot deployment.",
      layer: "deployment",
    }),
    sensitiveDataAndCompliance: resolvedCompliance(),
    rawMetadata: {},
    requirements: [
      requirement({
        kind: "deployment",
        capabilityTag: "integration",
        summary:
          "Integration and deployment support for a controlled humanoid pilot.",
        archetypes: ["system_integrator"],
        robotEmbodiments: ["humanoid robot"],
      }),
    ],
    evidence: [
      evidence({
        contributorEntityRef: humanoidEntity.entityRef,
        url: "https://northstar-humanoid.example/deployment-announcement",
        sourceName: humanoidEntity.canonicalName,
        sourceCountry: "Canada",
        sourceFamily: "official_company_material",
        claim:
          "Northstar announced that its fictional humanoid pilot deployment starts in September 2026; it did not request suppliers.",
        englishSummary:
          "Northstar announced a dated humanoid deployment without an external supplier ask.",
        supportedFieldPaths: [
          "signal.factualSummary",
          "precursorDevelopment.deployment",
        ],
      }),
    ],
    scoreComponents: precursorScoreComponents(),
    evergreen: null,
    reobserveBy: null,
  },
});

const navigationEntity = entity({
  entityRef: "entity-saffron-navigation",
  canonicalName: "Saffron Navigation Research",
  host: "saffron-navigation",
  country: "United Kingdom",
  organisationType: "autonomy_company",
  sector: "autonomous mobility",
  group: "group:saffron-navigation",
});
const navigationSourceUrl =
  "https://saffron-navigation.example/india-data-request";
const indiaAutonomousNavigationData = envelope({
  runId: "10000000-0000-4000-8000-000000000003",
  planFingerprintCharacter: "3",
  executedQuery: executedQuery({
    fingerprintCharacter: "c",
    query: "India autonomous navigation road data request",
    language: "en",
    sourceCountry: "United Kingdom",
    theme: "autonomous_mobility_and_drones",
    signalIntent: "direct_demand",
  }),
  entities: [navigationEntity],
  signal: {
    externalSignalId: "signal-saffron-india-navigation-data",
    signalClass: "direct_demand",
    primaryEntityRef: navigationEntity.entityRef,
    associatedEntities: [],
    demandDomain: "autonomous_mobility_and_drones",
    signalType: "data_collection_request",
    directDemandAsk: {
      type: "data_collection_request",
      isExplicit: true,
      expiresAt: EXPIRES_AT,
    },
    precursorDevelopmentType: null,
    momentumMetrics: null,
    title: "Saffron requests autonomous-navigation data from India",
    factualSummary:
      "Saffron requests synchronized navigation observations on mixed Indian roads.",
    interpretationSummary:
      "The official request is direct physical-data demand with explicit India relevance.",
    theme: "autonomous_mobility_and_drones",
    sourceCountry: "United Kingdom",
    targetGeographies: ["India"],
    collectionGeographies: ["India"],
    manufacturingGeographies: null,
    deliveryGeographies: ["United Kingdom"],
    industry: "autonomous mobility",
    targetModelOrSystem: "Saffron navigation model",
    indiaRelevance: {
      proposedType: "explicit_India",
      rationale: "The original fictional request names collection on roads in India.",
      reasons: ["India is named as the collection geography."],
      constraints: ["Road-user privacy controls require review."],
      unknowns: [],
      confidence: 92,
      regulatoryFacts: null,
      logisticsFacts: null,
    },
    announcedAt: PUBLISHED_AT,
    effectiveFrom: PUBLISHED_AT,
    responsePath: null,
    systemsContext: physicalDataSystemsContext({
      goal: "Evaluate autonomous navigation on mixed and unstructured roads.",
      transformation:
        "Quality-check synchronized road observations before model evaluation.",
      downstream:
        "The navigation model can be tested against varied traffic interactions.",
      role:
        "A verified Indian mobility-data operator could be assessed for compliant field collection.",
      factualElement:
        "The fictional request names autonomous-navigation observations on Indian roads.",
      layer: "qa",
    }),
    sensitiveDataAndCompliance: resolvedCompliance({
      precise_location: "possible",
      road_users: "possible",
    }),
    rawMetadata: {},
    requirements: [
      requirement({
        kind: "physical_data",
        capabilityTag: "indian_mixed_unstructured_roads",
        summary:
          "Synchronized autonomous-navigation observations from mixed Indian roads.",
        archetypes: [
          "automotive_testing_company",
          "logistics_or_fleet_operator",
        ],
        dataFamilies: ["road scenes"],
        sensorModalities: ["rgb", "gps", "imu"],
        environments: ["mixed Indian roads"],
        taskFamilies: ["navigation"],
        collectionMethods: ["instrumented fleet collection"],
        humanRoles: ["safety driver"],
        robotEmbodiments: ["autonomous vehicle"],
      }),
    ],
    evidence: [
      evidence({
        contributorEntityRef: navigationEntity.entityRef,
        url: navigationSourceUrl,
        sourceName: navigationEntity.canonicalName,
        sourceCountry: "United Kingdom",
        sourceFamily: "official_company_material",
        claim:
          "Saffron seeks suppliers in India to collect autonomous-navigation data on mixed Indian roads before September 2026.",
        englishSummary:
          "Saffron publicly seeks Indian suppliers for autonomous-navigation road data collection.",
        supportedFieldPaths: [
          "signal.factualSummary",
          "directDemandAsk.data_collection_request",
          "indiaRelevance.explicit_India.roads_or_environments",
        ],
      }),
    ],
    scoreComponents: directScoreComponents(),
    evergreen: false,
    reobserveBy: null,
  },
});

const manufacturingEntity = entity({
  entityRef: "entity-jade-robotics",
  canonicalName: "Jade Robotics Systems",
  host: "jade-robotics",
  country: "China",
  organisationType: "robotics_company",
  sector: "robotics hardware",
  group: "group:jade-robotics",
});
const manufacturingSourceUrl =
  "https://jade-robotics.example/india-manufacturing-request";
const chineseIndianManufacturing = envelope({
  runId: "10000000-0000-4000-8000-000000000004",
  planFingerprintCharacter: "4",
  executedQuery: executedQuery({
    fingerprintCharacter: "d",
    query: "印度 机器人 制造 合作伙伴",
    language: "zh-CN",
    sourceCountry: "China",
    theme: "robotics_manufacturing",
    signalIntent: "direct_demand",
  }),
  entities: [manufacturingEntity],
  signal: {
    externalSignalId: "signal-jade-india-manufacturing",
    signalClass: "direct_demand",
    primaryEntityRef: manufacturingEntity.entityRef,
    associatedEntities: [],
    demandDomain: "robotics_hardware_and_ecosystem_demand",
    signalType: "manufacturing_request",
    directDemandAsk: {
      type: "manufacturing_request",
      isExplicit: true,
      expiresAt: EXPIRES_AT,
    },
    precursorDevelopmentType: null,
    momentumMetrics: null,
    title: "Jade requests Indian robotics manufacturing partners",
    factualSummary:
      "Jade published a Chinese-language request for manufacturing partners in India.",
    interpretationSummary:
      "The original Chinese evidence and separate English summary support direct manufacturing demand.",
    theme: "robotics_manufacturing",
    sourceCountry: "China",
    targetGeographies: ["India"],
    collectionGeographies: null,
    manufacturingGeographies: ["India"],
    deliveryGeographies: ["China"],
    industry: "robotics manufacturing",
    targetModelOrSystem: "Jade mobile robot platform",
    indiaRelevance: {
      proposedType: "explicit_India",
      rationale: "The original Chinese text names Indian manufacturing partners.",
      reasons: ["India is named as the requested manufacturing geography."],
      constraints: ["Export-control applicability is not established."],
      unknowns: [],
      confidence: 90,
      regulatoryFacts: null,
      logisticsFacts: null,
    },
    announcedAt: PUBLISHED_AT,
    effectiveFrom: PUBLISHED_AT,
    responsePath: null,
    systemsContext: hardwareSystemsContext({
      goal: "Assemble a fictional mobile robot platform from specified components.",
      transformation:
        "Combine supplied components into quality-controlled robot assemblies.",
      downstream:
        "The assembled mobile robot platform can proceed to integration testing.",
      role:
        "A verified Indian contract manufacturer could be assessed against the public specifications.",
      factualElement:
        "The fictional Chinese request names manufacturing partners in India.",
    }),
    sensitiveDataAndCompliance: resolvedCompliance({
      industrial_secrets: "possible",
      export_controls: "possible",
    }),
    rawMetadata: {},
    requirements: [
      requirement({
        kind: "manufacturing",
        capabilityTag: "contract_manufacturing",
        summary:
          "Contract manufacturing for a fictional mobile robotics platform.",
        archetypes: ["contract_manufacturer", "EMS_provider"],
        robotEmbodiments: ["mobile robot"],
      }),
    ],
    evidence: [
      evidence({
        contributorEntityRef: manufacturingEntity.entityRef,
        url: manufacturingSourceUrl,
        sourceName: manufacturingEntity.canonicalName,
        sourceCountry: "China",
        sourceFamily: "official_partner_supplier_pages",
        sourceLanguage: "zh-CN",
        translationConfidence: 92,
        claim: "公司正在寻找印度制造合作伙伴，为虚构的移动机器人平台生产组件。",
        englishSummary:
          "The company is seeking manufacturing partners located in India for a fictional mobile robot platform.",
        supportedFieldPaths: [
          "signal.factualSummary",
          "directDemandAsk.manufacturing_request",
          "indiaRelevance.explicit_India.manufacturing",
        ],
      }),
    ],
    scoreComponents: directScoreComponents(),
    evergreen: false,
    reobserveBy: null,
  },
});

const speechEntity = entity({
  entityRef: "entity-monsoon-speech",
  canonicalName: "Monsoon Speech Robotics",
  host: "monsoon-speech",
  country: "Singapore",
  organisationType: "physical_ai_company",
  sector: "speech robotics",
  group: "group:monsoon-speech",
});
const speechSourceUrl =
  "https://monsoon-speech.example/india-noisy-speech-request";
const noisyIndianLanguageSpeech = envelope({
  runId: "10000000-0000-4000-8000-000000000005",
  planFingerprintCharacter: "5",
  executedQuery: executedQuery({
    fingerprintCharacter: "e",
    query: "official noisy Indian language speech data request",
    language: "en",
    sourceCountry: "Singapore",
    theme: "multilingual_speech_and_human_robot_interaction",
    signalIntent: "direct_demand",
  }),
  entities: [speechEntity],
  signal: {
    externalSignalId: "signal-monsoon-indian-language-speech",
    signalClass: "direct_demand",
    primaryEntityRef: speechEntity.entityRef,
    associatedEntities: [],
    demandDomain: "speech_and_audio",
    signalType: "data_collection_request",
    directDemandAsk: {
      type: "data_collection_request",
      isExplicit: true,
      expiresAt: EXPIRES_AT,
    },
    precursorDevelopmentType: null,
    momentumMetrics: null,
    title: "Monsoon requests noisy Indian-language robot speech",
    factualSummary:
      "Monsoon requests noisy Hindi and Tamil speech for human-robot command evaluation.",
    interpretationSummary:
      "The official request is direct speech-data demand with explicit India relevance.",
    theme: "multilingual_speech_and_human_robot_interaction",
    sourceCountry: "Singapore",
    targetGeographies: ["India"],
    collectionGeographies: ["India"],
    manufacturingGeographies: null,
    deliveryGeographies: ["Singapore"],
    industry: "robotics",
    targetModelOrSystem: "Monsoon human-robot speech model",
    indiaRelevance: {
      proposedType: "explicit_India",
      rationale: "The fictional request names suppliers in India and Indian languages.",
      reasons: ["India is named as the speech collection geography."],
      constraints: ["Voice consent and de-identification require verification."],
      unknowns: [],
      confidence: 90,
      regulatoryFacts: null,
      logisticsFacts: null,
    },
    announcedAt: PUBLISHED_AT,
    effectiveFrom: PUBLISHED_AT,
    responsePath: null,
    systemsContext: physicalDataSystemsContext({
      goal: "Evaluate human-robot speech understanding in noisy environments.",
      transformation:
        "Annotate multilingual speech with command intent and acoustic conditions.",
      downstream:
        "The speech model can be evaluated on noisy Hindi and Tamil robot commands.",
      role:
        "A verified Indian language-data operator could be assessed for compliant collection and annotation.",
      factualElement:
        "The fictional request names noisy Hindi and Tamil speech collection in India.",
    }),
    sensitiveDataAndCompliance: resolvedCompliance({ voices: "possible" }),
    rawMetadata: {},
    requirements: [
      requirement({
        kind: "physical_data",
        capabilityTag: "noisy_far_field_speech",
        summary:
          "Noisy far-field Hindi and Tamil speech for human-robot command evaluation.",
        archetypes: [
          "robotics_data_company",
          "distributed_collector_network",
          "annotation_and_qa_company",
        ],
        dataFamilies: ["speech audio"],
        sensorModalities: ["microphones"],
        environments: ["homes", "workplaces"],
        taskFamilies: ["human-robot commands"],
        collectionMethods: ["scripted speech collection"],
        humanRoles: ["adult speaker", "language reviewer"],
        robotEmbodiments: ["service robot"],
      }),
    ],
    evidence: [
      evidence({
        contributorEntityRef: speechEntity.entityRef,
        url: speechSourceUrl,
        sourceName: speechEntity.canonicalName,
        sourceCountry: "Singapore",
        sourceFamily: "official_company_material",
        claim:
          "Monsoon seeks suppliers in India to collect noisy Hindi and Tamil language speech for robot commands before September 2026.",
        englishSummary:
          "Monsoon publicly seeks Indian suppliers for noisy Hindi and Tamil robot-command speech.",
        supportedFieldPaths: [
          "signal.factualSummary",
          "directDemandAsk.data_collection_request",
          "indiaRelevance.explicit_India.languages",
        ],
      }),
    ],
    scoreComponents: directScoreComponents(),
    evergreen: false,
    reobserveBy: null,
  },
});

const platformEntityOne = entity({
  entityRef: "entity-orbit-physical-ai",
  canonicalName: "Orbit Physical AI",
  host: "orbit-physical-ai",
  country: "Germany",
  organisationType: "physical_ai_company",
  sector: "physical AI",
  group: "group:orbit-physical-ai",
});
const platformEntityTwo = entity({
  entityRef: "entity-pine-research",
  canonicalName: "Pine Robotics Research",
  host: "pine-robotics-research",
  country: "Japan",
  organisationType: "research_institute",
  sector: "robotics research",
  group: "group:pine-robotics-research",
});
const physicalAiPlatformMomentum = envelope({
  runId: "10000000-0000-4000-8000-000000000006",
  planFingerprintCharacter: "6",
  executedQuery: executedQuery({
    fingerprintCharacter: "f",
    query: "official physical AI platform direction",
    language: "en",
    sourceCountry: "Global",
    theme: "physical_ai_evaluation",
    signalIntent: "ecosystem_momentum",
  }),
  entities: [platformEntityOne, platformEntityTwo],
  signal: {
    externalSignalId: "signal-physical-ai-platform-momentum",
    signalClass: "ecosystem_momentum",
    primaryEntityRef: null,
    associatedEntities: [
      {
        entityRef: platformEntityOne.entityRef,
        role: "contributor",
        confidence: 90,
      },
      {
        entityRef: platformEntityTwo.entityRef,
        role: "contributor",
        confidence: 88,
      },
    ],
    demandDomain: "physical_data_operational_infrastructure",
    signalType: "ecosystem_direction",
    directDemandAsk: null,
    precursorDevelopmentType: null,
    momentumMetrics: { taxonomyConsistency: 90, evidenceQuality: 85 },
    title: "Independent organisations publish a physical-AI platform direction",
    factualSummary:
      "Orbit and Pine separately published a fictional direction for evaluating physical-AI data platforms.",
    interpretationSummary:
      "Two independent, non-syndicated sources support an ecosystem direction without creating a direct demand claim.",
    theme: "physical_ai_evaluation",
    sourceCountry: "Global",
    targetGeographies: null,
    collectionGeographies: null,
    manufacturingGeographies: null,
    deliveryGeographies: null,
    industry: "physical AI",
    targetModelOrSystem: "physical-AI evaluation platform",
    indiaRelevance: {
      proposedType: "no_current_India_fit",
      rationale: "Neither fictional publication establishes a current India fit.",
      reasons: [],
      constraints: [],
      unknowns: ["Future counterparty geographies remain unknown."],
      confidence: 75,
      regulatoryFacts: null,
      logisticsFacts: null,
    },
    announcedAt: PUBLISHED_AT,
    effectiveFrom: PUBLISHED_AT,
    responsePath: null,
    systemsContext: null,
    sensitiveDataAndCompliance: resolvedCompliance(),
    rawMetadata: {},
    requirements: [
      requirement({
        kind: "research",
        capabilityTag: "model_evaluation",
        summary:
          "Evaluation infrastructure for fictional physical-AI data platforms.",
        archetypes: ["robotics_lab", "cloud_and_data_infrastructure_provider"],
        dataFamilies: ["physical AI evaluation results"],
        taskFamilies: ["model evaluation"],
      }),
    ],
    evidence: [
      evidence({
        contributorEntityRef: platformEntityOne.entityRef,
        url: "https://orbit-physical-ai.example/platform-direction",
        sourceName: platformEntityOne.canonicalName,
        sourceCountry: "Germany",
        sourceFamily: "official_company_material",
        claim:
          "Orbit published a fictional physical-AI platform direction focused on repeatable model evaluation.",
        englishSummary:
          "Orbit published a physical-AI platform direction for repeatable model evaluation.",
        supportedFieldPaths: ["signal.factualSummary"],
      }),
      evidence({
        contributorEntityRef: platformEntityTwo.entityRef,
        url: "https://pine-robotics-research.example/research-direction",
        sourceName: platformEntityTwo.canonicalName,
        sourceCountry: "Japan",
        sourceFamily: "official_research",
        claim:
          "Pine independently published a fictional research direction for physical-AI platform evaluation.",
        englishSummary:
          "Pine independently published a research direction for physical-AI platform evaluation.",
        supportedFieldPaths: ["signal.factualSummary"],
      }),
    ],
    scoreComponents: null,
    evergreen: null,
    reobserveBy: null,
  },
});

export const globalRadarFictionalFixtures = Object.freeze({
  teleoperatedRobotDataDirectDemandNeedsReview: Object.freeze({
    fictionalExample: true as const,
    input: teleoperatedRobotData,
  }),
  humanoidDeploymentDemandPrecursor: Object.freeze({
    fictionalExample: true as const,
    input: humanoidDeployment,
  }),
  indiaAutonomousNavigationDataDirectDemand: Object.freeze({
    fictionalExample: true as const,
    input: indiaAutonomousNavigationData,
  }),
  chineseIndianManufacturingDirectDemand: Object.freeze({
    fictionalExample: true as const,
    input: chineseIndianManufacturing,
  }),
  noisyIndianLanguageSpeechDirectDemand: Object.freeze({
    fictionalExample: true as const,
    input: noisyIndianLanguageSpeech,
  }),
  multiOrganisationPhysicalAiPlatformMomentum: Object.freeze({
    fictionalExample: true as const,
    input: physicalAiPlatformMomentum,
  }),
});
