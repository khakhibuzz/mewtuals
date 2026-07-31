export { PHYSICAL_AI_ANALYSIS_VERSION } from "./discovery";

export const ECOSYSTEM_TAXONOMY_VERSION = "ecosystem-intelligence-v1" as const;
export const PHYSICAL_AI_CAMPAIGN_KEY = "robotics_hardware_india" as const;

export const ECOSYSTEM_INTELLIGENCE_THRESHOLDS = {
  representationCoverageTargetPercent: 40,
  geographicConcentration: {
    minimumResolvedCandidates: 5,
    minimumSharePercent: 60,
  },
  missingData: {
    minimumAffectedCandidates: 3,
    minimumRatePercent: 20,
  },
  publicContacts: {
    minimumGroupSize: 4,
    maximumAvailabilityPercentExclusive: 35,
  },
  dependencySignals: { minimumSignals: 3 },
  staleEvidence: {
    maximumAgeDays: 180,
    minimumAffectedSharePercent: 25,
  },
  momentum: { minimumSignals: 5, minimumOrganisations: 3 },
  relationships: { minimumEvidencedEdges: 8, minimumCandidates: 5 },
} as const;

export const ecosystemTaxonomyKinds = [
  "ecosystem_domain",
  "organisation_subtype",
  "ecosystem_role",
  "business_stage",
  "technical_layer",
  "capability",
  "component_category",
  "robotics_vertical",
  "signal_type",
  "relationship_type",
] as const;

export type EcosystemTaxonomyKind = (typeof ecosystemTaxonomyKinds)[number];

type BaseTerm<Key extends string = string> = {
  key: Key;
  label: string;
  shortLabel: string;
  order: number;
  description: string;
};

export type TaxonomyTerm = BaseTerm;
export type BusinessStageTerm = BaseTerm & {
  upstreamInputs: readonly string[];
  downstreamOutputs: readonly string[];
};
export type TechnicalLayerTerm = BaseTerm & {
  underlyingMaterialsOrProcesses: readonly string[];
  robotBehaviorContribution: string;
};
export type SignalTypeTerm = BaseTerm & { defaultFreshnessDays: number };

function terms<const Term extends BaseTerm>(values: readonly Term[]): readonly Term[] {
  return values;
}

const ecosystemDomains = terms([
  { key: "robotics", label: "Robotics", shortLabel: "Robotics", order: 1, description: "Robot systems and enabling technologies." },
  { key: "drones", label: "Drones", shortLabel: "Drones", order: 2, description: "Uncrewed aerial systems and their components." },
  { key: "electronics", label: "Electronics", shortLabel: "Electronics", order: 3, description: "Electronics design, production, and integration." },
  { key: "embedded_systems", label: "Embedded systems", shortLabel: "Embedded", order: 4, description: "Embedded control, firmware, and edge computing." },
  { key: "advanced_manufacturing", label: "Advanced manufacturing", shortLabel: "Manufacturing", order: 5, description: "Industrial production, testing, and automation." },
  { key: "physical_ai", label: "Physical AI", shortLabel: "Physical AI", order: 6, description: "AI embodied in machines operating in the physical world." },
  { key: "hardware", label: "Hardware", shortLabel: "Hardware", order: 7, description: "Physical products and the systems used to build them." },
] as const);

const organisationSubtypes = terms([
  { key: "startup", label: "Startup", shortLabel: "Startup", order: 1, description: "An early-stage operating company." },
  { key: "manufacturer", label: "Manufacturer", shortLabel: "Maker", order: 2, description: "A producer of physical products or systems." },
  { key: "component_supplier", label: "Component supplier", shortLabel: "Supplier", order: 3, description: "A supplier of parts, modules, or materials." },
  { key: "system_integrator", label: "System integrator", shortLabel: "Integrator", order: 4, description: "An organisation combining components into deployed systems." },
  { key: "engineering_service", label: "Engineering service", shortLabel: "Engineering", order: 5, description: "An engineering, design, or testing service provider." },
  { key: "research_institution", label: "Research institution", shortLabel: "Research", order: 6, description: "A university, laboratory, or research organisation." },
  { key: "distributor", label: "Distributor", shortLabel: "Distribution", order: 7, description: "A channel partner or distributor." },
  { key: "ecosystem_enabler", label: "Ecosystem enabler", shortLabel: "Enabler", order: 8, description: "A programme, community, or support organisation." },
] as const);

const ecosystemRoles = terms([
  { key: "materials_supplier", label: "Materials supplier", shortLabel: "Materials", order: 1, description: "Supplies materials used in physical systems." },
  { key: "component_supplier", label: "Component supplier", shortLabel: "Components", order: 2, description: "Supplies components and modules." },
  { key: "subsystem_provider", label: "Subsystem provider", shortLabel: "Subsystems", order: 3, description: "Builds functional robot subsystems." },
  { key: "system_integrator", label: "System integrator", shortLabel: "Integrator", order: 4, description: "Combines subsystems into usable systems." },
  { key: "software_provider", label: "Software provider", shortLabel: "Software", order: 5, description: "Provides embedded, control, or AI software." },
  { key: "manufacturer", label: "Manufacturer", shortLabel: "Maker", order: 6, description: "Builds production-ready products or systems." },
  { key: "deployment_partner", label: "Deployment partner", shortLabel: "Deployment", order: 7, description: "Installs, operates, or supports deployed systems." },
  { key: "research_enabler", label: "Research and enabler", shortLabel: "Research", order: 8, description: "Supports research, training, or ecosystem development." },
] as const);

const businessStages = terms([
  { key: "materials_and_inputs", label: "Materials and inputs", shortLabel: "Materials", order: 1, description: "Inputs used to make physical systems.", upstreamInputs: ["Raw materials", "Specifications"], downstreamOutputs: ["Qualified materials", "Production inputs"] },
  { key: "component_manufacturing", label: "Component manufacturing", shortLabel: "Components", order: 2, description: "Production of electronic, mechanical, and sensing parts.", upstreamInputs: ["Qualified materials", "Design requirements"], downstreamOutputs: ["Components", "Tested modules"] },
  { key: "subsystem_engineering", label: "Subsystem engineering", shortLabel: "Subsystems", order: 3, description: "Engineering of control, perception, and motion subsystems.", upstreamInputs: ["Components", "Interface requirements"], downstreamOutputs: ["Integrated subsystems", "Validation results"] },
  { key: "system_integration", label: "System integration", shortLabel: "Integration", order: 4, description: "Assembly and verification of complete systems.", upstreamInputs: ["Integrated subsystems", "Safety requirements"], downstreamOutputs: ["Complete systems", "Deployment plans"] },
  { key: "deployment_and_operations", label: "Deployment and operations", shortLabel: "Deployment", order: 5, description: "Installation, operation, and field support.", upstreamInputs: ["Complete systems", "Site requirements"], downstreamOutputs: ["Operational systems", "Field learning"] },
  { key: "distribution_and_support", label: "Distribution and support", shortLabel: "Distribution", order: 6, description: "Channel access, maintenance, and customer support.", upstreamInputs: ["Operational systems", "Support requirements"], downstreamOutputs: ["Customer access", "Service coverage"] },
  { key: "research_and_ecosystem", label: "Research and ecosystem", shortLabel: "Research", order: 7, description: "Research, training, standards, and community support.", upstreamInputs: ["Research questions", "Industry needs"], downstreamOutputs: ["Knowledge", "Skilled practitioners"] },
] as const satisfies readonly BusinessStageTerm[]);

const technicalLayers = terms([
  { key: "materials_and_fabrication", label: "Materials and fabrication", shortLabel: "Fabrication", order: 1, description: "Materials and processes that make hardware possible.", underlyingMaterialsOrProcesses: ["Metals", "Polymers", "Machining"], robotBehaviorContribution: "Provides durable physical structure." },
  { key: "mechanical_and_actuation", label: "Mechanical and actuation", shortLabel: "Actuation", order: 2, description: "Motion hardware and force transmission.", underlyingMaterialsOrProcesses: ["Motors", "Gearboxes", "Mechanisms"], robotBehaviorContribution: "Creates controlled movement and force." },
  { key: "sensing_and_perception", label: "Sensing and perception", shortLabel: "Perception", order: 3, description: "Sensors and perception systems.", underlyingMaterialsOrProcesses: ["Cameras", "LiDAR", "Signal processing"], robotBehaviorContribution: "Lets a system measure and interpret its environment." },
  { key: "electronics_and_compute", label: "Electronics and compute", shortLabel: "Compute", order: 4, description: "Power, control electronics, and edge compute.", underlyingMaterialsOrProcesses: ["PCBs", "Power electronics", "Processors"], robotBehaviorContribution: "Supplies control, power, and computation." },
  { key: "embedded_software_and_ai", label: "Embedded software and AI", shortLabel: "Embedded AI", order: 5, description: "Firmware, control software, and embodied AI.", underlyingMaterialsOrProcesses: ["Firmware", "Control algorithms", "Models"], robotBehaviorContribution: "Turns sensing and compute into decisions." },
  { key: "integration_and_safety", label: "Integration and safety", shortLabel: "Safety", order: 6, description: "Integration, testing, and safety assurance.", underlyingMaterialsOrProcesses: ["Systems engineering", "Testing", "Safety validation"], robotBehaviorContribution: "Keeps combined behavior reliable and safe." },
  { key: "deployment_and_operations", label: "Deployment and operations", shortLabel: "Operations", order: 7, description: "Installation and operational support.", underlyingMaterialsOrProcesses: ["Commissioning", "Maintenance", "Telemetry"], robotBehaviorContribution: "Sustains useful behavior in real settings." },
] as const satisfies readonly TechnicalLayerTerm[]);

const capabilities = terms([
  { key: "motion_control", label: "Motion control", shortLabel: "Motion", order: 1, description: "Control of motors and mechanisms." },
  { key: "machine_vision", label: "Machine vision", shortLabel: "Vision", order: 2, description: "Visual sensing and interpretation." },
  { key: "autonomous_navigation", label: "Autonomous navigation", shortLabel: "Navigation", order: 3, description: "Guidance and movement through environments." },
  { key: "edge_ai", label: "Edge AI", shortLabel: "Edge AI", order: 4, description: "AI inference and control close to the machine." },
  { key: "industrial_automation", label: "Industrial automation", shortLabel: "Automation", order: 5, description: "Automation of industrial workflows." },
  { key: "testing_and_validation", label: "Testing and validation", shortLabel: "Testing", order: 6, description: "Verification of hardware and system behavior." },
] as const);

const componentCategories = terms([
  { key: "actuators", label: "Actuators", shortLabel: "Actuators", order: 1, description: "Motors, drives, and motion components." },
  { key: "sensors", label: "Sensors", shortLabel: "Sensors", order: 2, description: "Devices that measure physical conditions." },
  { key: "controllers", label: "Controllers", shortLabel: "Controllers", order: 3, description: "Control boards and industrial controllers." },
  { key: "compute_modules", label: "Compute modules", shortLabel: "Compute", order: 4, description: "Edge compute and processing modules." },
  { key: "airframes_and_structures", label: "Airframes and structures", shortLabel: "Structures", order: 5, description: "Physical structures for robots and drones." },
  { key: "end_effectors", label: "End effectors", shortLabel: "End effectors", order: 6, description: "Tools and grippers used to act on the world." },
] as const);

const roboticsVerticals = terms([
  { key: "industrial_robotics", label: "Industrial robotics", shortLabel: "Industrial", order: 1, description: "Robots used in industrial settings." },
  { key: "warehouse_and_logistics", label: "Warehouse and logistics", shortLabel: "Logistics", order: 2, description: "Automation for movement and fulfilment." },
  { key: "agriculture", label: "Agriculture", shortLabel: "Agriculture", order: 3, description: "Robotics and drones for agricultural work." },
  { key: "inspection_and_maintenance", label: "Inspection and maintenance", shortLabel: "Inspection", order: 4, description: "Systems that inspect or maintain physical assets." },
  { key: "defence_and_security", label: "Defence and security", shortLabel: "Defence", order: 5, description: "Robotics and drones for defence or security." },
  { key: "healthcare", label: "Healthcare", shortLabel: "Healthcare", order: 6, description: "Physical AI systems for healthcare contexts." },
] as const);

const signalTypes = terms([
  { key: "funding", label: "Funding", shortLabel: "Funding", order: 1, description: "A publicly evidenced financing event.", defaultFreshnessDays: 365 },
  { key: "product_launch", label: "Product launch", shortLabel: "Launch", order: 2, description: "A publicly announced product release.", defaultFreshnessDays: 180 },
  { key: "pilot_deployment", label: "Pilot deployment", shortLabel: "Pilot", order: 3, description: "A publicly evidenced pilot or field deployment.", defaultFreshnessDays: 180 },
  { key: "facility_expansion", label: "Facility expansion", shortLabel: "Facility", order: 4, description: "A public manufacturing or facility expansion.", defaultFreshnessDays: 365 },
  { key: "partnership", label: "Partnership", shortLabel: "Partnership", order: 5, description: "A publicly announced collaboration.", defaultFreshnessDays: 180 },
  { key: "certification", label: "Certification", shortLabel: "Certification", order: 6, description: "A public certification or approval.", defaultFreshnessDays: 365 },
  { key: "contract_award", label: "Contract award", shortLabel: "Contract", order: 7, description: "A publicly evidenced contract or order.", defaultFreshnessDays: 180 },
  { key: "hiring", label: "Hiring", shortLabel: "Hiring", order: 8, description: "A public hiring or team-growth signal.", defaultFreshnessDays: 90 },
] as const satisfies readonly SignalTypeTerm[]);

const relationshipTypes = terms([
  { key: "supplies_to", label: "Supplies to", shortLabel: "Supplies", order: 1, description: "Supplies a component, subsystem, or material." },
  { key: "integrates_with", label: "Integrates with", shortLabel: "Integrates", order: 2, description: "Integrates systems or technology with another organisation." },
  { key: "deploys_for", label: "Deploys for", shortLabel: "Deploys", order: 3, description: "Deploys or operates a system for another organisation." },
  { key: "distributes_for", label: "Distributes for", shortLabel: "Distributes", order: 4, description: "Distributes another organisation's offering." },
  { key: "researches_with", label: "Researches with", shortLabel: "Research", order: 5, description: "Collaborates on public research or development." },
  { key: "tests_with", label: "Tests with", shortLabel: "Tests", order: 6, description: "Tests or validates systems with another organisation." },
] as const);

export const physicalAiCategories = [
  "robot makers and integrators",
  "components and actuation",
  "sensing and perception",
  "electronics and compute",
  "embedded software and AI",
  "manufacturing and testing",
  "distribution and deployment",
  "research and ecosystem support",
] as const;

export const dependencyRelatedSignalTypes = ["partnership"] as const;

export type EcosystemTaxonomyTerms = {
  ecosystem_domain: typeof ecosystemDomains;
  organisation_subtype: typeof organisationSubtypes;
  ecosystem_role: typeof ecosystemRoles;
  business_stage: typeof businessStages;
  technical_layer: typeof technicalLayers;
  capability: typeof capabilities;
  component_category: typeof componentCategories;
  robotics_vertical: typeof roboticsVerticals;
  signal_type: typeof signalTypes;
  relationship_type: typeof relationshipTypes;
};

export const ECOSYSTEM_TAXONOMY = {
  version: ECOSYSTEM_TAXONOMY_VERSION,
  thresholds: ECOSYSTEM_INTELLIGENCE_THRESHOLDS,
  kinds: ecosystemTaxonomyKinds,
  physicalAiCategories,
  dependencyRelatedSignalTypes,
  termsByKind: {
    ecosystem_domain: ecosystemDomains,
    organisation_subtype: organisationSubtypes,
    ecosystem_role: ecosystemRoles,
    business_stage: businessStages,
    technical_layer: technicalLayers,
    capability: capabilities,
    component_category: componentCategories,
    robotics_vertical: roboticsVerticals,
    signal_type: signalTypes,
    relationship_type: relationshipTypes,
  } satisfies EcosystemTaxonomyTerms,
} as const;

export type EcosystemTaxonomyKey<Kind extends EcosystemTaxonomyKind> =
  EcosystemTaxonomyTerms[Kind][number]["key"];

export type ClassificationEvidenceState = "evidence_backed" | "inferred";
export type ClassificationSeed = {
  [Kind in Exclude<EcosystemTaxonomyKind, "signal_type" | "relationship_type">]: {
    kind: Kind;
    termKey: EcosystemTaxonomyKey<Kind>;
    evidenceState: "inferred";
  };
}[Exclude<EcosystemTaxonomyKind, "signal_type" | "relationship_type">];

export const CATEGORY_CLASSIFICATION_INFERENCES: Record<
  string,
  readonly ClassificationSeed[]
> = {
  "robot makers and integrators": [
    { kind: "ecosystem_domain", termKey: "robotics", evidenceState: "inferred" },
    { kind: "ecosystem_role", termKey: "system_integrator", evidenceState: "inferred" },
    { kind: "business_stage", termKey: "system_integration", evidenceState: "inferred" },
  ],
  "components and actuation": [
    { kind: "ecosystem_domain", termKey: "robotics", evidenceState: "inferred" },
    { kind: "ecosystem_role", termKey: "component_supplier", evidenceState: "inferred" },
    { kind: "technical_layer", termKey: "mechanical_and_actuation", evidenceState: "inferred" },
    { kind: "component_category", termKey: "actuators", evidenceState: "inferred" },
  ],
  "sensing and perception": [
    { kind: "ecosystem_domain", termKey: "robotics", evidenceState: "inferred" },
    { kind: "technical_layer", termKey: "sensing_and_perception", evidenceState: "inferred" },
    { kind: "capability", termKey: "machine_vision", evidenceState: "inferred" },
  ],
  "electronics and compute": [
    { kind: "ecosystem_domain", termKey: "electronics", evidenceState: "inferred" },
    { kind: "technical_layer", termKey: "electronics_and_compute", evidenceState: "inferred" },
    { kind: "component_category", termKey: "compute_modules", evidenceState: "inferred" },
  ],
  "embedded software and AI": [
    { kind: "ecosystem_domain", termKey: "physical_ai", evidenceState: "inferred" },
    { kind: "ecosystem_role", termKey: "software_provider", evidenceState: "inferred" },
    { kind: "technical_layer", termKey: "embedded_software_and_ai", evidenceState: "inferred" },
    { kind: "capability", termKey: "edge_ai", evidenceState: "inferred" },
  ],
  "manufacturing and testing": [
    { kind: "ecosystem_domain", termKey: "advanced_manufacturing", evidenceState: "inferred" },
    { kind: "business_stage", termKey: "component_manufacturing", evidenceState: "inferred" },
    { kind: "capability", termKey: "testing_and_validation", evidenceState: "inferred" },
  ],
  "distribution and deployment": [
    { kind: "ecosystem_role", termKey: "deployment_partner", evidenceState: "inferred" },
    { kind: "business_stage", termKey: "deployment_and_operations", evidenceState: "inferred" },
    { kind: "technical_layer", termKey: "deployment_and_operations", evidenceState: "inferred" },
  ],
  "research and ecosystem support": [
    { kind: "organisation_subtype", termKey: "ecosystem_enabler", evidenceState: "inferred" },
    { kind: "ecosystem_role", termKey: "research_enabler", evidenceState: "inferred" },
    { kind: "business_stage", termKey: "research_and_ecosystem", evidenceState: "inferred" },
  ],
};

function normalizedAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export const indiaStateAndUnionTerritoryKeys = [
  "andhra_pradesh", "arunachal_pradesh", "assam", "bihar", "chhattisgarh",
  "goa", "gujarat", "haryana", "himachal_pradesh", "jharkhand", "karnataka",
  "kerala", "madhya_pradesh", "maharashtra", "manipur", "meghalaya", "mizoram",
  "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil_nadu", "telangana",
  "tripura", "uttar_pradesh", "uttarakhand", "west_bengal", "andaman_and_nicobar_islands",
  "chandigarh", "dadra_and_nagar_haveli_and_daman_and_diu", "delhi", "jammu_and_kashmir",
  "ladakh", "lakshadweep", "puducherry",
] as const;

const INDIA_STATE_ALIASES: Record<string, (typeof indiaStateAndUnionTerritoryKeys)[number]> = {
  "andhra pradesh": "andhra_pradesh",
  "arunachal pradesh": "arunachal_pradesh",
  assam: "assam",
  bihar: "bihar",
  chhattisgarh: "chhattisgarh",
  goa: "goa",
  gujarat: "gujarat",
  haryana: "haryana",
  "himachal pradesh": "himachal_pradesh",
  jharkhand: "jharkhand",
  karnataka: "karnataka",
  kerala: "kerala",
  "madhya pradesh": "madhya_pradesh",
  maharashtra: "maharashtra",
  manipur: "manipur",
  meghalaya: "meghalaya",
  mizoram: "mizoram",
  nagaland: "nagaland",
  odisha: "odisha",
  orissa: "odisha",
  punjab: "punjab",
  rajasthan: "rajasthan",
  sikkim: "sikkim",
  "tamil nadu": "tamil_nadu",
  telangana: "telangana",
  tripura: "tripura",
  "uttar pradesh": "uttar_pradesh",
  uttarakhand: "uttarakhand",
  uttaranchal: "uttarakhand",
  "west bengal": "west_bengal",
  "andaman and nicobar islands": "andaman_and_nicobar_islands",
  chandigarh: "chandigarh",
  "dadra and nagar haveli and daman and diu": "dadra_and_nagar_haveli_and_daman_and_diu",
  "dadra and nagar haveli": "dadra_and_nagar_haveli_and_daman_and_diu",
  "daman and diu": "dadra_and_nagar_haveli_and_daman_and_diu",
  delhi: "delhi",
  nct: "delhi",
  "nct of delhi": "delhi",
  "new delhi": "delhi",
  "jammu and kashmir": "jammu_and_kashmir",
  "j&k": "jammu_and_kashmir",
  ladakh: "ladakh",
  lakshadweep: "lakshadweep",
  puducherry: "puducherry",
  pondicherry: "puducherry",
};

const INDIA_CITY_ALIASES: Record<string, string> = {
  bangalore: "bengaluru",
  bengaluru: "bengaluru",
  bombay: "mumbai",
  mumbai: "mumbai",
  delhi: "delhi",
  "new delhi": "delhi",
  chennai: "chennai",
  hyderabad: "hyderabad",
  pune: "pune",
  bhubaneswar: "bhubaneswar",
  calcutta: "kolkata",
  kolkata: "kolkata",
  madras: "chennai",
  gurgaon: "gurugram",
  gurugram: "gurugram",
};

const INDIA_STATE_CANONICAL_KEYS = new Set<string>(
  Object.values(INDIA_STATE_ALIASES),
);
const INDIA_CITY_CANONICAL_KEYS = new Set(Object.values(INDIA_CITY_ALIASES));
const RESERVED_LOCATION_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_CANONICAL_CITY_KEY_LENGTH = 100;

export function normalizeIndiaState(value: string): string | undefined {
  const normalized = normalizedAlias(value);
  if (RESERVED_LOCATION_KEYS.has(normalized)) return undefined;
  return (Object.hasOwn(INDIA_STATE_ALIASES, normalized)
    ? INDIA_STATE_ALIASES[normalized]
    : undefined) ?? (INDIA_STATE_CANONICAL_KEYS.has(normalized) ? normalized : undefined);
}

export function normalizeIndiaCity(value: string): string | undefined {
  const normalized = normalizedAlias(value);
  if (RESERVED_LOCATION_KEYS.has(normalized)) return undefined;
  return (Object.hasOwn(INDIA_CITY_ALIASES, normalized)
    ? INDIA_CITY_ALIASES[normalized]
    : undefined) ?? (
    INDIA_CITY_CANONICAL_KEYS.has(normalized) || (
      normalized.length <= MAX_CANONICAL_CITY_KEY_LENGTH &&
      /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(normalized)
    )
      ? normalized
      : undefined
  );
}

export function categoryInferencesFor(category: string): readonly ClassificationSeed[] {
  return CATEGORY_CLASSIFICATION_INFERENCES[normalizedAlias(category)] ?? [];
}

export function isRegisteredTaxonomyKey<Kind extends EcosystemTaxonomyKind>(
  kind: Kind,
  key: string,
): key is EcosystemTaxonomyKey<Kind> {
  return ECOSYSTEM_TAXONOMY.termsByKind[kind].some((term) => term.key === key);
}

export function taxonomyOrder<Kind extends EcosystemTaxonomyKind>(
  kind: Kind,
  key: string,
): number | undefined {
  return ECOSYSTEM_TAXONOMY.termsByKind[kind].find((term) => term.key === key)?.order;
}

export function signalFreshnessDays(key: string): number | undefined {
  return signalTypes.find((signal) => signal.key === key)?.defaultFreshnessDays;
}
