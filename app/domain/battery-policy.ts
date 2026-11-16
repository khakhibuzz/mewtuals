export type BatteryPolicyArea = "Manufacturing" | "Demand & charging" | "Materials & imports" | "Recycling";
export interface BatteryPolicy {
  id: string;
  title: string;
  issuer: string;
  date: string;
  dateLabel: string;
  status: string;
  area: BatteryPolicyArea;
  affected: readonly string[];
  change: string;
  impact: string;
  limitation: string;
  sources: readonly { title: string; url: string; date: string | null }[];
  checkedAt: string;
}
export function filterBatteryPolicies(policies: readonly BatteryPolicy[], area: BatteryPolicyArea | "all") {
  return policies.filter((policy) => area === "all" || policy.area === area)
    .toSorted((a, b) => b.date.localeCompare(a.date));
}
