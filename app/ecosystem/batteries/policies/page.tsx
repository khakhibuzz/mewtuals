import type { Metadata } from "next";
import { SiteHeader } from "../../../components/SiteHeader";
import { BatteryPolicies } from "../../../components/battery-atlas/BatteryPolicies";
export const metadata: Metadata = { title: "Battery Policy Watch — India | Mewtuals", description: "Recent Indian battery policies, official sources, and their implications for manufacturing, materials, demand and recycling." };
export default function BatteryPoliciesPage() { return <><SiteHeader /><BatteryPolicies /></>; }
