import type { Metadata } from "next";
import { BatteryAtlas } from "../../components/battery-atlas/BatteryAtlas";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Battery Atlas — India | Mewtuals",
  description: "Explore the battery lifecycle with India as the first country in the Mewtuals Battery Atlas.",
};

export default function BatteryAtlasPage() {
  return <><SiteHeader /><BatteryAtlas /></>;
}
