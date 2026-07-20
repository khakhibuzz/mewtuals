import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const [readyPath] = process.argv.slice(2);
const grandchild = spawn(
  process.execPath,
  ["-e", "setInterval(() => {}, 1_000)"],
  { stdio: "ignore" },
);

await writeFile(readyPath, JSON.stringify([process.pid, grandchild.pid]));
setInterval(() => {}, 1_000);
