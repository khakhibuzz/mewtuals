"use client";

import { useEffect, useRef, useState } from "react";

import {
  directDemandAskTypes,
  globalRadarDemandFamilies,
  globalRadarSourceFamilies,
  globalRadarThemes,
  precursorDevelopmentTypes,
} from "../../domain/global-radar";
import {
  type GlobalRadarActionRequest,
  GlobalRadarPromotionActions,
} from "./GlobalRadarPromotionActions";
import {
  adminSection,
  associatedOrganisations,
  booleanValue,
  collectionItems,
  detailSection,
  displayLabel,
  numberValue,
  optionalText,
  primaryOrganisation,
  record,
  stringValues,
  text,
} from "./detail-data";
import {
  isGlobalRadarRecord,
  isGlobalRadarSignalDetail,
  type GlobalRadarAllowedAction,
  type GlobalRadarSignalClass,
  type GlobalRadarSignalDetail,
} from "./types";
import styles from "./global-radar.module.css";

type Feedback = { kind: "status" | "alert"; text: string };
type StoredActionRequest = Readonly<{
  request: GlobalRadarActionRequest;
  bodyText: string;
}>;

const reviewActions = [
  ["request_review", "Request review"],
  ["monitor", "Monitor"],
  ["qualify", "Qualify"],
  ["dismiss", "Dismiss"],
  ["expire", "Expire"],
  ["reopen", "Reopen"],
  ["mark_no_india_fit", "Mark no India fit"],
] as const satisfies readonly (readonly [GlobalRadarAllowedAction, string])[];

type ScoreField = Readonly<{
  key: string;
  sourceKey: string;
  label: string;
}>;

const scoreFields: Record<GlobalRadarSignalClass, readonly ScoreField[]> = {
  direct_demand: [
    { key: "explicitness", sourceKey: "demandExplicitness", label: "Demand explicitness" },
    { key: "evidenceConfidence", sourceKey: "evidenceConfidence", label: "Evidence confidence" },
    { key: "freshness", sourceKey: "freshness", label: "Freshness" },
    { key: "actionability", sourceKey: "actionability", label: "Actionability" },
    { key: "indiaFit", sourceKey: "indiaFit", label: "India fit" },
    { key: "commercialPotential", sourceKey: "commercialPotential", label: "Commercial potential" },
    { key: "repeatability", sourceKey: "repeatability", label: "Repeatability" },
    { key: "responseAccessibility", sourceKey: "responseAccessibility", label: "Response accessibility" },
    { key: "strategicLearning", sourceKey: "strategicLearning", label: "Strategic learning" },
    { key: "complianceComplexity", sourceKey: "complianceComplexity", label: "Compliance complexity" },
  ],
  demand_precursor: [
    { key: "evidenceConfidence", sourceKey: "evidenceConfidence", label: "Evidence confidence" },
    { key: "proximityToExternalDemand", sourceKey: "proximityToExternalDemand", label: "Proximity to external demand" },
    { key: "fundingDeploymentMomentum", sourceKey: "fundingDeploymentMomentum", label: "Funding deployment momentum" },
    { key: "likelyDataHardwareIntensity", sourceKey: "likelyDataHardwareIntensity", label: "Likely data hardware intensity" },
    { key: "indiaFit", sourceKey: "indiaFit", label: "India fit" },
    { key: "estimatedTimeHorizon", sourceKey: "estimatedTimeHorizon", label: "Estimated time horizon" },
    { key: "strategicRelevance", sourceKey: "strategicRelevance", label: "Strategic relevance" },
  ],
  ecosystem_momentum: [
    { key: "taxonomyConsistency", sourceKey: "taxonomyConsistency", label: "Taxonomy consistency" },
    { key: "evidenceQuality", sourceKey: "evidenceQuality", label: "Evidence quality" },
  ],
};

const signalClasses: readonly GlobalRadarSignalClass[] = [
  "direct_demand",
  "demand_precursor",
  "ecosystem_momentum",
];

const signalTypeOptions: Record<GlobalRadarSignalClass, readonly string[]> = {
  direct_demand: directDemandAskTypes,
  demand_precursor: precursorDevelopmentTypes,
  ecosystem_momentum: ["ecosystem_direction"],
};

function mutationEnvelope(detail: GlobalRadarSignalDetail, reason: string) {
  return {
    expectedRevision: detail.revision,
    idempotencyKey: globalThis.crypto.randomUUID(),
    reason: reason.trim(),
  };
}

function splitValues(value: string) {
  return value.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

function useFeedbackFocus(feedback: Feedback | null) {
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedback?.kind === "alert") feedbackRef.current?.focus();
  }, [feedback]);
  return feedbackRef;
}

function ReviewActions({
  detail,
  pending,
  run,
  invalid,
}: ActionFormProps) {
  const [reason, setReason] = useState("");
  const available = reviewActions.filter(([action]) => detail.allowedActions.includes(action));
  if (available.length === 0) return null;
  function submit(action: (typeof reviewActions)[number][0]) {
    if (!reason.trim()) {
      invalid("Provide a review reason before changing status.");
      return;
    }
    run({
      key: action,
      path: `/api/admin/global-demand-radar/signals/${detail.id}`,
      method: "PATCH",
      responseMode: "detail",
      successOutcomes: ["updated", "replayed"],
      successMessage: "Signal updated.",
      body: {
        ...mutationEnvelope(detail, reason),
        command: { type: action },
      },
    });
  }
  return (
    <form className={styles.actionForm} onSubmit={(event) => event.preventDefault()}>
      <fieldset disabled={pending}>
        <legend>Review transitions</legend>
        <label><span>Review reason</span><textarea maxLength={2_000} onChange={(event) => setReason(event.target.value)} required value={reason} /></label>
        <div className={styles.actions}>{available.map(([action, label]) => <button key={action} onClick={() => submit(action)} type="button">{label}</button>)}</div>
      </fieldset>
    </form>
  );
}

type ActionFormProps = {
  detail: GlobalRadarSignalDetail;
  pending: boolean;
  run(request: GlobalRadarActionRequest): void;
  invalid(message: string): void;
};

function ClassificationAction({ detail, pending, run, invalid }: ActionFormProps) {
  const classification = detailSection(detail, "signal_class");
  const timeline = record(detailSection(detail, "scale_and_timeline").timeline);
  const components = record(detailSection(detail, "score_rationale").components);
  const primary = primaryOrganisation(detail);
  const entityOptions = [
    primary,
    ...collectionItems(detailSection(detail, "organisation").associated)
      .map((association) => record(association.organisation)),
  ].flatMap((organisation) => {
    const id = optionalText(organisation.id);
    const name = optionalText(organisation.canonicalName);
    return id && name ? [{ id, name }] : [];
  }).filter((candidate, index, candidates) =>
    candidates.findIndex(({ id }) => id === candidate.id) === index);
  const [reason, setReason] = useState("");
  const [targetClass, setTargetClass] = useState<GlobalRadarSignalClass>(detail.signalClass);
  const [signalTypesByClass, setSignalTypesByClass] = useState<Record<GlobalRadarSignalClass, string>>(() => {
    const existingSignalType = text(classification.signalType, "");
    return Object.fromEntries(signalClasses.map((signalClass) => [
      signalClass,
      signalClass === detail.signalClass && signalTypeOptions[signalClass].includes(existingSignalType)
        ? existingSignalType
        : "",
    ])) as Record<GlobalRadarSignalClass, string>;
  });
  const [demandDomain, setDemandDomain] = useState(() => text(classification.demandDomain, ""));
  const [primaryEntityId, setPrimaryEntityId] = useState(() => optionalText(primary.id) ?? "");
  const [evergreen, setEvergreen] = useState(() =>
    detail.signalClass === "direct_demand" && typeof timeline.evergreen === "boolean"
      ? String(timeline.evergreen)
      : "");
  const [expiresAt, setExpiresAt] = useState(() =>
    detail.signalClass === "direct_demand" ? optionalText(timeline.expiresAt) ?? "" : "");
  const [reobserveBy, setReobserveBy] = useState(() =>
    detail.signalClass === "direct_demand" ? optionalText(timeline.reobserveBy) ?? "" : "");
  const [scoresByClass, setScoresByClass] = useState<Record<GlobalRadarSignalClass, Record<string, string>>>(() =>
    Object.fromEntries(signalClasses.map((signalClass) => [
      signalClass,
      Object.fromEntries(scoreFields[signalClass].map((field) => [
        field.key,
        signalClass === detail.signalClass && typeof components[field.sourceKey] === "number"
          ? String(components[field.sourceKey])
          : "",
      ])),
    ])) as Record<GlobalRadarSignalClass, Record<string, string>>);
  const fields = scoreFields[targetClass];
  const scores = scoresByClass[targetClass];
  const signalType = signalTypesByClass[targetClass];

  function setScore(key: string, value: string) {
    setScoresByClass((current) => ({
      ...current,
      [targetClass]: { ...current[targetClass], [key]: value },
    }));
  }

  function submit() {
    const parsedComponents: Record<string, number | null> = {};
    for (const field of fields) {
      const parsed = numberOrNull(scores[field.key] ?? "");
      if (parsed === undefined || (targetClass === "ecosystem_momentum" && parsed === null)) {
        invalid("Every classification score must be an integer from 0 to 100, or blank where allowed.");
        return;
      }
      parsedComponents[field.key] = parsed;
    }
    if (!reason.trim() || !signalTypeOptions[targetClass].includes(signalType) ||
        !globalRadarDemandFamilies.includes(demandDomain as (typeof globalRadarDemandFamilies)[number]) ||
        (targetClass !== "ecosystem_momentum" &&
          !entityOptions.some(({ id }) => id === primaryEntityId)) ||
        (targetClass === "direct_demand" && !["true", "false"].includes(evergreen))) {
      invalid("Review the classification target and reason.");
      return;
    }
    const classificationBody: Record<string, unknown> = {
      signalClass: targetClass,
      signalType,
      demandDomain,
      ...(targetClass !== "ecosystem_momentum" ? { primaryEntityId } : {}),
      components: parsedComponents,
      ...(targetClass === "direct_demand" ? {
        activity: {
          evergreen: evergreen === "true",
          expiresAt: expiresAt.trim() || null,
          reobserveBy: reobserveBy.trim() || null,
        },
      } : {}),
    };
    run({
      key: "classification",
      path: `/api/admin/global-demand-radar/signals/${detail.id}`,
      method: "PATCH",
      responseMode: "detail",
      successOutcomes: ["updated", "replayed"],
      successMessage: "Classification updated.",
      body: {
        ...mutationEnvelope(detail, reason),
        classification: classificationBody,
      },
    });
  }

  return (
    <form className={styles.actionForm} onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <fieldset disabled={pending}>
        <legend>Classification</legend>
        <label><span>Classification reason</span><textarea maxLength={2_000} onChange={(event) => setReason(event.target.value)} required value={reason} /></label>
        <label><span>Target signal class</span><select onChange={(event) => setTargetClass(event.target.value as GlobalRadarSignalClass)} value={targetClass}>{signalClasses.map((signalClass) => <option key={signalClass} value={signalClass}>{displayLabel(signalClass)}</option>)}</select></label>
        <label><span>Signal type</span><select onChange={(event) => setSignalTypesByClass((current) => ({ ...current, [targetClass]: event.target.value }))} required value={signalType}><option value="">Select a signal type</option>{signalTypeOptions[targetClass].map((option) => <option key={option} value={option}>{displayLabel(option)}</option>)}</select></label>
        <label><span>Demand domain</span><select onChange={(event) => setDemandDomain(event.target.value)} required value={demandDomain}><option value="">Select a demand domain</option>{globalRadarDemandFamilies.map((domain) => <option key={domain} value={domain}>{displayLabel(domain)}</option>)}</select></label>
        {targetClass !== "ecosystem_momentum" ? <label><span>Primary organisation</span><select onChange={(event) => setPrimaryEntityId(event.target.value)} required value={primaryEntityId}><option value="">Select a primary organisation</option>{entityOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label> : null}
        <div className={styles.scoreGrid}>{fields.map((field) => <label key={field.key}><span>{field.label}</span><input max={100} min={0} onChange={(event) => setScore(field.key, event.target.value)} type="number" value={scores[field.key] ?? ""} /></label>)}</div>
        {targetClass === "direct_demand" ? <div className={styles.actionGrid}><label><span>Evergreen classification</span><select onChange={(event) => setEvergreen(event.target.value)} required value={evergreen}><option value="">Select an activity type</option><option value="false">No</option><option value="true">Yes</option></select></label><label><span>Classification expires at (ISO timestamp)</span><input onChange={(event) => setExpiresAt(event.target.value)} value={expiresAt} /></label><label><span>Classification re-observe by (ISO timestamp)</span><input onChange={(event) => setReobserveBy(event.target.value)} value={reobserveBy} /></label></div> : null}
        <button type="submit">Save classification</button>
      </fieldset>
    </form>
  );
}

function ExpiryAction({ detail, pending, run, invalid }: ActionFormProps) {
  const timeline = record(detailSection(detail, "scale_and_timeline").timeline);
  const [reason, setReason] = useState("");
  const [evergreen, setEvergreen] = useState(() => booleanValue(timeline.evergreen));
  const [expiresAt, setExpiresAt] = useState(() => optionalText(timeline.expiresAt) ?? "");
  const [reobserveBy, setReobserveBy] = useState(() => optionalText(timeline.reobserveBy) ?? "");
  function submit() {
    if (!reason.trim()) {
      invalid("Provide a reason for the expiry update.");
      return;
    }
    run({
      key: "expiry",
      path: `/api/admin/global-demand-radar/signals/${detail.id}`,
      method: "PATCH",
      responseMode: "detail",
      successOutcomes: ["updated", "replayed"],
      successMessage: "Expiry updated.",
      body: {
        ...mutationEnvelope(detail, reason),
        expiry: {
          evergreen,
          expiresAt: expiresAt.trim() || null,
          reobserveBy: reobserveBy.trim() || null,
        },
      },
    });
  }
  return <form className={styles.actionForm} onSubmit={(event) => { event.preventDefault(); submit(); }}><fieldset disabled={pending}><legend>Expiry and re-observation</legend><label><span>Expiry reason</span><textarea maxLength={2_000} onChange={(event) => setReason(event.target.value)} required value={reason} /></label><label className={styles.confirmation}><input checked={evergreen} onChange={(event) => setEvergreen(event.target.checked)} type="checkbox" /><span>Evergreen direct demand</span></label><label><span>Expires at (ISO timestamp)</span><input onChange={(event) => setExpiresAt(event.target.value)} value={expiresAt} /></label><label><span>Re-observe by (ISO timestamp)</span><input onChange={(event) => setReobserveBy(event.target.value)} value={reobserveBy} /></label><button type="submit">Save expiry</button></fieldset></form>;
}

function EvidenceAction({ detail, pending, run, invalid }: ActionFormProps) {
  const organisation = primaryOrganisation(detail);
  const momentumOwners = detail.signalClass === "ecosystem_momentum"
    ? associatedOrganisations(detail, "contributor")
    : [];
  const [selectedMomentumOwnerId, setSelectedMomentumOwnerId] = useState("");
  const [form, setForm] = useState({
    reason: "", sourceUrl: "", canonicalSourceUrl: "", sourceName: "", sourceType: "",
    sourceLanguage: "", sourceCountry: "", sourceFamily: globalRadarSourceFamilies[0],
    claim: "", sourceExcerpt: "", englishSummary: "", publishedAt: "", observedAt: "",
    evidenceConfidence: "", translationConfidence: "", supportedFieldPaths: "",
    isPrimarySource: false, isSyndicated: false, supportsDirectDemand: false,
    supportsIndiaRelevance: false,
  });
  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  function submit() {
    const confidence = Number(form.evidenceConfidence);
    const translation = form.translationConfidence.trim() ? Number(form.translationConfidence) : null;
    const supportedFieldPaths = splitValues(form.supportedFieldPaths);
    const globalEntityId = detail.signalClass === "ecosystem_momentum"
      ? momentumOwners.some(({ id }) => id === selectedMomentumOwnerId)
        ? selectedMomentumOwnerId
        : null
      : optionalText(organisation.id);
    if (!form.reason.trim() || !form.sourceUrl.trim() || !form.canonicalSourceUrl.trim() ||
        !form.sourceName.trim() || !form.sourceType.trim() || !form.sourceLanguage.trim() ||
        !form.sourceCountry.trim() || !form.claim.trim() || !form.englishSummary.trim() ||
        !form.observedAt.trim() || !Number.isInteger(confidence) || confidence < 0 || confidence > 100 ||
        (translation !== null && (!Number.isInteger(translation) || translation < 0 || translation > 100)) ||
        supportedFieldPaths.length === 0 ||
        (detail.signalClass === "ecosystem_momentum" && !globalEntityId)) {
      invalid("Review every required public-evidence field before appending.");
      return;
    }
    run({
      key: "evidence",
      path: `/api/admin/global-demand-radar/signals/${detail.id}/evidence`,
      method: "POST",
      responseMode: "refresh",
      successOutcomes: ["appended", "replayed"],
      successMessage: "Evidence appended.",
      body: {
        ...mutationEnvelope(detail, form.reason),
        evidence: {
          globalEntityId,
          sourceUrl: form.sourceUrl.trim(),
          canonicalSourceUrl: form.canonicalSourceUrl.trim(),
          sourceName: form.sourceName.trim(),
          sourceType: form.sourceType.trim(),
          sourceLanguage: form.sourceLanguage.trim(),
          sourceCountry: form.sourceCountry.trim(),
          sourceFamily: form.sourceFamily,
          claim: form.claim.trim(),
          sourceExcerpt: form.sourceExcerpt.trim() || null,
          englishSummary: form.englishSummary.trim(),
          publishedAt: form.publishedAt.trim() || null,
          observedAt: form.observedAt.trim(),
          evidenceConfidence: confidence,
          translationConfidence: translation,
          isPrimarySource: form.isPrimarySource,
          isSyndicated: form.isSyndicated,
          supportsDirectDemand: form.supportsDirectDemand,
          supportsIndiaRelevance: form.supportsIndiaRelevance,
          rawMetadata: {},
          supportedFieldPaths,
        },
      },
    });
  }
  const input = (label: string, key: keyof typeof form, maximum: number, textarea = false) => <label><span>{label}</span>{textarea ? <textarea maxLength={maximum} onChange={(event) => set(key, event.target.value)} value={String(form[key])} /> : <input maxLength={maximum} onChange={(event) => set(key, event.target.value)} value={String(form[key])} />}</label>;
  const ownerControl = detail.signalClass === "ecosystem_momentum" ? (
    <label>
      <span>Evidence owner</span>
      <select
        onChange={(event) => setSelectedMomentumOwnerId(event.target.value)}
        required
        value={selectedMomentumOwnerId}
      >
        <option value="">Select a contributor</option>
        {momentumOwners.map((owner) => (
          <option key={String(owner.id)} value={String(owner.id)}>
            {text(owner.canonicalName)}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <p>
      Evidence owner (locked): {optionalText(organisation.id)
        ? `${text(organisation.canonicalName)} · ${text(organisation.id)}`
        : "No primary organisation recorded"}
    </p>
  );
  return <form className={styles.actionForm} onSubmit={(event) => { event.preventDefault(); submit(); }}><fieldset disabled={pending}><legend>Append public evidence</legend>{ownerControl}{input("Evidence reason", "reason", 2_000, true)}{input("Source URL", "sourceUrl", 2_048)}{input("Canonical source URL", "canonicalSourceUrl", 2_048)}{input("Source name", "sourceName", 200)}{input("Source type", "sourceType", 100)}{input("Source language", "sourceLanguage", 35)}{input("Source country", "sourceCountry", 100)}<label><span>Source family</span><select onChange={(event) => set("sourceFamily", event.target.value)} value={String(form.sourceFamily)}>{globalRadarSourceFamilies.map((family) => <option key={family} value={family}>{displayLabel(family)}</option>)}</select></label>{input("Public claim", "claim", 1_000, true)}{input("Source excerpt", "sourceExcerpt", 500, true)}{input("Evidence English summary", "englishSummary", 2_000, true)}{input("Published at (ISO timestamp)", "publishedAt", 35)}{input("Observed at (ISO timestamp)", "observedAt", 35)}<label><span>Evidence confidence</span><input max={100} min={0} onChange={(event) => set("evidenceConfidence", event.target.value)} type="number" value={String(form.evidenceConfidence)} /></label><label><span>Translation confidence</span><input max={100} min={0} onChange={(event) => set("translationConfidence", event.target.value)} type="number" value={String(form.translationConfidence)} /></label>{input("Supported field paths", "supportedFieldPaths", 5_000, true)}<div className={styles.checkboxGrid}>{([[
    "Primary source", "isPrimarySource"], ["Syndicated source", "isSyndicated"], ["Supports direct demand", "supportsDirectDemand"], ["Supports India relevance", "supportsIndiaRelevance"],
  ] as const).map(([label, key]) => <label className={styles.confirmation} key={key}><input checked={Boolean(form[key])} onChange={(event) => set(key, event.target.checked)} type="checkbox" /><span>{label}</span></label>)}</div><button type="submit">Append evidence</button></fieldset></form>;
}

function NoteAction({ detail, pending, run, invalid }: ActionFormProps) {
  const [reason, setReason] = useState("");
  const [body, setBody] = useState("");
  function submit() {
    if (!reason.trim() || !body.trim()) {
      invalid("Provide both the note and its audit reason.");
      return;
    }
    run({ key: "note", path: `/api/admin/global-demand-radar/signals/${detail.id}/notes`, method: "POST", responseMode: "refresh", successOutcomes: ["appended", "replayed"], successMessage: "Note appended.", body: { ...mutationEnvelope(detail, reason), body: body.trim() } });
  }
  return <form className={styles.actionForm} onSubmit={(event) => { event.preventDefault(); submit(); }}><fieldset disabled={pending}><legend>Append administrator note</legend><label><span>Note reason</span><textarea maxLength={2_000} onChange={(event) => setReason(event.target.value)} required value={reason} /></label><label><span>Administrator note</span><textarea maxLength={2_000} onChange={(event) => setBody(event.target.value)} required value={body} /></label><button type="submit">Append note</button></fieldset></form>;
}

function MergeAction({ detail, pending, run, invalid }: ActionFormProps) {
  const [duplicateSignalId, setDuplicateSignalId] = useState("");
  const [duplicateRevision, setDuplicateRevision] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  function submit() {
    const revision = Number(duplicateRevision);
    if (!/^[-0-9a-f]{36}$/i.test(duplicateSignalId) || !Number.isInteger(revision) || revision < 0 || !reason.trim() || !confirmed) {
      invalid("Confirm preservation and provide the duplicate identifier, revision, and reason.");
      return;
    }
    run({ key: "merge", path: `/api/admin/global-demand-radar/signals/${detail.id}/merge`, method: "POST", responseMode: "merge", successOutcomes: ["merged", "replayed"], successMessage: "Signals merged with history preserved.", body: { survivorSignalId: detail.id, duplicateSignalId, expectedSurvivorRevision: detail.revision, expectedDuplicateRevision: revision, confirmed: true, idempotencyKey: globalThis.crypto.randomUUID(), reason: reason.trim() } });
  }
  return <form className={styles.actionForm} onSubmit={(event) => { event.preventDefault(); submit(); }}><fieldset disabled={pending}><legend>Merge duplicate signal</legend><p>Both signal records and their complete history and evidence remain preserved.</p><label><span>Duplicate signal ID</span><input onChange={(event) => setDuplicateSignalId(event.target.value)} value={duplicateSignalId} /></label><label><span>Duplicate revision</span><input min={0} onChange={(event) => setDuplicateRevision(event.target.value)} type="number" value={duplicateRevision} /></label><label><span>Merge reason</span><textarea maxLength={2_000} onChange={(event) => setReason(event.target.value)} required value={reason} /></label><label className={styles.confirmation}><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>Confirm preserved merge history</span></label><button type="submit">Merge into this signal</button></fieldset></form>;
}

function WatchlistAction({ detail, pending, run, invalid }: ActionFormProps) {
  const organisation = primaryOrganisation(detail);
  const existing = record(adminSection(detail).watchlist);
  const signalClass = detailSection(detail, "signal_class");
  const [form, setForm] = useState({
    state: text(existing.state, "enabled"), priority: String(numberValue(existing.priority, 50)),
    theme: text(existing.theme, text(signalClass.theme, globalRadarThemes[0])),
    category: text(existing.category, text(signalClass.demandDomain, "global_radar")),
    categorySearchTermEn: text(existing.categorySearchTermEn, text(organisation.canonicalName, "Global Radar entity")),
    categorySearchTermZhCn: optionalText(existing.categorySearchTermZhCn) ?? "",
    countries: stringValues(existing.countries).join(", ") || text(organisation.headquartersCountry, "Global"),
    languages: stringValues(existing.languages).join(", ") || "en",
    cadenceDays: String(numberValue(existing.cadenceDays, 7)), nextScanAt: optionalText(existing.nextScanAt) ?? "",
    reason: text(existing.reason, "Monitor public evidence."),
  });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  function submit() {
    const entityId = optionalText(organisation.id);
    const priority = Number(form.priority);
    const cadenceDays = Number(form.cadenceDays);
    const countries = splitValues(form.countries);
    const languages = splitValues(form.languages);
    if (!entityId || !form.reason.trim() || !form.category.trim() || !form.categorySearchTermEn.trim() ||
        !Number.isInteger(priority) || priority < 0 || priority > 100 ||
        !Number.isInteger(cadenceDays) || cadenceDays < 1 || cadenceDays > 365 ||
        countries.length === 0 || languages.length === 0 || languages.some((language) => !["en", "zh-CN"].includes(language))) {
      invalid("Review the complete watchlist configuration and reason.");
      return;
    }
    run({ key: "watchlist", path: `/api/admin/global-demand-radar/entities/${entityId}/watchlist`, method: "PATCH", responseMode: "refresh", successOutcomes: ["created", "updated", "replayed"], successMessage: "Watchlist updated.", body: {
      entity: { type: "existing", entityId, expectedRevision: numberValue(organisation.revision) },
      expectedEntryRevision: Object.keys(existing).length > 0 ? numberValue(existing.revision) : null,
      idempotencyKey: globalThis.crypto.randomUUID(), reason: form.reason.trim(),
      configuration: { state: form.state, priority, theme: form.theme, category: form.category.trim(), categorySearchTermEn: form.categorySearchTermEn.trim(), categorySearchTermZhCn: form.categorySearchTermZhCn.trim() || null, countries, languages, cadenceDays, nextScanAt: form.nextScanAt.trim() || null },
    } });
  }
  return <form className={styles.actionForm} onSubmit={(event) => { event.preventDefault(); submit(); }}><fieldset disabled={pending}><legend>Watchlist configuration</legend><label><span>Watchlist reason</span><textarea maxLength={2_000} onChange={(event) => set("reason", event.target.value)} required value={form.reason} /></label><div className={styles.actionGrid}><label><span>Watchlist state</span><select onChange={(event) => set("state", event.target.value)} value={form.state}><option value="enabled">Enabled</option><option value="paused">Paused</option><option value="disabled">Disabled</option></select></label><label><span>Watchlist priority</span><input max={100} min={0} onChange={(event) => set("priority", event.target.value)} type="number" value={form.priority} /></label><label><span>Watchlist theme</span><select onChange={(event) => set("theme", event.target.value)} value={form.theme}>{globalRadarThemes.map((theme) => <option key={theme} value={theme}>{displayLabel(theme)}</option>)}</select></label><label><span>Watchlist category</span><input maxLength={200} onChange={(event) => set("category", event.target.value)} value={form.category} /></label><label><span>Watchlist English search term</span><input maxLength={500} onChange={(event) => set("categorySearchTermEn", event.target.value)} value={form.categorySearchTermEn} /></label><label><span>Watchlist Chinese search term</span><input lang="zh-CN" maxLength={500} onChange={(event) => set("categorySearchTermZhCn", event.target.value)} value={form.categorySearchTermZhCn} /></label><label><span>Watchlist countries</span><input onChange={(event) => set("countries", event.target.value)} value={form.countries} /></label><label><span>Watchlist languages</span><input onChange={(event) => set("languages", event.target.value)} value={form.languages} /></label><label><span>Watchlist cadence in days</span><input max={365} min={1} onChange={(event) => set("cadenceDays", event.target.value)} type="number" value={form.cadenceDays} /></label><label><span>Watchlist next scan (ISO timestamp)</span><input onChange={(event) => set("nextScanAt", event.target.value)} value={form.nextScanAt} /></label></div><button type="submit">Save watchlist</button></fieldset></form>;
}

export function GlobalRadarActions({
  detail,
  onDetailChange,
}: {
  detail: GlobalRadarSignalDetail;
  onDetailChange(detail: GlobalRadarSignalDetail): void;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [unknownRequest, setUnknownRequest] = useState<StoredActionRequest | null>(null);
  const feedbackRef = useFeedbackFocus(feedback);
  const actionsRef = useRef<HTMLDivElement>(null);
  const allowed = new Set(detail.allowedActions);

  function isCurrentDetail(value: unknown): value is GlobalRadarSignalDetail {
    return isGlobalRadarSignalDetail(value) && value.id === detail.id;
  }

  async function refreshDetail() {
    const response = await fetch(`/api/admin/global-demand-radar/signals/${detail.id}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok || !isGlobalRadarRecord(value) || value.ok !== true ||
        value.outcome !== "found" || !isCurrentDetail(value.detail)) return false;
    onDetailChange(value.detail);
    return true;
  }

  function retainUnknownRequest(stored: StoredActionRequest) {
    setUnknownRequest(stored);
    setFeedback({
      kind: "alert",
      text: "The action outcome is unknown. Inputs are locked until the latest safe record is refreshed and this exact request is retried.",
    });
  }

  async function submit(stored: StoredActionRequest, refreshBeforeRetry: boolean) {
    if (pendingKey) return;
    const { request, bodyText } = stored;
    setPendingKey(request.key);
    setFeedback(null);
    try {
      if (refreshBeforeRetry && !await refreshDetail()) {
        setFeedback({
          kind: "alert",
          text: "The action outcome is still unknown because the latest safe record could not be refreshed.",
        });
        return;
      }
      const response = await fetch(request.path, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: bodyText,
      });
      const value: unknown = await response.json().catch(() => null);
      const body = isGlobalRadarRecord(value) ? value : null;
      if (response.status === 409) {
        setUnknownRequest(null);
        const latest = body && isCurrentDetail(body.latest)
          ? body.latest
          : body && isCurrentDetail(body.survivor)
            ? body.survivor
            : null;
        if (latest) onDetailChange(latest);
        else await refreshDetail().catch(() => false);
        setFeedback({ kind: "alert", text: "The record changed. Review the latest safe state before retrying." });
        return;
      }
      if (response.status >= 500) {
        retainUnknownRequest(stored);
        return;
      }
      if (!response.ok) {
        setUnknownRequest(null);
        setFeedback({ kind: "alert", text: "The administrator action could not be completed." });
        return;
      }
      if (!body || body.ok !== true || typeof body.outcome !== "string" ||
          !request.successOutcomes.includes(body.outcome)) {
        retainUnknownRequest(stored);
        return;
      }
      let adopted = false;
      if (request.responseMode === "detail" && isCurrentDetail(body.detail)) {
        onDetailChange(body.detail);
        adopted = true;
      } else if (request.responseMode === "merge" && isCurrentDetail(body.survivor)) {
        onDetailChange(body.survivor);
        adopted = true;
      } else if (request.responseMode === "refresh") {
        adopted = await refreshDetail();
      }
      if (!adopted) {
        retainUnknownRequest(stored);
        return;
      }
      setUnknownRequest(null);
      setFeedback({ kind: "status", text: request.successMessage });
    } catch {
      retainUnknownRequest(stored);
    } finally {
      setPendingKey(null);
    }
  }

  function execute(request: GlobalRadarActionRequest) {
    if (pendingKey || unknownRequest) return;
    void submit({ request, bodyText: JSON.stringify(request.body) }, false);
  }

  function retryUnknownRequest() {
    if (!unknownRequest || pendingKey) return;
    void submit(unknownRequest, true);
  }

  function invalid(message: string) {
    setFeedback({ kind: "alert", text: message });
  }

  const feedbackMessage = feedback ? (
    <div ref={feedbackRef} role={feedback.kind} tabIndex={feedback.kind === "alert" ? -1 : undefined}>
      <p>{feedback.text}</p>
      {feedback.kind === "alert" ? unknownRequest
        ? <button disabled={pendingKey !== null} onClick={retryUnknownRequest} type="button">Refresh and retry exact request</button>
        : <button onClick={() => actionsRef.current?.focus()} type="button">Review latest state and retry</button>
        : null}
    </div>
  ) : null;

  if (detail.allowedActions.length === 0) {
    return <>{feedbackMessage}<p>No administrator mutations are currently allowed for this signal.</p></>;
  }

  const actionsLocked = pendingKey !== null || unknownRequest !== null;
  const formProps: ActionFormProps = {
    detail,
    pending: actionsLocked,
    run: execute,
    invalid,
  };
  const actionStateKey = `${detail.id}:${detail.revision}`;
  return (
    <div aria-label="Available administrator actions" className={styles.actionStack} ref={actionsRef} role="region" tabIndex={-1}>
      {feedbackMessage}
      <ReviewActions {...formProps} key={`review:${actionStateKey}`} />
      {allowed.has("edit_classification") ? <ClassificationAction {...formProps} key={`classification:${actionStateKey}`} /> : null}
      {allowed.has("edit_expiry") ? <ExpiryAction {...formProps} key={`expiry:${actionStateKey}`} /> : null}
      {allowed.has("append_evidence") ? <EvidenceAction {...formProps} key={`evidence:${actionStateKey}`} /> : null}
      {allowed.has("append_note") ? <NoteAction {...formProps} key={`note:${actionStateKey}`} /> : null}
      {allowed.has("merge") ? <MergeAction {...formProps} key={`merge:${actionStateKey}`} /> : null}
      {allowed.has("edit_watchlist") ? <WatchlistAction {...formProps} key={`watchlist:${actionStateKey}`} /> : null}
      <GlobalRadarPromotionActions detail={detail} key={`promotion:${actionStateKey}`} pending={actionsLocked} run={execute} validationError={invalid} />
    </div>
  );
}
