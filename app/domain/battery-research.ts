export type BatteryStageId = "materials" | "refining" | "components" | "cells" | "packs" | "applications" | "recycling";
export type BatteryRecordStatus = "operating" | "commissioned" | "qualification" | "planned" | "exploration" | "development" | "agreement";

export interface BatteryResearchSource {
  title: string;
  publisher: string;
  url: string;
  date: string | null;
}

export interface BatteryLocality {
  label: string;
  latitude: number;
  longitude: number;
  geonamesId: string;
}

export type BatteryRole = "cells" | "packs" | "bms" | "chargers" | "materials" | "recycling" | "applications";
export interface BatteryFact { value: string; sourceIds: readonly string[]; }
export type BatteryFactKey = "chemistry" | "cellOrigin" | "capacity" | "certifications" | "customers" | "moq" | "leadTime";

export interface BatteryResearchRecord {
  roles?: readonly BatteryRole[];
  facts?: Partial<Record<BatteryFactKey, BatteryFact>>;
  reviewedAt?: string;
  id: string;
  name: string;
  locality: string;
  stateKey: string | null;
  stageIds: readonly BatteryStageId[];
  status: BatteryRecordStatus;
  summary: string;
  statusNote: string;
  applications: readonly string[];
  sourceIds: readonly string[];
  location: BatteryLocality | null;
  locationNote: string;
  relationship?: string;
}

export const batteryStatusLabels: Record<BatteryRecordStatus, string> = {
  operating: "Operating · reported",
  commissioned: "Commissioned · reported",
  qualification: "Qualification / trials",
  planned: "Planned / construction",
  exploration: "Exploration / resource",
  development: "Prototype / development",
  agreement: "Agreement · not delivery",
};

export function filterBatteryRecords(
  records: readonly BatteryResearchRecord[],
  stageId: BatteryStageId | null,
): readonly BatteryResearchRecord[] {
  return stageId === null ? records : records.filter((record) => record.stageIds.includes(stageId));
}
