import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const entryFile = path.join(projectRoot, "src", "index.js");
const outputFile = path.join(projectRoot, "dist", "devai-aidd-plugin.js");

// Regenerate the embedded baseline template before bundling so the dist
// reflects the latest templates/devai-aidd-plugin.global.jsonc contents.
execSync("node scripts/generate-baseline.js", {
  cwd: projectRoot,
  stdio: "inherit",
});

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
