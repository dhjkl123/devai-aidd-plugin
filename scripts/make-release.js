import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
const version = packageJson.version;
const releaseRoot = path.join(projectRoot, "release", "devai-aidd-guard");
const versionRoot = path.join(releaseRoot, "versions", version);
const latestRoot = path.join(releaseRoot, "latest");

const filesToPublish = [
  { source: path.join(projectRoot, "dist", "devai-aidd-guard.js"), name: "devai-aidd-guard.js" },
  { source: path.join(projectRoot, "installer", "install.ps1"), name: "install.ps1" },
  { source: path.join(projectRoot, "installer", "install.sh"), name: "install.sh" },
  { source: path.join(projectRoot, "installer", "uninstall.ps1"), name: "uninstall.ps1" },
  { source: path.join(projectRoot, "templates", "devai-aidd-guard.global.jsonc"), name: "devai-aidd-guard.global.jsonc" },
  { source: path.join(projectRoot, "templates", "devai-aidd-guard.project.jsonc"), name: "devai-aidd-guard.project.jsonc" },
  { source: path.join(projectRoot, "templates", "opencode.jsonc.example"), name: "opencode.jsonc.example" },
];

function copyPublishFiles(targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const file of filesToPublish) {
    fs.copyFileSync(file.source, path.join(targetRoot, file.name));
  }
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function writeMetadata(targetRoot) {
  const entries = filesToPublish.map((file) => {
    const publishedPath = path.join(targetRoot, file.name);
    return {
      name: file.name,
      size: fs.statSync(publishedPath).size,
      sha256: sha256(publishedPath),
    };
  });

  const manifest = {
    name: "devai-aidd-guard",
    displayName: "DevAI AIDD Plugin",
    version,
    generatedAt: new Date().toISOString(),
    files: entries,
  };

  const checksumText = entries.map((entry) => `${entry.sha256}  ${entry.name}`).join("\n");
  fs.writeFileSync(
    path.join(targetRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(path.join(targetRoot, "checksums.txt"), `${checksumText}\n`, "utf8");
}

for (const targetRoot of [versionRoot, latestRoot]) {
  copyPublishFiles(targetRoot);
  writeMetadata(targetRoot);
}

console.log(`Release created for version ${version}`);
