import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const entryFile = path.join(projectRoot, "src", "index.js");
const outputFile = path.join(projectRoot, "dist", "devai-aidd-guard.js");

fs.mkdirSync(path.dirname(outputFile), { recursive: true });

const command = [
  "npx",
  "esbuild",
  `"${entryFile}"`,
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  `--outfile="${outputFile}"`,
].join(" ");

execSync(command, {
  cwd: projectRoot,
  stdio: "inherit",
});

console.log(`Built ${path.relative(projectRoot, outputFile)}`);
