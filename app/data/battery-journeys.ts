export interface BatteryJourney {
  id: string;
  title: string;
  evidence: string;
  steps: readonly { label: string; detail: string }[];
  limit: string;
  recordId: string;
  sourceIds: readonly string[];
}

export const batteryJourneys: readonly BatteryJourney[] = [
  {
    id: "ola-in-house",
    title: "An Indian cell reaches a scooter",
    evidence: "Commercial deliveries announced · December 2025",
    steps: [
      { label: "Cells", detail: "Ola’s 4680 Bharat cells · India" },
      { label: "Packs", detail: "Ola’s in-house battery packs" },
      { label: "End use", detail: "Ola S1 Pro+ electric scooter" },
    ],
    limit: "This establishes the cell-to-vehicle route. It does not establish Indian origin for every mineral or component. 4680 is a format, not a chemistry.",
    recordId: "ola-cells",
    sourceIds: ["ola", "ola-location"],
  },
  {
    id: "tdsg-hybrid",
    title: "Local batteries for a hybrid car",
    evidence: "Production reported · August 2025",
    steps: [
      { label: "Cells & batteries", detail: "TDSG · Gujarat manufacturing" },
      { label: "Buyer / integrator", detail: "Suzuki" },
      { label: "End use", detail: "Grand Vitara strong hybrid" },
    ],
    limit: "A hybrid battery has a different role from a battery-electric car’s traction pack. This source does not establish the e VITARA battery supply chain.",
    recordId: "tdsg",
    sourceIds: ["tdsg", "tdsg-location"],
  },
  {
    id: "eve-greenfuel",
    title: "An overseas cell sourcing agreement",
    evidence: "Partnership announced · February 2024",
    steps: [
      { label: "Named cell partner", detail: "EVE Energy · China" },
      { label: "Indian pack business", detail: "Greenfuel · announced partnership" },
      { label: "End customer", detail: "Not established by this announcement" },
    ],
    limit: "An announced supplier relationship is not shipment evidence. Current deliveries, importer of record, product allocation and battery-business legal continuity need confirmation.",
    recordId: "greenfuel-eve",
    sourceIds: ["greenfuel-eve"],
  },
];
