import { BatteryNavigation } from "./BatteryNavigation";
import styles from "./battery-sections.module.css";
export function BatterySectionHeader({ current, title, description }: { current: "market" | "policies"; title: string; description: string }) {
  return <>
    <header className={styles.heading}><p>MEWTUALS / BATTERY ATLAS / INDIA</p><h1>{title}<span>.</span></h1><div>{description}</div></header>
    <BatteryNavigation current={current} />
  </>;
}
