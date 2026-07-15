"use client";

import { useState } from "react";

import styles from "./product.module.css";

type PendingMember = {
  name: string;
  organisationName: string | null;
  identityLabel: string;
  domain: string | null;
};

type PendingDashboardProps = {
  member: PendingMember;
  status: "pending" | "waitlisted";
  developmentApprovalEnabled: boolean;
  onDevelopmentApproved?: () => void;
};

const comingSoonSlots = [1, 2, 3, 4] as const;

export function PendingDashboard({
  member,
  status,
  developmentApprovalEnabled,
  onDevelopmentApproved,
}: PendingDashboardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function simulateApproval() {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/dev/verification/approve", {
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "We could not approve this profile.");
        return;
      }
      if (onDevelopmentApproved) {
        onDevelopmentApproved();
      } else {
        window.location.reload();
      }
    } catch {
      setError("We could not approve this profile.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "waitlisted") {
    return (
      <div className={styles.dashboardStack}>
        <section className={styles.memberStatus} aria-labelledby="waitlist-title">
          <p className={styles.statusMarker}>Profile retained</p>
          <h2 className={styles.sectionTitle} id="waitlist-title">
            Your profile is safely on file
          </h2>
          <p className={styles.sectionCopy}>
            We are not unlocking partnership picks for this profile yet. We
            have kept your information so the team can revisit it when the
            network has a stronger fit.
          </p>
          <MemberSummary member={member} />
        </section>
      </div>
    );
  }

  return (
    <div className={styles.dashboardStack}>
      <section className={styles.memberStatus} aria-labelledby="pending-title">
        <p className={styles.statusMarker}>Private review</p>
        <h2 className={styles.sectionTitle} id="pending-title">
          Verification in progress
        </h2>
        <p className={styles.sectionCopy}>
          Mewtuals is checking that your identity and submitted source are
          coherent. Curated opportunities unlock only after approval.
        </p>
        <MemberSummary member={member} />
        {developmentApprovalEnabled ? (
          <div className={styles.developmentAction}>
            <p>Local development only</p>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={submitting}
              onClick={simulateApproval}
            >
              {submitting ? "Approving…" : "Simulate approval locally"}
            </button>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="preview-title">
        <div className={styles.sectionHeadingRow}>
          <div>
            <p className={styles.statusMarker}>Mewtuals Picks</p>
            <h2 className={styles.sectionTitle} id="preview-title">
              A preview of the format
            </h2>
          </div>
          <p className={styles.previewNote}>
            This illustrates the format. It is not a real match.
          </p>
        </div>

        <article
          className={styles.exampleCard}
          data-testid="example-opportunity"
        >
          <p className={styles.exampleLabel}>Example opportunity</p>
          <h3>Founder story × specialist publication</h3>
          <p>
            A possible editorial collaboration between a startup founder and a
            relevant media operator. No real counterparty has been selected.
          </p>
          <dl className={styles.opportunityMeta}>
            <div>
              <dt>Direction</dt>
              <dd>Startup ↔ distribution partner</dd>
            </div>
            <div>
              <dt>Reciprocal value</dt>
              <dd>Useful expertise ↔ relevant distribution</dd>
            </div>
          </dl>
        </article>

        <div className={styles.placeholderGrid} aria-label="Future opportunity slots">
          {comingSoonSlots.map((slot) => (
            <article
              className={styles.placeholderCard}
              data-testid="coming-soon-opportunity"
              key={slot}
            >
              <span aria-hidden="true">0{slot}</span>
              <p>Coming soon</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MemberSummary({ member }: { member: PendingMember }) {
  return (
    <dl className={styles.memberSummary}>
      <div>
        <dt>Profile</dt>
        <dd>{member.name}</dd>
      </div>
      <div>
        <dt>Identity</dt>
        <dd>{member.identityLabel}</dd>
      </div>
      {member.organisationName ? (
        <div>
          <dt>Organisation</dt>
          <dd>{member.organisationName}</dd>
        </div>
      ) : null}
      {member.domain ? (
        <div>
          <dt>Domain</dt>
          <dd>{member.domain}</dd>
        </div>
      ) : null}
    </dl>
  );
}
