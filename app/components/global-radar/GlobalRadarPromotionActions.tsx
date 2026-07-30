"use client";

import { useState } from "react";

import { promotionEligibilityPaths } from "../../domain/global-radar";
import {
  adminSection,
  displayLabel,
  numberValue,
  primaryOrganisation,
  record,
  text,
} from "./detail-data";
import type { GlobalRadarSignalDetail } from "./types";
import styles from "./global-radar.module.css";

export type GlobalRadarActionRequest = Readonly<{
  key: string;
  path: string;
  method: "PATCH" | "POST";
  body: Readonly<Record<string, unknown>>;
  successOutcomes: readonly string[];
  successMessage: string;
  responseMode: "detail" | "refresh" | "merge";
}>;

function supportingSignals(value: string) {
  if (!value.trim()) return [];
  const parsed: { signalId: string; revision: number }[] = [];
  for (const line of value.split(/\r?\n/)) {
    const [signalId, revisionText, extra] = line.trim().split(":");
    const revision = Number(revisionText);
    if (extra !== undefined || !signalId || !/^[-0-9a-f]{36}$/i.test(signalId) ||
        !Number.isInteger(revision) || revision < 0) return null;
    parsed.push({ signalId, revision });
  }
  if (new Set(parsed.map(({ signalId }) => signalId)).size !== parsed.length) return null;
  return parsed;
}

export function GlobalRadarPromotionActions({
  detail,
  pending,
  run,
  validationError,
}: {
  detail: GlobalRadarSignalDetail;
  pending: boolean;
  run(request: GlobalRadarActionRequest): void;
  validationError(message: string): void;
}) {
  const allowed = new Set(detail.allowedActions);
  const organisation = primaryOrganisation(detail);
  const entityId = typeof organisation.id === "string" ? organisation.id : null;
  const entityRevision = numberValue(organisation.revision, -1);
  const promotion = record(adminSection(detail).promotion);
  const revisionContext = record(promotion.revisionContext);
  const [supporting, setSupporting] = useState("");
  const [eligibilityPath, setEligibilityPath] = useState<(typeof promotionEligibilityPaths)[number]>(
    "qualified_india_direct_demand",
  );
  const [promotionReason, setPromotionReason] = useState("");
  const [rationale, setRationale] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [reversalConfirmed, setReversalConfirmed] = useState(false);

  function promote() {
    const selected = supportingSignals(supporting);
    if (!entityId || entityRevision < 0 || selected === null ||
        selected.some(({ signalId }) => signalId === detail.id) ||
        !promotionReason.trim() || !rationale.trim() ||
        `${promotionReason.trim()}\nRationale: ${rationale.trim()}`.length > 2_000) {
      validationError("Review the promotion selection, revisions, reason, and rationale.");
      return;
    }
    run({
      key: "promote",
      path: `/api/admin/global-demand-radar/entities/${entityId}/promotions`,
      method: "POST",
      responseMode: "refresh",
      successOutcomes: ["promoted", "replayed"],
      successMessage: "Promoted to India Discovery.",
      body: {
        entityId,
        primarySignalId: detail.id,
        supportingSignalIds: selected.map(({ signalId }) => signalId),
        eligibilityPath,
        expectedEntityRevision: entityRevision,
        expectedPrimarySignalRevision: detail.revision,
        expectedSupportingSignalRevisions: selected,
        idempotencyKey: globalThis.crypto.randomUUID(),
        reason: promotionReason.trim(),
        rationale: rationale.trim(),
      },
    });
  }

  function reverse() {
    const promotedEntityRevision = numberValue(revisionContext.promotedEntity, -1);
    const promotedPrimaryRevision = numberValue(revisionContext.promotedPrimarySignal, -1);
    if (!entityId || promotedEntityRevision < 0 || promotedPrimaryRevision < 0 ||
        !reversalReason.trim() || !reversalConfirmed) {
      validationError("Confirm preservation and provide a reversal reason.");
      return;
    }
    run({
      key: "reverse-promotion",
      path: `/api/admin/global-demand-radar/entities/${entityId}/promotions/reverse`,
      method: "POST",
      responseMode: "refresh",
      successOutcomes: ["reversed", "replayed"],
      successMessage: "Promotion reversed. The Discovery candidate remains intact.",
      body: {
        entityId,
        expectedEntityRevision: promotedEntityRevision,
        expectedPrimarySignalRevision: promotedPrimaryRevision,
        idempotencyKey: globalThis.crypto.randomUUID(),
        reason: reversalReason.trim(),
      },
    });
  }

  return (
    <>
      {allowed.has("promote") ? (
        <form className={styles.actionForm} onSubmit={(event) => { event.preventDefault(); promote(); }}>
          <fieldset disabled={pending}>
            <legend>Controlled promotion</legend>
            <p>Primary signal: {detail.id} · revision {detail.revision}</p>
            <p>Entity: {text(organisation.canonicalName)} · revision {entityRevision}</p>
            <label><span>Supporting signals (UUID:revision, one per line)</span><textarea onChange={(event) => setSupporting(event.target.value)} value={supporting} /></label>
            <label><span>Eligibility path</span><select onChange={(event) => setEligibilityPath(event.target.value as (typeof promotionEligibilityPaths)[number])} value={eligibilityPath}>{promotionEligibilityPaths.map((path) => <option key={path} value={path}>{displayLabel(path)}</option>)}</select></label>
            <label><span>Promotion reason</span><textarea maxLength={2_000} onChange={(event) => setPromotionReason(event.target.value)} required value={promotionReason} /></label>
            <label><span>Promotion rationale</span><textarea maxLength={2_000} onChange={(event) => setRationale(event.target.value)} required value={rationale} /></label>
            <button type="submit">Promote to India Discovery</button>
          </fieldset>
        </form>
      ) : null}
      {allowed.has("reverse_promotion") ? (
        <form className={styles.actionForm} onSubmit={(event) => { event.preventDefault(); reverse(); }}>
          <fieldset disabled={pending}>
            <legend>Reverse Radar promotion</legend>
            <p>This reverses the Radar promotion linkage and status. The Discovery candidate remains intact.</p>
            <label><span>Reversal reason</span><textarea maxLength={2_000} onChange={(event) => setReversalReason(event.target.value)} required value={reversalReason} /></label>
            <label className={styles.confirmation}><input checked={reversalConfirmed} onChange={(event) => setReversalConfirmed(event.target.checked)} type="checkbox" /><span>Confirm Discovery candidate preservation</span></label>
            <button type="submit">Reverse promotion</button>
          </fieldset>
        </form>
      ) : null}
    </>
  );
}
