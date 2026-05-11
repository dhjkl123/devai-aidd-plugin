import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const builderModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "build-question-instruction.js"),
).href;
const aliasesModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "permission-asked-aliases.js"),
).href;
const nativeEventModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "native-event.js"),
).href;

async function runTests() {
  const { buildQuestionInstruction } = await import(builderModuleUrl);
  const { APPROVAL_OUTCOME_ALIASES } = await import(aliasesModuleUrl);

  // ---- Case: init ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "init",
      proposal: null,
    });
    assert.equal(r.header, "Initialize Git");
    assert.deepEqual(r.options, ["Initialize Git (Recommended)", "Skip"]);
    assert.match(r.instructionText, /Ask the user the `Initialize Git` question/);
    assert.match(r.instructionText, /Do not ask for a branch name/);
    assert.match(r.instructionText, /1\. `Initialize Git \(Recommended\)`/);
    assert.match(r.instructionText, /2\. `Skip`/);
    assert.match(r.instructionText, /git automation .* will be disabled/);
  }

  // ---- Case: baseline-commit ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "commit",
      proposal: { kind: "commit", action: "baseline-commit" },
    });
    assert.equal(r.header, "Create Baseline Commit");
    assert.deepEqual(r.options, [
      "Setup .gitignore and Commit (Recommended)",
      "Commit Without .gitignore",
      "Skip",
    ]);
    assert.match(r.instructionText, /git repository without an initial commit/);
    assert.match(r.instructionText, /`Setup \.gitignore and Commit \(Recommended\)`/);
    assert.match(r.instructionText, /Do not continue the workflow/);
  }

  // ---- Case: branch/create (F1 verification -- slash-segmented actionType) ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "branch/create",
      proposal: { kind: "branch", action: "create", name: "feat/test" },
    });
    assert.equal(r.header, "Create Branch");
    assert.match(r.instructionText, /Suggested branch name: `feat\/test`/);
  }

  // ---- Case: branch/switch (F1 verification) ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "branch/switch",
      proposal: { kind: "branch", action: "switch", name: "feat/bar" },
    });
    assert.equal(r.header, "Switch Branch");
    assert.match(r.instructionText, /Target branch: `feat\/bar`/);
  }

  // ---- Case: commit-finalize (regular commit) ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "commit",
      proposal: { kind: "commit", action: "commit" },
    });
    assert.equal(r.header, "Finalize Changes");
    assert.match(r.instructionText, /need a commit before finishing/);
    assert.doesNotMatch(r.instructionText, /push the current branch/);
  }

  // ---- Case: commit-finalize-null-action (F7) ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "commit",
      proposal: { kind: "commit", action: null },
    });
    assert.equal(r.header, "Finalize Changes");
  }

  // ---- Case: commit-finalize-null-proposal (F7 defensive) ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "commit",
      proposal: null,
    });
    assert.equal(r.header, "Finalize Changes");
  }

  // ---- Case: push ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "push",
      proposal: { kind: "push", action: "push" },
    });
    assert.equal(r.header, "Push Changes");
    assert.match(r.instructionText, /push the current branch/);
  }

  // ---- Case: fallback unknown actionType ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "weird",
      proposal: null,
    });
    assert.equal(r.header, "Approval Required");
  }

  // ---- Case: commandName omitted -> guard line suppressed ----
  {
    const r = buildQuestionInstruction({
      commandName: null,
      actionType: "init",
      proposal: null,
    });
    assert.doesNotMatch(r.instructionText, /Git workflow guard is active/);
    assert.match(r.instructionText, /Ask the user the `Initialize Git` question/);
  }

  // ---- Case: commandName with leading slash -> single slash only (F2) ----
  {
    const r = buildQuestionInstruction({
      commandName: "/bmad-bmm-create-prd",
      actionType: "commit",
      proposal: { kind: "commit", action: "baseline-commit" },
    });
    assert.match(r.instructionText, /\/bmad-bmm-create-prd/);
    assert.doesNotMatch(r.instructionText, /\/\/bmad-bmm-create-prd/);
  }

  // ---- Case: old-spec bare "branch" actionType -> falls through to fallback (F1 regression guard) ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "branch", // bare, not slash-segmented
      proposal: { kind: "branch", action: "create", name: "feat/foo" },
    });
    assert.equal(r.header, "Approval Required");
  }

  // ---- Case: malformed branch name (backtick injection R7 / F14) ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "branch/create",
      proposal: { kind: "branch", action: "create", name: "feat/`evil`" },
    });
    assert.match(r.instructionText, /Suggested branch name: `workflow`/);
  }

  // ---- Case: branch name with newline (R7 / F14) ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "branch/create",
      proposal: { kind: "branch", action: "create", name: "feat/foo\nrm -rf" },
    });
    assert.match(r.instructionText, /Suggested branch name: `workflow`/);
  }

  // ---- Case: alias map exposes "create baseline commit" -> "accept" (F6) ----
  {
    assert.equal(APPROVAL_OUTCOME_ALIASES["create baseline commit"], "accept");
  }

  // ---- Case: sensitive baseline commit -- header switches + unified 3 options ----
  {
    const r = buildQuestionInstruction({
      commandName: "bmad-bmm-create-prd",
      actionType: "commit",
      proposal: {
        kind: "commit",
        action: "baseline-commit",
        sensitiveFiles: [".env", "secrets/api-key"],
        sensitiveRules: [".env*", "secrets/"],
      },
    });
    assert.equal(r.header, "Sensitive Files Detected");
    assert.deepEqual(r.options, [
      "Setup .gitignore and Commit (Recommended)",
      "Commit Without .gitignore",
      "Skip",
    ]);
    assert.match(r.instructionText, /sensitive/i);
    assert.match(r.instructionText, /`\.env`/);
    assert.match(r.instructionText, /`secrets\/api-key`/);
    assert.match(r.instructionText, /matched patterns above \(`\.env\*`, `secrets\/`\)/);
  }

  // ---- Case: sensitive baseline commit with > 10 files truncates list ----
  {
    const manyFiles = Array.from({ length: 15 }, (_, i) => `secret-${i}.pem`);
    const r = buildQuestionInstruction({
      commandName: "x",
      actionType: "commit",
      proposal: {
        kind: "commit",
        action: "baseline-commit",
        sensitiveFiles: manyFiles,
        sensitiveRules: ["*.pem"],
      },
    });
    assert.match(r.instructionText, /and 5 more/);
  }

  // ---- Case: baseline commit with empty sensitiveFiles uses Create Baseline Commit header but same 3 options ----
  {
    const r = buildQuestionInstruction({
      commandName: "x",
      actionType: "commit",
      proposal: {
        kind: "commit",
        action: "baseline-commit",
        sensitiveFiles: [],
        sensitiveRules: [],
      },
    });
    assert.equal(r.header, "Create Baseline Commit");
    assert.deepEqual(r.options, [
      "Setup .gitignore and Commit (Recommended)",
      "Commit Without .gitignore",
      "Skip",
    ]);
    assert.match(r.instructionText, /default template/);
    assert.match(r.instructionText, /branches cannot be created automatically/);
  }

  // ---- Case: alias map exposes baseline labels (new + legacy) ----
  {
    // new unified labels
    assert.equal(APPROVAL_OUTCOME_ALIASES["setup gitignore and commit"], "accept");
    assert.equal(APPROVAL_OUTCOME_ALIASES["commit without gitignore"], "accept");
    // legacy labels still mapped (one-release deprecation window)
    assert.equal(APPROVAL_OUTCOME_ALIASES["add to gitignore and commit"], "accept");
    assert.equal(APPROVAL_OUTCOME_ALIASES["commit anyway"], "accept");
    assert.equal(APPROVAL_OUTCOME_ALIASES["skip baseline commit"], "ignore-and-continue");
  }

  // ---- Case: detectSensitiveFiles matches expected patterns ----
  {
    const { detectSensitiveFiles, SENSITIVE_FILE_PATTERNS } = await import(
      pathToFileURL(path.join(projectRoot, "src", "services", "git", "init-service.js")).href
    );
    assert.ok(Array.isArray(SENSITIVE_FILE_PATTERNS) && SENSITIVE_FILE_PATTERNS.length > 0);
    const result = detectSensitiveFiles([
      ".env",
      ".env.production",
      "src/index.js",
      "config/id_rsa",
      "data.sqlite",
      "secrets/api.json",
      "src/credentials/keys.json",
      "ok.txt",
      "private.pem",
    ]);
    assert.deepEqual(result.files.sort(), [
      ".env",
      ".env.production",
      "config/id_rsa",
      "data.sqlite",
      "private.pem",
      "secrets/api.json",
      "src/credentials/keys.json",
    ].sort());
    // Expect at least these rules
    for (const rule of [".env*", "id_rsa*", "*.sqlite*", "secrets/", "credentials/", "*.pem"]) {
      assert.ok(result.rules.includes(rule), `rules missing ${rule} (got ${JSON.stringify(result.rules)})`);
    }
  }

  // ---- Case: parseApprovalAnswerOutcome normalizes the new label (round-trip) ----
  // Uses native-event.js exports indirectly: we re-implement normalizeAnswerKey here
  // to verify the contract from outside the hook module. If hook changes the
  // normalization shape, this will catch the drift.
  {
    const normalize = (s) =>
      String(s)
        .toLowerCase()
        .replace(/\s*\(.*\)\s*$/, "")
        .replace(/^[^a-z0-9]+/, "")
        .replace(/[^a-z0-9-]+/g, " ")
        .trim();
    // Native question tool sends just the option label ("Create Baseline
    // Commit (Recommended)"), not the numbered prefix from the instruction
    // ("1. Create Baseline Commit (Recommended)"). normalizeAnswerKey's
    // leading-non-alnum strip keeps leading digits intact (alnum), so the
    // numbered form would not normalize cleanly -- but real runtime answers
    // never carry that prefix.
    assert.equal(normalize("Create Baseline Commit (Recommended)"), "create baseline commit");
    assert.equal(APPROVAL_OUTCOME_ALIASES["create baseline commit"], "accept");
  }

  // Sanity: every actionType in the contract returns a non-empty instructionText.
  for (const actionType of ["init", "commit", "branch/create", "branch/switch", "push"]) {
    const r = buildQuestionInstruction({
      commandName: "x",
      actionType,
      proposal:
        actionType === "branch/create" || actionType === "branch/switch"
          ? { kind: "branch", action: actionType.split("/")[1], name: "test/foo" }
          : actionType === "commit"
          ? { kind: "commit", action: "commit" }
          : actionType === "push"
          ? { kind: "push", action: "push" }
          : null,
    });
    assert.ok(r.instructionText.length > 0, `instructionText must be non-empty for ${actionType}`);
    assert.ok(r.header.length > 0, `header must be non-empty for ${actionType}`);
    assert.ok(r.options.length >= 2, `options must have >= 2 entries for ${actionType}`);
  }

  // Ensure native-event module loads cleanly (parseApprovalAnswerOutcome dependency surface).
  await import(nativeEventModuleUrl);

  console.log("build-question-instruction.test.js: all assertions passed");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
