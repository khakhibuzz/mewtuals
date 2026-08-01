"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { GlobalRadarActions } from "./GlobalRadarActions";
import {
  adminSection,
  associatedOrganisations,
  collectionItems,
  detailSection,
  displayLabel,
  formatRadarDate,
  nullableNumber,
  numberValue,
  optionalText,
  primaryOrganisation,
  record,
  records,
  stringValues,
  text,
} from "./detail-data";
import type {
  GlobalRadarDetailSectionId,
  GlobalRadarSignalDetail as GlobalRadarSignalDetailDto,
} from "./types";
import styles from "./global-radar.module.css";

function BackLink({ returnTo }: { returnTo: string }) {
  const label = returnTo.startsWith("/admin/global-demand-radar/demand-precursors")
    ? "Demand Precursors"
    : returnTo.startsWith("/admin/global-demand-radar/momentum")
      ? "Momentum"
      : "Direct Demand";
  return <Link className={styles.backLink} href={returnTo} prefetch={false}>Back to {label}</Link>;
}

function Values({ values, empty = "Not recorded" }: { values: readonly string[]; empty?: string }) {
  return values.length > 0
    ? <ul className={styles.valueList}>{values.map((value) => <li key={value}>{displayLabel(value)}</li>)}</ul>
    : <p>{empty}</p>;
}

function DefinitionList({
  values,
}: {
  values: readonly Readonly<{ label: string; value: ReactNode }>[];
}) {
  return (
    <dl className={styles.detailFacts}>
      {values.map((item) => (
        <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
      ))}
    </dl>
  );
}

const MAX_SAFE_VALUE_DEPTH = 5;
const MAX_SAFE_COLLECTION_ITEMS = 50;
const MAX_SAFE_RENDERED_VALUES = 250;

type SafeValueResult = Readonly<{
  node: ReactNode;
  remaining: number;
}>;

function renderSafeValue({
  value,
  depth,
  remaining,
}: {
  value: unknown;
  depth: number;
  remaining: number;
}): SafeValueResult {
  if (remaining <= 0) {
    return { node: <span>Additional detail omitted.</span>, remaining: 0 };
  }
  const nextRemaining = remaining - 1;

  if (value === null || value === undefined) {
    return { node: <span>Unknown</span>, remaining: nextRemaining };
  }
  if (typeof value === "string") {
    return { node: <span>{value}</span>, remaining: nextRemaining };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { node: <span>{value}</span>, remaining: nextRemaining };
  }
  if (typeof value === "boolean") {
    return { node: <span>{String(value)}</span>, remaining: nextRemaining };
  }

  if (depth >= MAX_SAFE_VALUE_DEPTH) {
    return {
      node: <span>Additional nested detail omitted.</span>,
      remaining: nextRemaining,
    };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { node: <span>Not recorded</span>, remaining: nextRemaining };
    }
    const items = value.slice(0, MAX_SAFE_COLLECTION_ITEMS);
    const nodes: ReactNode[] = [];
    let available = nextRemaining;
    for (const [index, item] of items.entries()) {
      if (available <= 0) {
        nodes.push(<li key="budget-omitted">Additional detail omitted.</li>);
        break;
      }
      const result = renderSafeValue({ value: item, depth: depth + 1, remaining: available });
      available = result.remaining;
      nodes.push(<li key={index}>{result.node}</li>);
    }
    if (value.length > items.length) {
      nodes.push(<li key="items-omitted">Additional items omitted.</li>);
    }
    return {
      node: <ul className={styles.safeValueList}>{nodes}</ul>,
      remaining: available,
    };
  }

  const source = record(value);
  const entries = Object.entries(source).slice(0, MAX_SAFE_COLLECTION_ITEMS);
  if (entries.length === 0) {
    return { node: <span>Not recorded</span>, remaining: nextRemaining };
  }
  const nodes: ReactNode[] = [];
  let available = nextRemaining;
  for (const [key, item] of entries) {
    if (available <= 0) {
      nodes.push(
        <div key="budget-omitted">
          <dt>Additional detail</dt>
          <dd>Additional detail omitted.</dd>
        </div>,
      );
      break;
    }
    const result = renderSafeValue({ value: item, depth: depth + 1, remaining: available });
    available = result.remaining;
    nodes.push(
      <div key={key}>
        <dt>{displayLabel(key)}</dt>
        <dd>{result.node}</dd>
      </div>,
    );
  }
  if (Object.keys(source).length > entries.length) {
    nodes.push(
      <div key="fields-omitted">
        <dt>Additional fields</dt>
        <dd>Additional fields omitted.</dd>
      </div>,
    );
  }
  return {
    node: <dl className={styles.safeRecord}>{nodes}</dl>,
    remaining: available,
  };
}

function SafeRecord({ value }: { value: unknown }) {
  const source = record(value);
  if (Object.keys(source).length === 0) return <p>Not recorded</p>;
  return <>{renderSafeValue({
    value: source,
    depth: 0,
    remaining: MAX_SAFE_RENDERED_VALUES,
  }).node}</>;
}

function Organisation({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "organisation");
  const primary = primaryOrganisation(detail);
  const associated = collectionItems(data.associated);
  return (
    <>
      {Object.keys(primary).length > 0 ? (
        <div className={styles.detailCard}>
          <h3>{text(primary.canonicalName)}</h3>
          <p>{text(primary.shortDescription)}</p>
          <DefinitionList values={[
            { label: "Headquarters", value: [optionalText(primary.headquartersCity), optionalText(primary.headquartersCountry)].filter(Boolean).join(", ") },
            { label: "Type", value: displayLabel(text(primary.organisationType)) },
            { label: "Sector", value: displayLabel(text(primary.sector)) },
            { label: "Status", value: displayLabel(text(primary.entityStatus)) },
            { label: "Revision", value: numberValue(primary.revision) },
          ]} />
          <div className={styles.evidenceLinks}>
            {optionalText(primary.websiteUrl) ? <a href={text(primary.websiteUrl)} rel="noreferrer" target="_blank">Official website</a> : null}
            {optionalText(primary.linkedinUrl) ? <a href={text(primary.linkedinUrl)} rel="noreferrer" target="_blank">Official LinkedIn page</a> : null}
          </div>
        </div>
      ) : <p>No primary organisation is attached.</p>}
      {associated.length > 0 ? (
        <div><h3>Associated organisations</h3><ul className={styles.detailCards}>{associated.map((item) => {
          const organisation = record(item.organisation);
          return <li key={`${text(organisation.id)}-${text(item.role)}`}><strong>{text(organisation.canonicalName)}</strong><span>{displayLabel(text(item.role))} · {numberValue(item.confidence)} confidence</span></li>;
        })}</ul></div>
      ) : null}
    </>
  );
}

function WhatChanged({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "what_changed");
  return <><p className={styles.lead}>{text(data.title)}</p><DefinitionList values={[
    { label: "Observed", value: formatRadarDate(data.observedAt) },
    { label: "First seen", value: formatRadarDate(data.firstSeenAt) },
    { label: "Last seen", value: formatRadarDate(data.lastSeenAt) },
  ]} /></>;
}

function SignalClass({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "signal_class");
  return <DefinitionList values={[
    { label: "Class", value: displayLabel(text(data.signalClass)) },
    { label: "Type", value: displayLabel(text(data.signalType)) },
    { label: "Theme", value: displayLabel(text(data.theme)) },
    { label: "Demand domain", value: displayLabel(text(data.demandDomain)) },
    { label: "Source country", value: text(data.sourceCountry) },
    { label: "Industry", value: displayLabel(text(data.industry)) },
    { label: "Status", value: displayLabel(text(data.status)) },
  ]} />;
}

function PublicFacts({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "publicly_supported_facts");
  return <><p className={styles.lead}>{text(data.factualSummary)}</p><DefinitionList values={[
    { label: "Target geographies", value: stringValues(data.targetGeographies).join(", ") || "Not recorded" },
    { label: "Collection geographies", value: stringValues(data.collectionGeographies).join(", ") || "Not recorded" },
    { label: "Manufacturing geographies", value: stringValues(data.manufacturingGeographies).join(", ") || "Not recorded" },
    { label: "Delivery geographies", value: stringValues(data.deliveryGeographies).join(", ") || "Not recorded" },
    { label: "Target model or system", value: text(data.targetModelOrSystem) },
  ]} /></>;
}

function RequiredCapabilities({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "required_capabilities");
  const requirements = collectionItems(data.requirements);
  return <><h3>Capability tags</h3><Values values={stringValues(data.targetCapabilityTags)} /><h3>Counterparty archetypes</h3><Values values={stringValues(data.requiredCounterpartyArchetypes)} /><h3>Requirements</h3>{requirements.length > 0 ? <ul className={styles.detailCards}>{requirements.map((item) => <li key={text(item.id)}><strong>{text(item.summary)}</strong><span>{displayLabel(text(item.kind))} · {displayLabel(text(item.capabilityTag))} · {numberValue(item.confidence)} confidence</span></li>)}</ul> : <p>No requirements recorded.</p>}</>;
}

function PhysicalSpecifications({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const items = records(detailSection(detail, "physical_data_or_hardware_specifications").items);
  return items.length > 0 ? <div className={styles.detailCards}>{items.map((item) => <article className={styles.detailCard} key={text(item.id)}><h3>{text(item.summary)}</h3><DefinitionList values={[
    { label: "Kind", value: displayLabel(text(item.kind)) },
    { label: "Capability", value: displayLabel(text(item.capabilityTag)) },
    { label: "Confidence", value: numberValue(item.confidence) },
  ]} /><h4>Scale</h4><SafeRecord value={item.scaleSpecification} /><h4>Technical</h4><SafeRecord value={item.technicalSpecification} /><h4>Quality</h4><SafeRecord value={item.qualitySpecification} /><h4>Rights and compliance</h4><SafeRecord value={item.rightsAndComplianceSpecification} /></article>)}</div> : <p>No physical-data or hardware specification recorded.</p>;
}

function TargetEnvironments({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const items = records(detailSection(detail, "target_environments_and_tasks").items);
  return items.length > 0 ? <div className={styles.detailCards}>{items.map((item) => <article className={styles.detailCard} key={text(item.requirementId)}><h3>Requirement {text(item.requirementId)}</h3><DefinitionList values={[
    { label: "Environments", value: stringValues(item.environments).map(displayLabel).join(", ") || "Not recorded" },
    { label: "Tasks", value: stringValues(item.taskFamilies).map(displayLabel).join(", ") || "Not recorded" },
    { label: "Collection methods", value: stringValues(item.collectionMethods).map(displayLabel).join(", ") || "Not recorded" },
    { label: "Human roles", value: stringValues(item.humanRoles).map(displayLabel).join(", ") || "Not recorded" },
    { label: "Robot embodiments", value: stringValues(item.robotEmbodiments).map(displayLabel).join(", ") || "Not recorded" },
  ]} /></article>)}</div> : <p>No target environment or task recorded.</p>;
}

function IndiaFit({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "india_fit_reasoning_and_constraints");
  return <><p className={styles.lead}>{text(data.rationale)}</p><DefinitionList values={[
    { label: "Relevance", value: displayLabel(text(data.relevanceType)) },
    { label: "Confidence", value: numberValue(data.confidence) },
  ]} /><h3>Reasons</h3><Values values={stringValues(data.reasons)} /><h3>Constraints</h3><Values values={stringValues(data.constraints)} /><h3>Unknowns</h3><Values values={stringValues(data.unknowns)} /><h3>Regulatory facts</h3><SafeRecord value={data.regulatoryFacts} /><h3>Logistics facts</h3><SafeRecord value={data.logisticsFacts} /></>;
}

function SystemsContext({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "systems_context_explanation");
  return <><p className={styles.lead}>{text(data.summary)}</p><DefinitionList values={[
    { label: "Stack type", value: displayLabel(text(data.stackType)) },
    { label: "Higher-level goal", value: text(data.higherLevelSystemGoal) },
    { label: "Relevant layer", value: displayLabel(text(data.relevantStackLayer)) },
    { label: "Lower-level inputs", value: stringValues(data.lowerLevelInputsRequired).map(displayLabel).join(", ") || "Not recorded" },
    { label: "Capability added", value: text(data.transformationOrCapabilityAdded) },
    { label: "Downstream behavior", value: text(data.downstreamModelOrRobotBehavior) },
    { label: "Why it matters", value: text(data.whyTheRequirementMatters) },
    { label: "Possible Indian role", value: text(data.possibleIndianExecutionRole) },
  ]} /><div className={styles.layerSplit}><div><h3>Factual elements</h3><Values values={stringValues(data.factualElements)} /></div><div><h3>Inferred elements</h3><Values values={stringValues(data.inferredElements)} /></div></div></>;
}

function ScaleTimeline({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "scale_and_timeline");
  const timeline = record(data.timeline);
  const requirements = records(data.requirements);
  const evergreen = timeline.evergreen === true
    ? "Yes"
    : timeline.evergreen === false
      ? "No"
      : "Not recorded";
  return <><DefinitionList values={[
    { label: "Announced", value: formatRadarDate(timeline.announcedAt) },
    { label: "Effective", value: formatRadarDate(timeline.effectiveFrom) },
    { label: "Expires", value: formatRadarDate(timeline.expiresAt) },
    { label: "Evergreen", value: evergreen },
    { label: "Re-observe by", value: formatRadarDate(timeline.reobserveBy) },
    { label: "Observed", value: formatRadarDate(timeline.observedAt) },
  ]} />{requirements.map((item) => <div key={text(item.requirementId)}><h3>Requirement {text(item.requirementId)} scale</h3><SafeRecord value={item.scaleSpecification} /></div>)}</>;
}

function ResponsePath({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "public_response_path");
  const url = optionalText(data.url) ?? optionalText(data.partnerApplicationUrl);
  return <><p className={styles.evidenceOnly}>Evidence only — no outreach is performed.</p><DefinitionList values={[
    { label: "Published path type", value: displayLabel(text(data.type)) },
    { label: "Published business email", value: text(data.businessEmail) },
  ]} />{url ? <a href={url} rel="noreferrer" target="_blank">View public response-path evidence</a> : <p>No public response path recorded.</p>}</>;
}

function Compliance({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "compliance_flags");
  return <div className={styles.layerSplit}><div><h3>Sensitive-data flags</h3><SafeRecord value={data.sensitiveDataFlags} /></div><div><h3>Documented facts</h3><SafeRecord value={data.facts} /></div></div>;
}

function SupportingEvidence({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const items = collectionItems(detailSection(detail, "supporting_evidence"));
  const primary = primaryOrganisation(detail);
  const safeOrganisations = [
    ...(typeof primary.id === "string" ? [primary] : []),
    ...associatedOrganisations(detail),
  ];
  return items.length > 0 ? (
    <ul className={styles.evidenceList}>
      {items.map((item) => {
        const ownerId = optionalText(item.globalEntityId);
        const owner = safeOrganisations.find(({ id }) => id === ownerId);
        const ownerLabel = ownerId
          ? `${owner ? text(owner.canonicalName) : "Unavailable in current safe detail"} · ${ownerId}`
          : "Signal-wide evidence";
        return (
          <li key={text(item.id)}>
            <a href={text(item.sourceUrl)} rel="noreferrer" target="_blank">
              {text(item.sourceName)}
            </a>
            <p>Evidence owner: {ownerLabel}</p>
            <p>{displayLabel(text(item.sourceType))} · {text(item.sourceCountry)} · confidence {numberValue(item.evidenceConfidence)}</p>
            <Values values={stringValues(item.supportedFieldPaths)} />
          </li>
        );
      })}
    </ul>
  ) : <p>No supporting evidence recorded.</p>;
}

function OriginalLanguage({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const items = collectionItems(detailSection(detail, "original_language_source"));
  return items.length > 0 ? <div className={styles.detailCards}>{items.map((item) => {
    const language = optionalText(item.lang) ?? "und";
    const direction = item.dir === "rtl" ? "rtl" : "ltr";
    return <article className={styles.detailCard} key={text(item.id)}><h3>{text(item.sourceName)}</h3><blockquote dir={direction} lang={language}>{text(item.claim)}</blockquote>{optionalText(item.excerpt) ? <p dir={direction} lang={language}>{text(item.excerpt)}</p> : null}<a href={text(item.sourceUrl)} rel="noreferrer" target="_blank">View original public source</a></article>;
  })}</div> : <p>No original-language source recorded.</p>;
}

function EnglishSummary({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const items = collectionItems(detailSection(detail, "english_summary"));
  return items.length > 0 ? <div className={styles.detailCards}>{items.map((item) => <article className={styles.detailCard} key={text(item.id)} lang="en"><p>{text(item.summary)}</p><p>Translation confidence: {nullableNumber(item.translationConfidence) ?? "Not scored"}</p><a href={text(item.sourceUrl)} rel="noreferrer" target="_blank">View translated source evidence</a></article>)}</div> : <p lang="en">No English summary recorded.</p>;
}

function scoreComponentLabel(value: string) {
  return displayLabel(
    value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(),
  );
}

function ScoreEvidenceAssociations({ value }: { value: unknown }) {
  const associations = records(value);
  if (associations.length === 0) {
    return <p>No score-component evidence associations recorded.</p>;
  }
  return (
    <div className={styles.detailCards}>
      {associations.map((association) => {
        const component = text(association.component);
        const citations = records(association.evidence);
        return (
          <article className={styles.detailCard} key={component}>
            <h4>{scoreComponentLabel(component)}</h4>
            <DefinitionList values={[
              { label: "Value", value: numberValue(association.value) },
              { label: "Basis", value: displayLabel(text(association.basis)) },
            ]} />
            <p>{text(association.rationale)}</p>
            {citations.length > 0 ? (
              <ul className={styles.evidenceList}>
                {citations.map((citation) => (
                  <li key={`${component}:${text(citation.id)}`}>
                    <a href={text(citation.sourceUrl)} rel="noreferrer" target="_blank">
                      {text(citation.sourceName)}
                    </a>
                    <ul className={styles.valueList}>
                      {stringValues(citation.matchedFieldPaths).map((path) => (
                        <li key={path}><code>{path}</code></li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No matching public evidence association is recorded.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ScoreRationale({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const data = detailSection(detail, "score_rationale");
  return <><DefinitionList values={[
    { label: "Active class", value: displayLabel(text(data.activeClass)) },
    { label: "Score", value: nullableNumber(data.score) ?? "Not scored" },
    { label: "Coverage", value: numberValue(data.coverage) },
    { label: "Policy", value: text(data.policyVersion) },
    { label: "Evidence policy", value: text(data.evidenceVersion) },
  ]} /><h3>Components</h3><SafeRecord value={data.components} /><h3>Evidence associations</h3><ScoreEvidenceAssociations value={data.componentEvidence} /></>;
}

function History({ detail }: { detail: GlobalRadarSignalDetailDto }) {
  const items = collectionItems(detailSection(detail, "signal_history"));
  return items.length > 0 ? <ol className={styles.historyList}>{items.map((item) => <li key={text(item.id)}><strong>{displayLabel(text(item.updateType))}</strong><p>{text(item.reason)}</p><p>{formatRadarDate(item.observedAt)} · {displayLabel(text(item.actorType))}{optionalText(item.actorEmail) ? ` · ${text(item.actorEmail)}` : ""}</p></li>)}</ol> : <p>No signal history recorded.</p>;
}

function AdminNotes({ detail, onDetailChange }: { detail: GlobalRadarSignalDetailDto; onDetailChange(detail: GlobalRadarSignalDetailDto): void }) {
  const data = adminSection(detail);
  const notes = collectionItems(data.notes);
  const watchlist = record(data.watchlist);
  const promotion = record(data.promotion);
  return <><h3>Administrator notes</h3>{notes.length > 0 ? <ol className={styles.noteList}>{notes.map((item) => <li key={text(item.id)}><p>{text(item.body)}</p><p>{formatRadarDate(item.observedAt)}{optionalText(item.actorEmail) ? ` · ${text(item.actorEmail)}` : ""}</p></li>)}</ol> : <p>No administrator notes recorded.</p>}<div className={styles.layerSplit}><div><h3>Watchlist state</h3><p>{Object.keys(watchlist).length ? `${displayLabel(text(watchlist.state))} · revision ${numberValue(watchlist.revision)}` : "Not on the watchlist"}</p></div><div><h3>Promotion state</h3><p>{Object.keys(promotion).length ? `${displayLabel(text(promotion.status))} · ${text(promotion.discoveryCandidateId, "No Discovery candidate ID")}` : "Not promoted"}</p></div></div><GlobalRadarActions detail={detail} onDetailChange={onDetailChange} /></>;
}

function SectionBody({
  id,
  detail,
  onDetailChange,
}: {
  id: GlobalRadarDetailSectionId;
  detail: GlobalRadarSignalDetailDto;
  onDetailChange(detail: GlobalRadarSignalDetailDto): void;
}) {
  switch (id) {
    case "organisation": return <Organisation detail={detail} />;
    case "what_changed": return <WhatChanged detail={detail} />;
    case "signal_class": return <SignalClass detail={detail} />;
    case "publicly_supported_facts": return <PublicFacts detail={detail} />;
    case "mewtuals_interpretation": return <p className={styles.lead}>{text(detailSection(detail, id).summary)}</p>;
    case "required_capabilities": return <RequiredCapabilities detail={detail} />;
    case "physical_data_or_hardware_specifications": return <PhysicalSpecifications detail={detail} />;
    case "target_environments_and_tasks": return <TargetEnvironments detail={detail} />;
    case "indian_execution_archetypes": return <Values values={stringValues(detailSection(detail, id).items)} />;
    case "india_fit_reasoning_and_constraints": return <IndiaFit detail={detail} />;
    case "systems_context_explanation": return <SystemsContext detail={detail} />;
    case "scale_and_timeline": return <ScaleTimeline detail={detail} />;
    case "public_response_path": return <ResponsePath detail={detail} />;
    case "compliance_flags": return <Compliance detail={detail} />;
    case "supporting_evidence": return <SupportingEvidence detail={detail} />;
    case "original_language_source": return <OriginalLanguage detail={detail} />;
    case "english_summary": return <EnglishSummary detail={detail} />;
    case "score_rationale": return <ScoreRationale detail={detail} />;
    case "signal_history": return <History detail={detail} />;
    case "admin_notes_and_actions": return <AdminNotes detail={detail} onDetailChange={onDetailChange} />;
  }
}

const dataLayers: Partial<Record<GlobalRadarDetailSectionId, string>> = {
  publicly_supported_facts: "facts",
  mewtuals_interpretation: "inference",
  english_summary: "translation",
  score_rationale: "score",
};

function GlobalRadarSignalDetailState({
  initialDetail,
  returnTo,
}: {
  initialDetail: GlobalRadarSignalDetailDto;
  returnTo: string;
}) {
  const [detail, setDetail] = useState(initialDetail);
  return (
    <article className={styles.detailDocument}>
      <div className={styles.detailHeader}>
        <BackLink returnTo={returnTo} />
        <p>{displayLabel(detail.signalClass)} · {displayLabel(detail.status)} · revision {detail.revision}</p>
      </div>
      {detail.sections.map((section) => {
        const headingId = `global-radar-section-${section.id}`;
        return (
          <section
            aria-labelledby={headingId}
            className={styles.detailSection}
            data-layer={dataLayers[section.id]}
            key={section.id}
          >
            <h2 id={headingId}>{section.title}</h2>
            <SectionBody detail={detail} id={section.id} onDetailChange={setDetail} />
          </section>
        );
      })}
    </article>
  );
}

export function GlobalRadarSignalDetail({
  initialDetail,
  returnTo,
}: {
  initialDetail: GlobalRadarSignalDetailDto;
  returnTo: string;
}) {
  const stateKey = [
    initialDetail.id,
    initialDetail.revision,
    initialDetail.signalClass,
    initialDetail.status,
    initialDetail.allowedActions.join(","),
  ].join(":");
  return (
    <GlobalRadarSignalDetailState
      initialDetail={initialDetail}
      key={stateKey}
      returnTo={returnTo}
    />
  );
}
