export type GlobalRadarWorkerNetworkCommand =
  | "claim"
  | "submit"
  | "fail"
  | "abandon";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SUBMIT_REQUEST_TIMEOUT_MS = 120_000;

export function globalRadarRequestTimeoutMs(
  command: GlobalRadarWorkerNetworkCommand,
): number {
  return command === "submit"
    ? SUBMIT_REQUEST_TIMEOUT_MS
    : DEFAULT_REQUEST_TIMEOUT_MS;
}
