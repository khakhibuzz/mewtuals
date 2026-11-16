import styles from "./battery-sections.module.css";
const sections = [
  { id: "map", label: "Map & companies", href: "/ecosystem/batteries" },
  { id: "market", label: "Market catalog", href: "/ecosystem/batteries/market" },
  { id: "policies", label: "Policy watch", href: "/ecosystem/batteries/policies" },
] as const;
export function BatteryNavigation({ current }: { current: typeof sections[number]["id"] }) {
  return <nav className={styles.navigation} aria-label="Battery Atlas sections">
    {sections.map((section) => <a key={section.id} href={section.href} aria-current={section.id === current ? "page" : undefined}>{section.label}</a>)}
  </nav>;
}
