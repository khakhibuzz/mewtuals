export const indianExecutionArchetypes = [
  "robotics_data_company",
  "robotics_lab",
  "university_network",
  "teleoperation_centre",
  "distributed_collector_network",
  "annotation_and_qa_company",
  "BPO_or_operations_company",
  "field_research_agency",
  "participant_recruitment_network",
  "residential_property_operator",
  "hospitality_network",
  "warehouse_operator",
  "factory_operator",
  "logistics_or_fleet_operator",
  "automotive_testing_company",
  "drone_operator",
  "agriculture_network",
  "healthcare_network",
  "infrastructure_company",
  "sensor_rig_provider",
  "robotics_hardware_provider",
  "simulation_or_digital_twin_studio",
  "cloud_and_data_infrastructure_provider",
  "privacy_and_deidentification_provider",
  "contract_manufacturer",
  "EMS_provider",
  "component_supplier",
  "testing_or_certification_lab",
  "system_integrator",
  "distributor",
  "installation_and_service_network",
  "specialist_creator_or_media",
  "government_or_industry_body",
] as const;

export const indianExecutionArchetypeLookup = Object.freeze(
  Object.fromEntries(indianExecutionArchetypes.map((value) => [value, true])),
) as Readonly<Record<(typeof indianExecutionArchetypes)[number], true>>;

export type IndianExecutionArchetype =
  (typeof indianExecutionArchetypes)[number];
