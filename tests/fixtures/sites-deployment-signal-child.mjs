import { writeFile } from "node:fs/promises";

import { runCli } from "../../scripts/prepare-sites-deployment.mjs";

const [readyPath, cleanupPath] = process.argv.slice(2);

const prepare = async ({ signal }) => {
  await new Promise((resolve, reject) => {
    const keepAlive = setInterval(() => {}, 1_000);
    signal.addEventListener(
      "abort",
      async () => {
        clearInterval(keepAlive);
        try {
          await writeFile(cleanupPath, "cleanup complete\n");
          reject(new DOMException("The operation was aborted", "AbortError"));
        } catch (error) {
          reject(error);
        }
      },
      { once: true },
    );
    writeFile(readyPath, "ready\n").catch((error) => {
      clearInterval(keepAlive);
      reject(error);
    });
  });
};

process.exitCode = await runCli({ prepare, argv: [], signals: process });
