import Link from "next/link";

import type { GlobalRadarTab } from "./types";
import styles from "./global-radar.module.css";

const tabs: readonly Readonly<{
  id: GlobalRadarTab;
  label: string;
  href: string;
}>[] = [
  { id: "direct-demand", label: "Direct Demand", href: "/admin/global-demand-radar/direct-demand" },
  { id: "demand-precursors", label: "Demand Precursors", href: "/admin/global-demand-radar/demand-precursors" },
  { id: "momentum", label: "Momentum", href: "/admin/global-demand-radar/momentum" },
  { id: "watchlist", label: "Watchlist", href: "/admin/global-demand-radar/watchlist" },
  { id: "runs", label: "Radar Runs", href: "/admin/global-demand-radar/runs" },
];

export function GlobalRadarTabs({ current }: { current: GlobalRadarTab }) {
  return (
    <nav
      aria-label="Global Demand Radar sections"
      className={styles.tabRail}
      tabIndex={0}
    >
      {tabs.map((tab) => (
        <Link
          aria-current={tab.id === current ? "page" : undefined}
          className={styles.tabLink}
          href={tab.href}
          key={tab.id}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
