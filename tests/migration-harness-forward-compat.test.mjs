import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import test from "node:test";

import { loadLocalEnvironment } from "../scripts/load-local-env.mjs";

loadLocalEnvironment();

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function countOccurrences(value, expected) {
  return value.split(expected).length - 1;
}

test(
  "a later journal entry preserves the populated 0007 through Ecosystem 0008 to Radar 0009 path",
  { timeout: 120_000 },
  async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), "mewtuals-migration-forward-compat-"),
    );

    try {
      await mkdir(join(temporaryRoot, "scripts"));
      await cp(
        join(projectRoot, "scripts", "test-migrations.mjs"),
        join(temporaryRoot, "scripts", "test-migrations.mjs"),
      );
      for (const helper of ["migration-journal.mjs", "local-development.mjs", "load-local-env.mjs"]) {
        await cp(
          join(projectRoot, "scripts", helper),
          join(temporaryRoot, "scripts", helper),
        );
      }
      await cp(join(projectRoot, "drizzle"), join(temporaryRoot, "drizzle"), {
        recursive: true,
      });
      await symlink(
        join(projectRoot, "node_modules"),
        join(temporaryRoot, "node_modules"),
        "dir",
      );

      const journalPath = join(temporaryRoot, "drizzle", "meta", "_journal.json");
      const journal = JSON.parse(await readFile(journalPath, "utf8"));
      const latestEntry = journal.entries.at(-1);
      assert(latestEntry, "Expected at least one migration journal entry.");
      const nextIndex = latestEntry.idx + 1;
      const probeTag = `${String(nextIndex).padStart(4, "0")}_forward_compatibility_probe`;
      journal.entries.push({
        idx: nextIndex,
        version: "7",
        when: latestEntry.when + 1,
        tag: probeTag,
        breakpoints: true,
      });
      await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
      await writeFile(
        join(temporaryRoot, "drizzle", `${probeTag}.sql`),
        "select 1;\n",
      );

      const { stdout } = await execFileAsync(
        process.execPath,
        [join(temporaryRoot, "scripts", "test-migrations.mjs")],
        {
          cwd: temporaryRoot,
          env: process.env,
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      assert.equal(
        countOccurrences(
          stdout,
          "Fresh ordered migration path passed.",
        ),
        1,
      );
      assert.equal(
        countOccurrences(
          stdout,
          "Populated 0007 through Ecosystem 0008 to Radar 0009 passed with unchanged product, Opportunity Brief, Discovery V2, and Ecosystem fixtures.",
        ),
        1,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  },
);
