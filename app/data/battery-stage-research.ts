import type { BatteryStageId } from "../domain/battery-research";

export const batteryStageResearch: Record<BatteryStageId, { summary: string; sourceIds: string[] }> = {
  materials: { summary: "Reasi’s inferred ore resource and KABIL’s overseas drilling are exploration milestones. Neither establishes a producing Indian lithium mine or confirmed battery-material shipments.", sourceIds: ["gsi-update", "kabil"] },
  refining: { summary: "Recycled batteries are a documented route into domestic material refining. This set does not establish an operating Indian ore-to-battery lithium refinery; that remains a research gap.", sourceIds: ["batx", "lohum"] },
  components: { summary: "Local anode and electrolyte capabilities are at different scales of commissioning and customer qualification. Planned cathode capacity must stay separate from operating output.", sourceIds: ["epsilon", "himadri", "neogen-update"] },
  cells: { summary: "India has operating cell examples alongside factories in trials and construction. A March 2026 government snapshot says domestic ACC demand is still largely met through imports.", sourceIds: ["india-acc", "tdsg", "agratas"] },
  packs: { summary: "Pack plants integrate cells into usable systems. Operating pack assembly in India does not, by itself, establish that its cells were manufactured domestically.", sourceIds: ["exide-packs", "amara-update"] },
  applications: { summary: "Evidence spans electric two-wheelers, hybrid cars, proposed EV cell supply, aircraft development and humanoid prototypes. Aircraft certification and named robot-battery suppliers remain distinct evidence questions.", sourceIds: ["tdsg", "hyundai-terms", "addverb-launch"] },
  recycling: { summary: "Recycling and recovery operations are documented in Roorkee and Uttar Pradesh. A recycling collaboration identifies a relationship, not volumes already processed or the destination of every recovered material.", sourceIds: ["attero", "batx", "lohum-gov"] },
};
