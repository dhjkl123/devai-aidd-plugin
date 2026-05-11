export const DEFAULT_PLUGIN_CONFIG = {
  branch: {
    pattern: "{type}/{ticket}-{slug}",
    defaultType: "chore",
    fallbackTicket: "no-ticket",
    longLivedBranches: ["main", "master"],
    defaultMergeTarget: "",
    validationRegex:
      "^(feat|fix|docs|chore|refactor|design)\\/[A-Z]+-\\d+-[a-z0-9-]+$|^(feat|fix|docs|chore|refactor|design)\\/no-ticket-[a-z0-9-]+$",
    commandTypeMap: {
      "bmad-bmm-check-implementation-readiness": "docs",
      "bmad-bmm-correct-course": "refactor",
      "bmad-bmm-create-architecture": "docs",
      "bmad-bmm-create-epics-and-stories": "docs",
      "bmad-bmm-create-prd": "docs",
      "bmad-bmm-create-product-brief": "docs",
      "bmad-bmm-create-story": "docs",
      "bmad-bmm-create-ux-design": "docs",
      "bmad-bmm-dev-story": "feat",
      "bmad-bmm-document-project": "docs",
      "bmad-bmm-domain-research": "docs",
      "bmad-bmm-edit-prd": "docs",
      "bmad-bmm-generate-project-context": "docs",
      "bmad-bmm-market-research": "docs",
      "bmad-bmm-qa-generate-e2e-tests": "feat",
      "bmad-bmm-quick-dev": "feat",
      "bmad-bmm-quick-dev-new-preview": "feat",
      "bmad-bmm-quick-spec": "docs",
      "bmad-bmm-retrospective": "docs",
      "bmad-bmm-sprint-planning": "docs",
      "bmad-bmm-sprint-status": "chore",
      "bmad-bmm-technical-research": "docs",
      "bmad-bmm-validate-prd": "docs",
      "bmad-bmm-code-review": "fix",
      "bmad-brainstorming": "docs",
      "bmad-editorial-review-prose": "docs",
      "bmad-editorial-review-structure": "docs",
      "bmad-help": "chore",
      "bmad-index-docs": "docs",
      "bmad-party-mode": "chore",
      "bmad-review-adversarial-general": "fix",
      "bmad-review-edge-case-hunter": "fix",
      "bmad-shard-doc": "docs",
    },
  },
  workflowPolicy: {
    "bmad-bmm-create-story": {
      category: "implementation",
      identityStrategy: "story",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    "bmad-bmm-dev-story": {
      category: "implementation",
      identityStrategy: "story",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    "bmad-bmm-quick-dev": {
      category: "implementation",
      identityStrategy: "ticket-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    "bmad-bmm-qa-generate-e2e-tests": {
      category: "implementation",
      identityStrategy: "artifact-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    "bmad-bmm-create-prd": {
      category: "planning",
      identityStrategy: "artifact-singleton",
      artifactKey: "prd",
      branchRequired: false,
      finalization: "commit-optional-push",
    },
    "bmad-bmm-create-architecture": {
      category: "planning",
      identityStrategy: "artifact-singleton",
      artifactKey: "architecture",
      branchRequired: false,
      finalization: "commit-optional-push",
    },
    "bmad-bmm-create-ux-design": {
      category: "planning",
      identityStrategy: "artifact-singleton",
      artifactKey: "ux-design",
      branchRequired: false,
      finalization: "commit-optional-push",
    },
    "bmad-bmm-sprint-planning": {
      category: "planning",
      identityStrategy: "artifact-singleton",
      artifactKey: "sprint-planning",
      branchRequired: false,
      finalization: "commit-optional-push",
    },
    "bmad-bmm-create-epics-and-stories": {
      category: "planning",
      identityStrategy: "artifact-singleton",
      artifactKey: "epics",
      branchRequired: false,
      finalization: "commit-optional-push",
    },
    "bmad-bmm-market-research": {
      category: "research",
      identityStrategy: "artifact-or-args",
      branchRequired: false,
      finalization: "no-forced-finalization",
    },
    "bmad-bmm-domain-research": {
      category: "research",
      identityStrategy: "artifact-or-args",
      branchRequired: false,
      finalization: "no-forced-finalization",
    },
    "bmad-bmm-document-project": {
      category: "docs",
      identityStrategy: "artifact-singleton",
      artifactKey: "document-project",
      branchRequired: false,
      finalization: "no-forced-finalization",
    },
    "bmad-bmm-code-review": {
      category: "review",
      identityStrategy: "ticket-or-args",
      branchRequired: false,
      finalization: "no-forced-finalization",
    },
  },
  audit: {
    enabled: true,
    logToClient: true,
    logToFile: false,
    logFilePath: "",
    httpEndpoint: "",
  },
  debug: {
    // Diagnostic logger gated by `enabled`. When true, the plugin appends a
    // line-per-event log to `logFilePath` (or `.opencode/devai-aidd-debug.log`
    // if blank) covering the init-prompt flow: bootstrap, command.executed,
    // readiness check, init proposal generation, approval prompt delivery to
    // the runtime client. Use this when the model is suspected of ignoring
    // the question-tool instruction so you can pinpoint where the chain
    // actually breaks.
    //
    // The log is intentionally separate from `audit` because audit is a
    // structured stream consumed by ops, while `debug` is a one-shot
    // troubleshooting trace meant to be tail'd by a human and cleared when
    // the bug is reproduced.
    enabled: false,
    logFilePath: "",
  },
};
