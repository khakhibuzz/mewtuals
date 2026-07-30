"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  isGlobalRadarMutationEntity,
  isGlobalRadarMutationWatchlistEntry,
  isGlobalRadarRecord,
  type GlobalRadarMutationEntity,
  type GlobalRadarMutationWatchlistEntry,
  type GlobalRadarWatchlistItem,
} from "./types";
import styles from "./global-radar.module.css";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function date(value: string | null, empty: string) {
  if (!value) return empty;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function nextObservation(item: GlobalRadarWatchlistItem) {
  if (item.expiry?.expiresAt) return `Expires ${date(item.expiry.expiresAt, "")}`;
  if (item.expiry?.reobserveBy) return `Re-observe ${date(item.expiry.reobserveBy, "")}`;
  return "No signal expiry or re-observation date";
}

function promotionLabel(item: GlobalRadarWatchlistItem) {
  return item.promotion ? label(item.promotion.status) : "Not promoted";
}

type ConfigurationDraft = {
  priority: string;
  theme: string;
  category: string;
  categorySearchTermEn: string;
  categorySearchTermZhCn: string;
  countries: string;
  languages: string[];
  cadenceDays: string;
  nextScanAt: string;
  reason: string;
};

function draftFrom(item: GlobalRadarWatchlistItem): ConfigurationDraft {
  return {
    priority: String(item.priority),
    theme: item.theme,
    category: item.category,
    categorySearchTermEn: item.categorySearchTermEn,
    categorySearchTermZhCn: item.categorySearchTermZhCn ?? "",
    countries: item.countries.join(", "),
    languages: [...item.languages],
    cadenceDays: String(item.cadenceDays),
    nextScanAt: item.nextScanAt ?? "",
    reason: item.reason,
  };
}

function joinedValues(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function updatedItem(
  item: GlobalRadarWatchlistItem,
  entity: GlobalRadarMutationEntity,
  entry: GlobalRadarMutationWatchlistEntry,
): GlobalRadarWatchlistItem {
  return {
    ...item,
    ...entry,
    countries: [...entry.countries],
    languages: [...entry.languages],
    entity: {
      canonicalName: entity.canonicalName,
      headquartersCountry: entity.headquartersCountry,
      entityStatus: entity.entityStatus,
      revision: entity.revision,
    },
  };
}

type MutationBody = Readonly<{
  entity: GlobalRadarMutationEntity;
  entry: GlobalRadarMutationWatchlistEntry;
}>;

function mutationBody(value: unknown): MutationBody | null {
  if (!isGlobalRadarRecord(value) ||
      !isGlobalRadarMutationEntity(value.entity) ||
      !isGlobalRadarMutationWatchlistEntry(value.entry)) return null;
  return { entity: value.entity, entry: value.entry };
}

function WatchlistCard({
  item,
  approvedThemes,
  disabled,
  pending,
  unknown,
  mutate,
}: {
  item: GlobalRadarWatchlistItem;
  approvedThemes: readonly string[];
  disabled: boolean;
  pending: boolean;
  unknown: boolean;
  mutate(item: GlobalRadarWatchlistItem, state: GlobalRadarWatchlistItem["state"], draft: ConfigurationDraft): void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(item));
  const themes = approvedThemes.includes(item.theme)
    ? approvedThemes
    : [item.theme, ...approvedThemes];
  const set = (key: keyof ConfigurationDraft, value: string | string[]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const toggleLanguage = (language: string, selected: boolean) => {
    const languages = selected
      ? [...new Set([...draft.languages, language])]
      : draft.languages.filter((value) => value !== language);
    set("languages", languages);
  };
  return (
    <section aria-label={item.entity.canonicalName} className={styles.watchlistCard}>
      <div>
        <p className={styles.kicker}>{item.entity.headquartersCountry} · {label(item.entity.entityStatus)}</p>
        <h2>{item.entity.canonicalName}</h2>
      </div>
      <dl className={styles.watchlistFacts}>
        <div><dt>Monitoring</dt><dd>{label(item.state)}</dd></div>
        <div><dt>Priority</dt><dd>Priority {item.priority}</dd></div>
        <div><dt>Cadence</dt><dd>Every {item.cadenceDays} days</dd></div>
        <div><dt>Next scan</dt><dd>{date(item.nextScanAt, "Not scheduled")}</dd></div>
        <div><dt>Expiry</dt><dd>{nextObservation(item)}</dd></div>
        <div><dt>Promotion</dt><dd>{promotionLabel(item)}</dd></div>
      </dl>
      <div className={styles.latestSignal}>
        <h3>Latest signal</h3>
        {item.latestSignal ? (
          <>
            <p>{item.latestSignal.title}</p>
            <p>{label(item.latestSignal.signalClass)} · {label(item.latestSignal.status)}</p>
          </>
        ) : <p>No signal attached yet.</p>}
      </div>
      <div className={styles.watchlistEditor}>
        <label><span>Priority</span><input disabled={disabled} max={100} min={0} onChange={(event) => set("priority", event.target.value)} type="number" value={draft.priority} /></label>
        <label><span>Theme</span><select disabled={disabled} onChange={(event) => set("theme", event.target.value)} value={draft.theme}>{themes.map((theme) => <option key={theme} value={theme}>{label(theme)}</option>)}</select></label>
        <label><span>Category</span><input disabled={disabled} maxLength={200} onChange={(event) => set("category", event.target.value)} required value={draft.category} /></label>
        <label><span>English search term</span><input disabled={disabled} maxLength={500} onChange={(event) => set("categorySearchTermEn", event.target.value)} required value={draft.categorySearchTermEn} /></label>
        <label><span>Chinese search term</span><input disabled={disabled} lang="zh-CN" maxLength={500} onChange={(event) => set("categorySearchTermZhCn", event.target.value)} value={draft.categorySearchTermZhCn} /></label>
        <label><span>Countries</span><input disabled={disabled} maxLength={1_000} onChange={(event) => set("countries", event.target.value)} required value={draft.countries} /></label>
        <fieldset disabled={disabled}>
          <legend>Languages</legend>
          {(["en", "zh-CN"] as const).map((language) => (
            <label key={language}>
              <input checked={draft.languages.includes(language)} onChange={(event) => toggleLanguage(language, event.target.checked)} type="checkbox" />
              <span>{language}</span>
            </label>
          ))}
        </fieldset>
        <label><span>Cadence in days</span><input disabled={disabled} max={365} min={1} onChange={(event) => set("cadenceDays", event.target.value)} type="number" value={draft.cadenceDays} /></label>
        <label><span>Next scan (ISO timestamp)</span><input disabled={disabled} maxLength={35} onChange={(event) => set("nextScanAt", event.target.value)} value={draft.nextScanAt} /></label>
        <label className={styles.wideField}><span>Update reason</span><textarea disabled={disabled} maxLength={2_000} onChange={(event) => set("reason", event.target.value)} required value={draft.reason} /></label>
      </div>
      <div className={styles.actions}>
        {unknown ? (
          <>
            <button disabled={pending} onClick={() => mutate(item, item.state, draft)} type="button">Retry exact update for {item.entity.canonicalName}</button>
            <a href="/admin/global-demand-radar/watchlist">Review current watchlist state</a>
          </>
        ) : (
          <>
            <button disabled={disabled} onClick={() => mutate(item, item.state, draft)} type="button">Save settings for {item.entity.canonicalName}</button>
            {item.state !== "enabled" ? <button disabled={disabled} onClick={() => mutate(item, "enabled", draft)} type="button">Enable {item.entity.canonicalName}</button> : null}
            {item.state === "enabled" ? <button disabled={disabled} onClick={() => mutate(item, "paused", draft)} type="button">Pause {item.entity.canonicalName}</button> : null}
            {item.state !== "disabled" ? <button disabled={disabled} onClick={() => mutate(item, "disabled", draft)} type="button">Disable {item.entity.canonicalName}</button> : null}
          </>
        )}
      </div>
    </section>
  );
}

export function GlobalRadarWatchlist({
  initialItems,
  approvedThemes,
}: {
  initialItems: readonly GlobalRadarWatchlistItem[];
  approvedThemes: readonly string[];
}) {
  const router = useRouter();
  const [items, setItems] = useState([...initialItems]);
  const [pendingEntityId, setPendingEntityId] = useState<string | null>(null);
  const [unknownEntityIds, setUnknownEntityIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [notice, setNotice] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const unknownRequests = useRef(
    new Map<string, Readonly<Record<string, unknown>>>(),
  );
  useEffect(() => {
    if (notice?.kind === "alert") noticeRef.current?.focus();
  }, [notice]);

  function markUnknown(entityId: string) {
    setUnknownEntityIds((current) => new Set([...current, entityId]));
  }

  function clearUnknown(entityId: string) {
    setUnknownEntityIds((current) => {
      if (!current.has(entityId)) return current;
      const next = new Set(current);
      next.delete(entityId);
      return next;
    });
  }

  async function mutate(
    item: GlobalRadarWatchlistItem,
    state: GlobalRadarWatchlistItem["state"],
    draft: ConfigurationDraft,
  ) {
    if (pendingEntityId) return;
    const retainedRequest = unknownRequests.current.get(item.globalEntityId);
    let requestBody = retainedRequest;
    if (!requestBody) {
      const priority = Number(draft.priority);
      const cadenceDays = Number(draft.cadenceDays);
      const countries = joinedValues(draft.countries);
      const reason = draft.reason.trim();
      if (!reason || !draft.category.trim() || !draft.categorySearchTermEn.trim() ||
          countries.length === 0 || draft.languages.length === 0 ||
          !Number.isInteger(priority) || priority < 0 || priority > 100 ||
          !Number.isInteger(cadenceDays) || cadenceDays < 1 || cadenceDays > 365) {
        setNotice({ kind: "alert", text: "Review the watchlist configuration before saving." });
        return;
      }
      requestBody = {
        entity: {
          type: "existing",
          entityId: item.globalEntityId,
          expectedRevision: item.entity.revision,
        },
        expectedEntryRevision: item.revision,
        idempotencyKey: globalThis.crypto.randomUUID(),
        reason,
        configuration: {
          state,
          priority,
          theme: draft.theme,
          category: draft.category.trim(),
          categorySearchTermEn: draft.categorySearchTermEn.trim(),
          categorySearchTermZhCn: draft.categorySearchTermZhCn.trim() || null,
          countries,
          languages: draft.languages,
          cadenceDays,
          nextScanAt: draft.nextScanAt.trim() || null,
        },
      };
    }
    unknownRequests.current.set(item.globalEntityId, requestBody);
    setPendingEntityId(item.globalEntityId);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/global-demand-radar/entities/${item.globalEntityId}/watchlist`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
      const value: unknown = await response.json().catch(() => null);
      const latest = mutationBody(value);
      if (!response.ok) {
        if (response.status >= 500) {
          markUnknown(item.globalEntityId);
          setNotice({
            kind: "alert",
            text: "The watchlist update outcome is unknown. Retry the exact same update or refresh before changing it.",
          });
          return;
        }
        unknownRequests.current.delete(item.globalEntityId);
        clearUnknown(item.globalEntityId);
        if (response.status === 409 && latest) {
          setItems((current) => current.map((entry) =>
            entry.globalEntityId === latest.entry.globalEntityId
              ? updatedItem(entry, latest.entity, latest.entry)
              : entry));
        }
        setNotice({
          kind: "alert",
          text: response.status === 409
            ? "The watchlist entry changed. Review the latest safe state and retry."
            : "The watchlist update could not be completed.",
        });
        return;
      }
      if (!isGlobalRadarRecord(value) || value.ok !== true ||
          !["created", "updated", "replayed"].includes(String(value.outcome)) || !latest) {
        markUnknown(item.globalEntityId);
        setNotice({
          kind: "alert",
          text: "The watchlist update outcome is unknown. Retry the exact same update or refresh before changing it.",
        });
        return;
      }
      unknownRequests.current.delete(item.globalEntityId);
      clearUnknown(item.globalEntityId);
      setItems((current) => current.map((entry) =>
        entry.globalEntityId === latest.entry.globalEntityId
          ? updatedItem(entry, latest.entity, latest.entry)
          : entry));
      setNotice({ kind: "status", text: "Watchlist updated." });
      router.refresh();
    } catch {
      markUnknown(item.globalEntityId);
      setNotice({
        kind: "alert",
        text: "The watchlist update outcome is unknown. Retry the exact same update or refresh before changing it.",
      });
    } finally {
      setPendingEntityId(null);
    }
  }

  if (items.length === 0) {
    return <p className={styles.emptyState}>No entities are on the Radar watchlist.</p>;
  }
  return (
    <div className={styles.watchlist}>
      {notice ? <p ref={noticeRef} role={notice.kind} tabIndex={notice.kind === "alert" ? -1 : undefined}>{notice.text}</p> : null}
      {items.map((item) => (
        <WatchlistCard
          approvedThemes={approvedThemes}
          disabled={pendingEntityId !== null || unknownEntityIds.has(item.globalEntityId)}
          item={item}
          key={`${item.id}:${item.revision}:${item.entity.revision}`}
          mutate={(entry, state, draft) => void mutate(entry, state, draft)}
          pending={pendingEntityId !== null}
          unknown={unknownEntityIds.has(item.globalEntityId)}
        />
      ))}
    </div>
  );
}
