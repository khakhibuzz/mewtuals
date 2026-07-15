"use client";

import type {
  DashboardOpportunity,
  DashboardSignal,
} from "../../server/dashboard-service";
import { OpportunityCard } from "./OpportunityCard";
import { SignalForm } from "./SignalForm";
import styles from "./product.module.css";

export function VerifiedDashboard({
  signal,
  opportunities,
  onSignalSaved,
}: {
  signal: DashboardSignal | null;
  opportunities: DashboardOpportunity[];
  onSignalSaved?: () => void;
}) {
  const curated = opportunities.slice(0, 3);

  return (
    <div className={styles.dashboardStack}>
      <section aria-labelledby="signal-title">
        <p className={styles.statusMarker}>Your signal</p>
        <h2 className={styles.sectionTitle} id="signal-title">
          Tell Mewtuals what you are open to
        </h2>
        <p className={styles.sectionCopy}>
          This signal is private. It helps the team surface a small number of
          timely, reciprocal partnerships.
        </p>
        <SignalForm signal={signal} onSaved={onSignalSaved} />
      </section>

      <section aria-labelledby="picks-title">
        <p className={styles.statusMarker}>Mewtuals Picks</p>
        <h2 className={styles.sectionTitle} id="picks-title">
          Curated for this moment
        </h2>
        {curated.length === 0 ? (
          <p className={styles.emptyState}>No strong fit is ready yet</p>
        ) : (
          <div className={styles.opportunityList}>
            {curated.map((opportunity) => (
              <OpportunityCard opportunity={opportunity} key={opportunity.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
