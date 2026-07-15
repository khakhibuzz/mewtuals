"use client";

import { useState } from "react";

import type { DashboardOpportunity } from "../../server/dashboard-service";
import { FormSubmissionAlert } from "./FormSubmissionAlert";
import { postForm } from "./form-client";
import styles from "./product.module.css";

const directionLabels: Record<DashboardOpportunity["direction"], string> = {
  brand_creator: "Brand ↔ creator",
  brand_brand: "Brand ↔ brand",
  creator_creator: "Creator ↔ creator",
  startup_distribution_partner: "Startup ↔ distribution partner",
};

const reviewingMessage = "Mewtuals is reviewing the relationship";

export function OpportunityCard({
  opportunity,
}: {
  opportunity: DashboardOpportunity;
}) {
  const [requested, setRequested] = useState(Boolean(opportunity.introduction));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [sessionExpired, setSessionExpired] = useState(false);

  async function advance() {
    setSubmitting(true);
    setError(undefined);
    setSessionExpired(false);
    try {
      const { response, result } = await postForm(
        `/api/opportunities/${opportunity.id}/advance`,
        {},
      );
      if (response.status === 401) {
        setError("Your session expired. Sign in to continue.");
        setSessionExpired(true);
        return;
      }
      if (!response.ok || result.error) {
        setError(result.error ?? "We could not complete that request. Try again.");
        return;
      }
      setRequested(true);
    } catch {
      setError("We could not complete that request. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className={styles.opportunityCard} data-testid="curated-opportunity">
      <div className={styles.cardHeader}>
        <p className={styles.statusMarker}>Curated pick · 0{opportunity.rank}</p>
        <p className={styles.direction}>{directionLabels[opportunity.direction]}</p>
      </div>
      <h3>{opportunity.title}</h3>
      <p>{opportunity.summary}</p>
      <dl className={styles.opportunityDetails}>
        <div>
          <dt>Counterparty type</dt>
          <dd>{opportunity.counterpartyType}</dd>
        </div>
        <div>
          <dt>Why this fits now</dt>
          <dd>{opportunity.fitSummary.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Reciprocal value</dt>
          <dd>{opportunity.reciprocalValue}</dd>
        </div>
      </dl>
      {requested ? (
        <p className={styles.reviewingStatus} role="status">
          {reviewingMessage}
        </p>
      ) : (
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={submitting}
          onClick={advance}
        >
          {submitting ? "Sending…" : "Ask Mewtuals to advance this"}
        </button>
      )}
      <FormSubmissionAlert message={error} sessionExpired={sessionExpired} />
    </article>
  );
}
