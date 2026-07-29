import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  appendFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_ECOSYSTEM_IMPORT_BYTES,
  readPrivateEcosystemDocument,
  safeImportErrorCode,
} from "../scripts/ecosystem-intelligence-import";
import {
  deriveRelationshipEvidenceKey,
  deriveSignalEvidenceKey,
  ecosystemImportDocumentSchema,
  parseEcosystemImportDocument,
} from "../app/domain/ecosystem-intelligence-import";

const script = resolve("scripts/ecosystem-intelligence-import.ts");
const tsx = resolve("node_modules/.bin/tsx");
const temporaryDirectories: string[] = [];

function validDocument() {
  return {
    schemaVersion: "ecosystem-intelligence-import-v1" as const,
    generatedAt: "2026-07-29T08:30:00.000Z",
    candidates: [
      {
        candidateId: "00000000-0000-4000-8000-000000000101",
        classifications: [
          {
            kind: "ecosystem_domain",
            termKey: "physical_ai",
            evidenceState: "evidence_backed",
            confidence: 90,
            basis: "The public product page describes embodied AI systems.",
            sourceUrls: ["https://Evidence.Example.com/company?utm_source=test"],
          },
        ],
        headquarters: {
          countryCode: "IN" as const,
          stateKey: "Karnataka",
          stateLabel: "Karnataka",
          cityKey: "Bangalore",
          cityLabel: "Bengaluru",
          latitude: 12.9716,
          longitude: 77.5946,
          evidenceState: "evidence_backed",
          confidence: 85,
          sourceUrls: ["https://evidence.example.com/contact"],
        },
        signals: [
          {
            signalType: "product_launch",
            title: "Public launch",
            occurredAt: "2026-07-20T10:00:00.000Z",
            expiresAt: "2026-12-20T10:00:00.000Z",
            sourceUrl: "https://evidence.example.com/launch?utm_campaign=private",
            confidence: 80,
          },
        ],
        relationships: [
          {
            targetPublicName: "  Public Research Lab  ",
            relationshipType: "researches_with",
            evidenceUrl: "https://evidence.example.com/research#details",
            confidence: 75,
            observedAt: "2026-07-21T00:00:00.000Z",
          },
        ],
      },
    ],
  };
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "mewtuals-ecosystem-import-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writePrivateDocument(document: unknown): string {
  const file = join(temporaryDirectory(), "evidence.json");
  writeFileSync(file, JSON.stringify(document), { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function runCli(arguments_: readonly string[]) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn(tsx, [script, ...arguments_], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: "postgresql://secret@example.test/private" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolveResult({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ecosystem intelligence import contract", () => {
  it("normalizes registered keys, locations, public URLs, and unresolved names", () => {
    const parsed = parseEcosystemImportDocument(validDocument());

    expect(parsed.candidates[0]).toMatchObject({
      candidateId: "00000000-0000-4000-8000-000000000101",
      classifications: [
        {
          kind: "ecosystem_domain",
          termKey: "physical_ai",
          sourceUrls: ["https://evidence.example.com/company"],
        },
      ],
      headquarters: {
        stateKey: "karnataka",
        cityKey: "bengaluru",
      },
      signals: [{ sourceUrl: "https://evidence.example.com/launch" }],
      relationships: [{ targetPublicName: "Public Research Lab" }],
    });
  });

  it("requires exactly one source and relationship target identity route", () => {
    const bothSourceRoutes = validDocument();
    Object.assign(bothSourceRoutes.candidates[0], {
      canonicalUrl: "https://candidate.example.com",
    });
    expect(() => parseEcosystemImportDocument(bothSourceRoutes)).toThrow();

    const noSourceRoute = validDocument();
    delete (noSourceRoute.candidates[0] as { candidateId?: string }).candidateId;
    expect(() => parseEcosystemImportDocument(noSourceRoute)).toThrow();

    const bothTargetRoutes = validDocument();
    Object.assign(bothTargetRoutes.candidates[0].relationships[0], {
      targetCandidateId: "00000000-0000-4000-8000-000000000102",
    });
    expect(() => parseEcosystemImportDocument(bothTargetRoutes)).toThrow();
  });

  it("rejects unknown taxonomy keys and accepts explicit inferred evidence", () => {
    const unknownKey = validDocument();
    unknownKey.candidates[0].classifications[0].termKey = "unregistered";
    expect(() => parseEcosystemImportDocument(unknownKey)).toThrow();

    const inferredWithSources = validDocument();
    inferredWithSources.candidates[0].classifications[0].evidenceState = "inferred";
    expect(parseEcosystemImportDocument(inferredWithSources).candidates[0]
      .classifications[0].evidenceState).toBe("inferred");

    const evidenceWithoutSources = validDocument();
    evidenceWithoutSources.candidates[0].classifications[0].sourceUrls = [];
    expect(() => parseEcosystemImportDocument(evidenceWithoutSources)).toThrow();
  });

  it("rejects non-public URLs, non-integer confidence, invalid dates, and excessive arrays", () => {
    const privateUrl = validDocument();
    privateUrl.candidates[0].signals[0].sourceUrl = "http://127.0.0.1/private";
    expect(() => parseEcosystemImportDocument(privateUrl)).toThrow();

    const fractionalConfidence = validDocument();
    fractionalConfidence.candidates[0].signals[0].confidence = 80.5;
    expect(() => parseEcosystemImportDocument(fractionalConfidence)).toThrow();

    const invalidDate = validDocument();
    invalidDate.candidates[0].signals[0].occurredAt = "2026-02-30T00:00:00Z";
    expect(() => parseEcosystemImportDocument(invalidDate)).toThrow();

    const tooManySignals = validDocument();
    tooManySignals.candidates[0].signals = Array.from(
      { length: 51 },
      () => ({ ...validDocument().candidates[0].signals[0] }),
    );
    expect(() => parseEcosystemImportDocument(tooManySignals)).toThrow();
  });

  it.each([
    {
      path: "candidates.0.canonicalUrl",
      mutate(document: ReturnType<typeof validDocument>, url: string) {
        delete (document.candidates[0] as { candidateId?: string }).candidateId;
        (document.candidates[0] as { canonicalUrl?: string }).canonicalUrl = url;
      },
    },
    {
      path: "candidates.0.classifications.0.sourceUrls.0",
      mutate(document: ReturnType<typeof validDocument>, url: string) {
        document.candidates[0].classifications[0].sourceUrls = [url];
      },
    },
    {
      path: "candidates.0.headquarters.sourceUrls.0",
      mutate(document: ReturnType<typeof validDocument>, url: string) {
        document.candidates[0].headquarters.sourceUrls = [url];
      },
    },
    {
      path: "candidates.0.signals.0.sourceUrl",
      mutate(document: ReturnType<typeof validDocument>, url: string) {
        document.candidates[0].signals[0].sourceUrl = url;
      },
    },
    {
      path: "candidates.0.relationships.0.targetCanonicalUrl",
      mutate(document: ReturnType<typeof validDocument>, url: string) {
        const relationship = document.candidates[0].relationships[0] as {
          targetPublicName?: string;
          targetCanonicalUrl?: string;
        };
        delete relationship.targetPublicName;
        relationship.targetCanonicalUrl = url;
      },
    },
    {
      path: "candidates.0.relationships.0.evidenceUrl",
      mutate(document: ReturnType<typeof validDocument>, url: string) {
        document.candidates[0].relationships[0].evidenceUrl = url;
      },
    },
  ])("bounds $path at 2048 characters before normalization", ({ path, mutate }) => {
    const document = validDocument();
    mutate(document, `https://evidence.example.com/${"s".repeat(2_049)}`);

    const result = ecosystemImportDocumentSchema.safeParse(document);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected URL validation to fail.");
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: path.split(".").map((part) => /^\d+$/.test(part) ? Number(part) : part),
      message: "url_too_long",
    }));
  });

  it("rejects duplicate facts in one candidate entry", () => {
    const duplicateClassification = validDocument();
    duplicateClassification.candidates[0].classifications.push({
      ...duplicateClassification.candidates[0].classifications[0],
    });
    expect(() => parseEcosystemImportDocument(duplicateClassification)).toThrow();

    const duplicateSignal = validDocument();
    duplicateSignal.candidates[0].signals.push({
      ...duplicateSignal.candidates[0].signals[0],
    });
    expect(() => parseEcosystemImportDocument(duplicateSignal)).toThrow();
  });

  it("derives stable SHA-256 evidence keys from normalized documented tuples", () => {
    const signalTuple = {
      candidateId: "00000000-0000-4000-8000-000000000101",
      signalType: "product_launch",
      occurredAt: "2026-07-20T10:00:00.000Z",
      sourceUrl: "https://evidence.example.com/launch",
    };
    expect(deriveSignalEvidenceKey(signalTuple)).toBe(
      createHash("sha256")
        .update("00000000-0000-4000-8000-000000000101\nproduct_launch\n2026-07-20\nhttps://evidence.example.com/launch")
        .digest("hex"),
    );

    expect(deriveRelationshipEvidenceKey({
      sourceCandidateId: signalTuple.candidateId,
      relationshipType: "researches_with",
      targetPublicName: "Public Research Lab",
      evidenceUrl: "https://evidence.example.com/research",
      observedAt: "2026-07-21T00:00:00.000Z",
    })).toBe(
      createHash("sha256")
        .update("00000000-0000-4000-8000-000000000101\nresearches_with\npublic research lab\nhttps://evidence.example.com/research\n2026-07-21")
        .digest("hex"),
    );
  });
});

describe("ecosystem intelligence validate CLI", () => {
  it("registers exact validate/import scripts and DB test routing", async () => {
    const packageJson = JSON.parse(
      await import("node:fs/promises").then(({ readFile }) =>
        readFile(resolve("package.json"), "utf8"),
      ),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["ecosystem:validate"]).toBe(
      "tsx scripts/ecosystem-intelligence-import.ts validate",
    );
    expect(packageJson.scripts["ecosystem:import"]).toBe(
      "tsx scripts/ecosystem-intelligence-import.ts import",
    );
    expect(packageJson.scripts["test:unit"]).toContain(
      "--exclude tests/ecosystem-intelligence-import.integration.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "tests/ecosystem-intelligence-import.integration.test.ts",
    );
    expect(packageJson.scripts["test:acceptance"]).toContain(
      "tests/ecosystem-intelligence-import.integration.test.ts",
    );
  });

  it("returns only a bounded terminal summary and performs no database work", async () => {
    const file = writePrivateDocument(validDocument());
    const result = await runCli(["validate", "--file", file]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: "ecosystem-intelligence-import-v1",
      fileHash: createHash("sha256")
        .update(JSON.stringify(validDocument()))
        .digest("hex"),
      candidateCount: 1,
      factCounts: {
        classifications: 1,
        headquarters: 1,
        signals: 1,
        relationships: 1,
      },
      duplicateCounts: {
        classifications: 0,
        headquarters: 0,
        signals: 0,
        relationships: 0,
      },
      unresolvedCount: 1,
      status: "validated",
    });
    expect(result.stdout).not.toContain("Public Research Lab");
    expect(result.stdout).not.toContain("postgresql://");
  });

  it("counts unresolved relationship facts in a mixed validate document", async () => {
    const document = validDocument();
    (document.candidates[0].relationships as unknown[]).push({
      targetCandidateId: "00000000-0000-4000-8000-000000000102",
      relationshipType: "supplies_to",
      evidenceUrl: "https://evidence.example.com/supply",
      confidence: 81,
      observedAt: "2026-07-22T00:00:00.000Z",
    });

    const result = await runCli([
      "validate",
      "--file",
      writePrivateDocument(document),
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      factCounts: { relationships: 2 },
      unresolvedCount: 1,
      status: "validated",
    });
  });

  it("rejects non-private, symlink, and non-regular files", async () => {
    const publicFile = writePrivateDocument(validDocument());
    chmodSync(publicFile, 0o640);
    const publicResult = await runCli(["validate", "--file", publicFile]);
    expect(publicResult.exitCode).toBe(1);
    expect(JSON.parse(publicResult.stderr)).toMatchObject({
      status: "validation_failed",
      issues: [{ code: "unsafe_file_mode", path: "file" }],
    });

    const privateFile = writePrivateDocument(validDocument());
    const link = join(temporaryDirectory(), "evidence-link.json");
    symlinkSync(privateFile, link);
    const linkResult = await runCli(["validate", "--file", link]);
    expect(linkResult.exitCode).toBe(1);
    expect(JSON.parse(linkResult.stderr)).toMatchObject({
      issues: [{ code: "file_not_regular", path: "file" }],
    });

    const directoryResult = await runCli([
      "validate",
      "--file",
      temporaryDirectory(),
    ]);
    expect(directoryResult.exitCode).toBe(1);
    expect(JSON.parse(directoryResult.stderr)).toMatchObject({
      issues: [{ code: "file_not_regular", path: "file" }],
    });
  });

  it("rejects unsupported non-POSIX security semantics explicitly", async () => {
    const file = writePrivateDocument(validDocument());

    await expect(readPrivateEcosystemDocument(file, {
      platform: "win32",
    })).rejects.toMatchObject({
      issues: [{ path: "file", code: "unsupported_platform" }],
    });
  });

  it("rejects inode growth and caps allocation and read requests at MAX plus one", async () => {
    const file = writePrivateDocument(validDocument());
    const allocations: number[] = [];
    const requests: number[] = [];
    let mutated = false;

    await expect(readPrivateEcosystemDocument(file, {
      afterChunk: async () => {
        if (mutated) return;
        mutated = true;
        appendFileSync(file, Buffer.alloc(MAX_ECOSYSTEM_IMPORT_BYTES + 128, 0x20));
      },
      onAllocate: (bytes) => allocations.push(bytes),
      onReadRequest: (bytes) => requests.push(bytes),
    })).rejects.toMatchObject({
      issues: [{ path: "file", code: "file_too_large" }],
    });
    expect(allocations).toEqual([MAX_ECOSYSTEM_IMPORT_BYTES + 1]);
    expect(Math.max(...requests)).toBeLessThanOrEqual(64 * 1_024);
    expect(requests.reduce((total, bytes) => total + bytes, 0))
      .toBeLessThanOrEqual(MAX_ECOSYSTEM_IMPORT_BYTES + 1);
  });

  it("rejects same-inode truncation after reading starts", async () => {
    const file = writePrivateDocument(validDocument());
    appendFileSync(file, " ".repeat(96 * 1_024));
    let mutated = false;

    await expect(readPrivateEcosystemDocument(file, {
      afterChunk: async () => {
        if (mutated) return;
        mutated = true;
        truncateSync(file, 16);
      },
    })).rejects.toMatchObject({
      issues: [{ path: "file", code: "file_changed" }],
    });
  });

  it("reports bounded paths and codes without rejected values or file contents", async () => {
    const document = validDocument();
    document.candidates[0].signals[0].sourceUrl =
      "http://127.0.0.1/PRIVATE_SOURCE_CONTENT";
    const result = await runCli([
      "validate",
      "--file",
      writePrivateDocument(document),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      schemaVersion: "ecosystem-intelligence-import-v1",
      status: "validation_failed",
      issues: [{ path: "candidates.0.signals.0.sourceUrl", code: "invalid_url" }],
    });
    expect(result.stderr).not.toContain("127.0.0.1");
    expect(result.stderr).not.toContain("PRIVATE_SOURCE_CONTENT");
    expect(result.stderr).not.toContain("postgresql://");
  });

  it("rejects an overlong secret-bearing URL without echoing it", async () => {
    const document = validDocument();
    const secret = "PRIVATE_URL_TOKEN_DO_NOT_PRINT";
    document.candidates[0].signals[0].sourceUrl =
      `https://evidence.example.com/${secret}${"x".repeat(2_100)}`;

    const result = await runCli([
      "validate",
      "--file",
      writePrivateDocument(document),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      status: "validation_failed",
      issues: [{
        path: "candidates.0.signals.0.sourceUrl",
        code: "url_too_long",
      }],
    });
    expect(result.stderr).not.toContain(secret);
    expect(result.stderr.length).toBeLessThan(1_000);
  });

  it("allowlists import error codes and redacts synthetic secret-bearing codes", () => {
    const secret = "PRIVATE_DATABASE_HOST_AND_TOKEN";

    expect(safeImportErrorCode({ code: "identity_ambiguous" })).toBe(
      "identity_ambiguous",
    );
    expect(safeImportErrorCode({ code: "40001" })).toBe("40001");
    expect(safeImportErrorCode({ code: secret })).toBe("import_failed");
    expect(JSON.stringify({ code: safeImportErrorCode({ code: secret }) }))
      .not.toContain(secret);
  });
});
