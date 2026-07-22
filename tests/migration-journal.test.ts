import { describe, expect, it } from "vitest";

import { validateMigrationJournal } from "../scripts/migration-journal.mjs";

type MigrationEntry = {
  idx: number;
  version: string;
  when: unknown;
  tag: string;
  breakpoints: boolean;
};

type ValidateMigrationJournal = (journal: {
  entries: MigrationEntry[];
}) => MigrationEntry[];

function validator(): ValidateMigrationJournal {
  expect(validateMigrationJournal).toBeTypeOf("function");
  return validateMigrationJournal as ValidateMigrationJournal;
}

const entry = (idx: number, when: unknown): MigrationEntry => ({
  idx,
  version: "7",
  when,
  tag: `${String(idx).padStart(4, "0")}_migration_${idx}`,
  breakpoints: true,
});

describe("migration journal validation", () => {
  it("returns ordered entries for a contiguous journal", () => {
    const entries = [entry(0, 100), entry(1, 200)];

    expect(validator()({ entries })).toBe(entries);
  });

  it.each(["200", Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-finite numeric migration timestamps (%s)",
    (when) => {
      expect(() => validator()({ entries: [entry(0, when)] })).toThrow(
        "finite numeric timestamp",
      );
    },
  );

  it("rejects duplicate migration timestamps", () => {
    expect(() =>
      validator()({ entries: [entry(0, 100), entry(1, 100)] }),
    ).toThrow("strictly increasing");
  });

  it("rejects decreasing migration timestamps", () => {
    expect(() =>
      validator()({ entries: [entry(0, 200), entry(1, 100)] }),
    ).toThrow("strictly increasing");
  });
});
