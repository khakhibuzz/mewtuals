import type { Metadata } from "next";
import { SiteHeader } from "../../../components/SiteHeader";
import { BatteryMarket } from "../../../components/battery-atlas/BatteryMarket";
export const metadata: Metadata = { title: "Battery Market Catalog — India | Mewtuals", description: "Find battery cells, packs and components available from India-facing sellers, with purchase links and source-checked specifications." };
export default function BatteryMarketPage() { return <><SiteHeader /><BatteryMarket /></>; }
