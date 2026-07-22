import { fileURLToPath } from "node:url";

import { prepareSitesDeployment } from "./sites-deployment.mjs";

const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
};

function removeSignalListener(signals, name, handler) {
  if (typeof signals.off === "function") signals.off(name, handler);
  else signals.removeListener(name, handler);
}

function diagnosticExcerpt(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" — ")
    .slice(0, 500);
}

export async function runCli({
  prepare = prepareSitesDeployment,
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  signals = process,
} = {}) {
  if (argv.length > 1) {
    stderr.write("Usage: npm run prepare:sites -- [commit-ish]\n");
    return 2;
  }

  const commitish = argv.length === 0 ? "HEAD" : argv[0];
  const controller = new AbortController();
  let signalExitCode = null;
  const handlers = Object.fromEntries(
    Object.entries(SIGNAL_EXIT_CODES).map(([name, exitCode]) => [
      name,
      () => {
        if (signalExitCode === null) signalExitCode = exitCode;
        controller.abort();
      },
    ]),
  );
  for (const [name, handler] of Object.entries(handlers)) {
    signals.once(name, handler);
  }

  try {
    const result = await prepare({ commitish, signal: controller.signal });
    if (signalExitCode !== null) return signalExitCode;
    stdout.write(
      `Prepared Sites deployment for ${result.sha}\nSubject: ${result.subject}\nRequest: ${result.requestPath}\n`,
    );
    return 0;
  } catch (error) {
    if (signalExitCode !== null) return signalExitCode;
    stderr.write(`Sites preparation failed: ${diagnosticExcerpt(error)}\n`);
    return 1;
  } finally {
    for (const [name, handler] of Object.entries(handlers)) {
      removeSignalListener(signals, name, handler);
    }
  }
}

const isDirectEntry =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectEntry) {
  process.exitCode = await runCli();
}
