import type { EcosystemFilters } from "../../app/domain/ecosystem-intelligence";
import type { MewtualsDatabase } from "../client";
import { loadEcosystemChange } from "./ecosystem-intelligence-change-queries";
import { loadCandidateDetail } from "./ecosystem-intelligence-detail-queries";
import { loadEcosystemDirectory } from "./ecosystem-intelligence-ledger-queries";
import { loadRelationships } from "./ecosystem-intelligence-relationship-queries";
import type { EcosystemSnapshot } from "./ecosystem-intelligence-types";

type ReadTransaction = Parameters<MewtualsDatabase["transaction"]>[0] extends
  (transaction: infer Transaction) => unknown ? Transaction : never;

export async function loadEcosystemActivity(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<Pick<
  EcosystemSnapshot,
  "velocity" | "momentum" | "relationships" | "ledger" | "filterOptions"
>> {
  const change = await loadEcosystemChange(transaction, filters, now, denominator);
  const directory = await loadEcosystemDirectory(transaction, filters, now, denominator);
  return {
    ...change,
    relationships: await loadRelationships(transaction, filters, now, denominator),
    ...directory,
  };
}

export { loadCandidateDetail };
