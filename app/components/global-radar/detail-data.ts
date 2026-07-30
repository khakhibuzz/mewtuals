import {
  isGlobalRadarRecord,
  type GlobalRadarDetailSectionId,
  type GlobalRadarSignalDetail,
} from "./types";

export function detailSection(
  detail: GlobalRadarSignalDetail,
  id: GlobalRadarDetailSectionId,
) {
  return detail.sections.find((section) => section.id === id)?.data ?? {};
}

export function record(value: unknown): Record<string, unknown> {
  return isGlobalRadarRecord(value) ? value : {};
}

export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isGlobalRadarRecord) : [];
}

export function collectionItems(value: unknown) {
  return records(record(value).items);
}

export function text(value: unknown, fallback = "Not recorded") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function optionalText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function stringValues(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function displayLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b(?:india|rfp)\b/gi, (part) => part.toUpperCase())
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function formatRadarDate(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function primaryOrganisation(detail: GlobalRadarSignalDetail) {
  return record(detailSection(detail, "organisation").primary);
}

export function adminSection(detail: GlobalRadarSignalDetail) {
  return detailSection(detail, "admin_notes_and_actions");
}
