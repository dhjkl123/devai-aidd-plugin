---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\package.json
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\adapters\console.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\adapters\fs.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\adapters\http.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\audit\logger.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\defaults.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\load-config.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\session.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-after.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-before.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\build.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\make-release.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js
---

# opencode-aidd-plugin - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for opencode-aidd-plugin, decomposing the requirements from the PRD, source-aware technical constraints from Architecture, and the current implementation baseline into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The system must detect which BMAD workflow command has started.

FR2: The system must resolve and apply a Git policy that matches the detected workflow context.

FR3: The system must select or propose a branch strategy appropriate to the active workflow context.

FR4: The system must distinguish workflow start, in-progress, and finish phases so different Git actions can be applied at each phase.

FR5: The system must create or switch to a branch that matches configured rules when a workflow starts.

FR6: The system must generate or propose candidate branch names from configured naming rules.

FR7: The system must prepare or create a commit from workflow output artifacts when a workflow ends.

FR8: The system must propose pushing after commit when a remote repository is configured.

FR9: The system must propose repository initialization when the working directory is not yet a local Git repository.

FR10: The system must request user approval before any Git action is executed.

FR11: The system must explain the intent and expected effect of each proposed Git action before approval.

FR12: The system must allow the user to accept, deny, or ignore-and-continue for each proposed Git action.

FR13: The system must allow the workflow to continue even when a Git action is denied or ignored.

FR14: Administrators must be able to define or change branch naming rules through JSON-based configuration.

FR15: Administrators must be able to define or change workflow-specific Git policies through JSON-based configuration.

FR16: The system must load both project-level and global configuration and apply a deterministic precedence order.

FR17: The system must read legacy configuration formats and preserve compatibility behavior.

FR18: Administrators must be able to tune automation behavior to match team-specific Git policies.

FR19: The system must clearly notify users about branch conflicts, commit failures, push failures, and repository state mismatches.

FR20: The system must explain the cause of an exception and present available recovery options.

FR21: The system must provide recovery paths such as retry, skip, or continue after manual resolution.

FR22: The system must prevent Git automation failure from immediately becoming a full BMAD workflow failure.

FR23: The system must record code, technical documents, and planning artifacts in Git history.

FR24: Reviewers must be able to trace artifact authorship and change history through Git records.

FR25: Reviewers must be able to use standard Git tooling to inspect responsibility for changes in a specific artifact.

FR26: The system must expose user approval outcomes and executed Git action results in a traceable form.

FR27: The plugin must run as an integration with the opencode/DevAI runtime plugin and hook system.

FR28: The plugin must apply Git policy using session events and tool execution before/after hook flows.

FR29: The plugin must preserve compatibility with existing core BMAD workflow commands without requiring user-side command changes.

FR30: The plugin must provide its officially supported behavior in the Node.js-based opencode/DevAI runtime.

### NonFunctional Requirements

NFR1: Workflow-context detection and Git proposal logic must not add unnecessary latency that breaks the user’s BMAD flow.

NFR2: After user approval, the system must return Git execution feedback promptly and distinguish AI delay from local Git processing delay when delay occurs.

NFR3: No Git action may execute without explicit user approval.

NFR4: Logs and audit records must remain scoped to files and workflow activity relevant to the current BMAD execution.

NFR5: Logs must avoid storing sensitive information and retain only the minimum approval and execution metadata needed for traceability.

NFR6: The system must not target unintended files or repositories when proposing or executing Git automation.

NFR7: When Git automation fails, the system must preserve user choice to continue or stop the workflow.

NFR8: Failures must be presented with understandable causes and recoverable options.

NFR9: Branch conflicts, commit failures, push failures, and repository state mismatches must be detected and reported consistently.

NFR10: The plugin must maintain full supported compatibility in the current Node.js-based opencode/DevAI runtime.

NFR11: The plugin must reliably detect when a remote repository is not configured.

NFR12: The plugin must reliably detect when a local Git repository has not been initialized.

NFR13: The plugin must check both Git state and runtime context before proposing or executing related automation.

NFR14: Unsupported runtimes must not be represented as providing the same guarantees as the official Node.js runtime.

### Additional Requirements

- Use the existing repository baseline as the starter template rather than adopting a new external scaffold; implementation must preserve the brownfield runtime contract.
- Keep `src/index.js` as the bootstrap entry point that wraps the legacy core and exposes the runtime hook map expected by the host plugin system.
- Preserve the compatibility bridge that reads global, project, and legacy config files, merges them in a deterministic order, and writes legacy mirror files when needed.
- Maintain the current policy model with workflow-command mapping, branch naming pattern support, command type mapping, branch-required behavior, and finalization mode selection.
- Keep hook entry points thin and route substantive behavior through centralized orchestration/services rather than duplicating logic in each hook.
- Preserve the legacy core behavior while refactoring outer structure; wrapper handlers must stay behaviorally equivalent to the legacy implementation, as reflected by regression coverage.
- Implement or formalize currently stubbed integration points for `permission.asked`, `file.edited`, and HTTP audit forwarding if those capabilities are claimed in scope.
- Keep audit logging best-effort and non-blocking so logging failures do not interrupt plugin flow.
- Support client logging, optional file logging with relative or absolute path handling, and optional HTTP forwarding for audit records.
- Maintain a file-based persistence model using JSON/JSONC configuration and in-memory/session state; no database should be introduced for MVP.
- Preserve ESM Node.js packaging and the script-driven build/release flow based on `esbuild`, release manifests, and SHA-256 checksum generation.
- Ensure release packaging includes the built plugin, installers, templates, manifest, and checksums for both `latest` and versioned release directories.
- Keep installer artifacts and template configuration files as first-class deliverables alongside source code.
- Maintain a regression suite that compares wrapper behavior and built artifact behavior against the legacy plugin for command prompts and mutating-tool protections.
- Documentation scope must include installation guidance, configuration guidance, branch-rule examples, approval-flow explanation, and legacy compatibility behavior.

### UX Design Requirements

No UX design document was provided, so no UX-specific implementation requirements were extracted in this step.

### FR Coverage Map

FR1: Epic 1 - BMAD workflow command detection
FR2: Epic 1 - Workflow-aware Git policy resolution
FR3: Epic 1 - Context-aware branch strategy selection
FR4: Epic 1 - Workflow phase distinction for Git behavior
FR5: Epic 1 - Branch creation or switch at workflow start
FR6: Epic 1 - Branch name candidate generation
FR7: Epic 3 - Commit preparation and creation from workflow artifacts
FR8: Epic 3 - Push proposal when a remote repository exists
FR9: Epic 1 - Repository initialization proposal for non-Git directories
FR10: Epic 2 - Approval request before every Git action
FR11: Epic 2 - Explanation of intent and expected effect before approval
FR12: Epic 2 - Accept, deny, or ignore-and-continue choices
FR13: Epic 2 - Non-blocking workflow continuation after deny or ignore
FR14: Epic 4 - JSON-based branch rule configuration
FR15: Epic 4 - JSON-based workflow policy configuration
FR16: Epic 4 - Deterministic project/global config precedence
FR17: Epic 4 - Legacy configuration compatibility support
FR18: Epic 4 - Team-specific policy tuning
FR19: Epic 2 - Clear notification of branch, commit, push, and repo-state failures
FR20: Epic 2 - Exception cause explanation and recovery choices
FR21: Epic 2 - Retry, skip, and manual-recovery continuation paths
FR22: Epic 2 - Isolation of automation failure from full workflow failure
FR23: Epic 3 - Git history recording for code and document artifacts
FR24: Epic 3 - Reviewer traceability of authorship and changes
FR25: Epic 3 - Use of standard Git tools for responsibility tracing
FR26: Epic 3 - Traceable approval outcomes and execution results
FR27: Epic 1 - Plugin integration with opencode/DevAI hook runtime
FR28: Epic 1 - Policy application via session and tool hook flows
FR29: Epic 4 - Compatibility with existing BMAD workflow commands
FR30: Epic 1 - Official behavior in Node.js-based opencode/DevAI runtime

## Epic List

### Epic 1: Workflow-Aware Safe Start
Users can start a BMAD workflow with the correct runtime context, Git readiness checks, and branch setup decisions already prepared for them.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR9, FR27, FR28, FR30

### Epic 2: Approval-Driven Git Execution and Recovery
Users can review, approve, deny, or skip proposed Git actions and still continue their workflow safely when automation encounters conflicts or failures.
**FRs covered:** FR10, FR11, FR12, FR13, FR19, FR20, FR21, FR22

### Epic 3: Finalization and Traceable Delivery
Users can finish workflows with commit and optional push behavior while preserving complete Git-based traceability for code, documents, and planning artifacts.
**FRs covered:** FR7, FR8, FR23, FR24, FR25, FR26

### Epic 4: Policy Administration and Compatibility Operations
Administrators can manage policy configuration, preserve legacy compatibility, and operate the plugin through reliable packaging, release, and runtime compatibility controls.
**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR29

## Epic 1: Workflow-Aware Safe Start

Users can start a BMAD workflow with the correct runtime context, Git readiness checks, and branch setup decisions already prepared for them.

### Story 1.1: Register Runtime Hooks Through the Plugin Bootstrap

As a plugin operator,
I want the plugin bootstrap to register the expected opencode/DevAI hooks,
So that workflow-aware Git guard behavior is activated consistently when the runtime loads the plugin.

**Acceptance Criteria:**

**Given** the plugin is loaded in a supported Node.js opencode/DevAI runtime
**When** the bootstrap entry point executes
**Then** it returns the expected hook map for command, tool, permission, file edit, and session events
**And** the bootstrap preserves the existing legacy core integration contract without requiring command changes.

**Given** the runtime loads the plugin in an unsupported or incomplete environment
**When** bootstrap dependencies are missing or invalid
**Then** the plugin fails in a controlled way that does not corrupt repository state
**And** the supported runtime requirement is explicit in logs or diagnostics.

### Story 1.2: Detect BMAD Workflow Commands and Runtime Context

As a workflow user,
I want the system to recognize the BMAD command and execution phase I started,
So that later Git decisions are based on the correct workflow context.

**Acceptance Criteria:**

**Given** a command is received by the runtime before execution
**When** the command matches a configured or discovered BMAD workflow command
**Then** the system classifies the workflow identity and records the command context for downstream policy resolution
**And** the detection works without requiring the user to rename the existing BMAD command.

**Given** a session or tool event occurs after workflow start
**When** the runtime processes the event
**Then** the system preserves enough context to distinguish start, in-progress, and finish phases
**And** non-workflow commands are ignored without blocking unrelated runtime behavior.

### Story 1.3: Load Merged Configuration and Resolve Workflow Policy

As a team administrator,
I want the plugin to load global, project, and legacy-compatible settings into one effective policy,
So that workflow behavior matches team rules without manual code changes.

**Acceptance Criteria:**

**Given** global and project configuration files both exist
**When** runtime configuration is loaded
**Then** the plugin applies a deterministic precedence order and produces a normalized effective configuration
**And** branch defaults, long-lived branch rules, and workflow policy mappings are available to downstream handlers.

**Given** only legacy configuration files are present
**When** the plugin loads configuration
**Then** it preserves compatibility by reading the legacy files and generating bridge files when required
**And** the workflow can continue without forcing a migration before use.

### Story 1.4: Compute Branch Strategy and Candidate Branch Names

As a workflow user,
I want the system to compute the appropriate branch behavior for the active workflow,
So that branch creation or switching follows the configured naming and policy rules automatically.

**Acceptance Criteria:**

**Given** a workflow command has been identified and policy has been resolved
**When** the plugin evaluates branch behavior for that workflow
**Then** it determines whether a branch is required, optional, or unnecessary for the workflow
**And** it computes a candidate branch name from configured command type, ticket context, fallback values, and slug rules.

**Given** the current branch is long-lived or does not satisfy the workflow policy
**When** branch evaluation runs
**Then** the plugin prepares a branch creation or switch proposal instead of silently mutating Git state
**And** the proposal preserves user approval as a separate later step.

### Story 1.5: Check Repository Readiness and Propose Initialization

As a workflow user,
I want the plugin to check whether my working directory is Git-ready before automation begins,
So that I can choose initialization or continue safely with full awareness of repository constraints.

**Acceptance Criteria:**

**Given** the workflow starts in a directory that is not an initialized Git repository
**When** readiness checks run
**Then** the plugin detects the missing repository state and prepares an initialization proposal
**And** no `git init` action is executed until the user explicitly approves it.

**Given** the workflow starts in a valid repository
**When** readiness checks inspect the environment
**Then** the plugin detects branch and remote prerequisites relevant to startup automation
**And** it reports repository readiness without adding unnecessary delay to the BMAD workflow.

## Epic 2: Approval-Driven Git Execution and Recovery

Users can review, approve, deny, or skip proposed Git actions and still continue their workflow safely when automation encounters conflicts or failures.

### Story 2.1: Present Approval Requests for Planned Git Actions

As a workflow user,
I want each planned Git action to be presented as an approval request,
So that I can decide whether automation should proceed before any repository mutation occurs.

**Acceptance Criteria:**

**Given** the plugin has planned a Git action such as branch creation, branch switch, commit, push, or init
**When** approval is required for that action
**Then** the runtime presents an approval request before execution
**And** the request is associated with the current workflow session and action type.

**Given** multiple Git actions may occur across a workflow
**When** approval prompts are generated
**Then** each prompt is scoped to a single planned action
**And** the system avoids executing later actions until the current approval outcome is resolved.

### Story 2.2: Explain Intent and Expected Impact in Approval Prompts

As a workflow user,
I want approval prompts to explain what the plugin intends to do and why,
So that I can make an informed decision about each Git action.

**Acceptance Criteria:**

**Given** an approval prompt is shown for a planned Git action
**When** the prompt is rendered to the user
**Then** it explains the action intent, expected repository impact, and workflow context in human-readable terms
**And** it avoids exposing unnecessary sensitive information in the prompt body or metadata.

**Given** the action is based on branch or workflow policy rules
**When** the explanation is constructed
**Then** it includes enough policy context for the user to understand why the action was proposed
**And** it remains concise enough not to obstruct the BMAD workflow unnecessarily.

### Story 2.3: Support Accept, Deny, and Ignore-and-Continue Outcomes

As a workflow user,
I want to accept, deny, or ignore each proposed Git action,
So that I retain control over automation without losing momentum in the workflow.

**Acceptance Criteria:**

**Given** an approval request is active
**When** the user selects accept, deny, or ignore-and-continue
**Then** the plugin records the selected outcome against the current action and session context
**And** subsequent behavior follows the selected outcome consistently.

**Given** the user denies or ignores a Git action
**When** the plugin resolves the approval
**Then** the repository is left unchanged for that action
**And** the workflow continues without forcing the user to abandon the BMAD task.

### Story 2.4: Detect and Report Git Conflicts and Execution Failures

As a workflow user,
I want Git conflicts and execution failures to be detected and reported clearly,
So that I understand what went wrong and what needs attention.

**Acceptance Criteria:**

**Given** a planned or approved Git action encounters a branch conflict, commit failure, push rejection, or repository state mismatch
**When** the plugin evaluates or executes the action
**Then** it detects the failure condition and classifies it consistently
**And** it reports a clear explanation of the failure cause to the user.

**Given** audit logging is enabled
**When** a failure is detected
**Then** the plugin records the failed action outcome in a traceable way
**And** logging failure itself does not interrupt the user workflow.

### Story 2.5: Offer Recovery Paths Without Failing the Workflow

As a workflow user,
I want recovery choices when automation fails or is blocked,
So that I can retry, skip, or resolve issues manually without losing workflow progress.

**Acceptance Criteria:**

**Given** a Git action is denied, skipped, or fails during execution
**When** the plugin resolves the action outcome
**Then** it offers recovery paths such as retry, continue without automation, or continue after manual resolution
**And** those options are explained in a way the user can act on immediately.

**Given** a recoverable automation failure occurs
**When** the workflow proceeds after the failure
**Then** the BMAD workflow is not treated as an immediate hard failure
**And** subsequent workflow steps can continue subject to the user’s chosen recovery path.

## Epic 3: Finalization and Traceable Delivery

Users can finish workflows with commit and optional push behavior while preserving complete Git-based traceability for code, documents, and planning artifacts.

### Story 3.1: Detect Finalizable Workflow Outputs

As a workflow user,
I want the plugin to determine when a workflow has produced finalizable artifacts,
So that end-of-workflow Git actions are proposed only when there is meaningful output to record.

**Acceptance Criteria:**

**Given** a workflow reaches its finish phase
**When** the plugin evaluates the workflow outcome
**Then** it determines whether changed code, documents, or planning artifacts qualify for finalization
**And** the decision follows the workflow-specific finalization policy.

**Given** no qualifying artifacts were produced
**When** finalization is evaluated
**Then** the plugin avoids proposing unnecessary commit actions
**And** it preserves a non-blocking workflow completion path.

### Story 3.2: Prepare and Execute Workflow Completion Commits

As a workflow user,
I want the plugin to prepare a commit from workflow artifacts at the right time,
So that completed work is captured in Git history without manual bookkeeping.

**Acceptance Criteria:**

**Given** finalizable workflow artifacts exist and commit behavior is allowed by policy
**When** the plugin prepares finalization
**Then** it creates a commit proposal scoped to the changed artifacts for the workflow
**And** the commit action remains subject to the approval model defined earlier.

**Given** the user approves the commit action
**When** commit execution runs
**Then** the resulting Git history includes the relevant code, technical documents, or planning artifacts
**And** failure to commit is reported without discarding workflow context or traceability metadata.

### Story 3.3: Propose Push Only When a Remote Repository Is Available

As a workflow user,
I want push behavior to be proposed only when it is valid and relevant,
So that remote publication is helpful rather than intrusive.

**Acceptance Criteria:**

**Given** a workflow commit has completed successfully
**When** the plugin evaluates push behavior
**Then** it checks whether a remote repository is configured before proposing a push
**And** it suppresses push proposals when no valid remote exists.

**Given** a remote repository is configured and push policy allows it
**When** push finalization is evaluated
**Then** the plugin creates a push proposal as a distinct approval-governed action
**And** a denied or failed push does not invalidate the already recorded local commit.

### Story 3.4: Record Approval Outcomes and Execution Results for Audit

As a reviewer or operator,
I want approval outcomes and Git execution results captured in audit records,
So that I can understand how workflow artifacts were finalized.

**Acceptance Criteria:**

**Given** a Git action is proposed, approved, denied, skipped, or executed
**When** the plugin records audit information
**Then** it stores a traceable event containing the action type, outcome, workflow context, and timestamp
**And** the record respects minimal-data logging constraints.

**Given** audit output is directed to client logs, files, or optional HTTP forwarding
**When** audit records are emitted
**Then** the plugin uses the configured sinks on a best-effort basis
**And** sink failures do not block workflow finalization.

### Story 3.5: Preserve Reviewer Traceability Through Standard Git History

As a reviewer,
I want workflow-created artifacts to remain inspectable through normal Git history tools,
So that I can trace authorship and changes without a separate review system.

**Acceptance Criteria:**

**Given** workflow outputs have been committed
**When** a reviewer inspects the repository with standard Git history tools
**Then** the resulting code, technical documents, and planning artifacts are visible in normal commit history
**And** authorship and change responsibility can be traced without proprietary metadata requirements.

**Given** a workflow produces both code and non-code artifacts
**When** finalization commits are created
**Then** those artifacts are recorded together or in a clearly attributable way aligned with the workflow output
**And** the plugin preserves the auditability goal stated in the product requirements.

## Epic 4: Policy Administration and Compatibility Operations

Administrators can manage policy configuration, preserve legacy compatibility, and operate the plugin through reliable packaging, release, and runtime compatibility controls.

### Story 4.1: Define and Normalize Branch and Workflow Policy Configuration

As a team administrator,
I want branch rules and workflow policies to be defined in configuration files,
So that automation behavior can be changed without modifying plugin source code.

**Acceptance Criteria:**

**Given** a team provides global or project-level configuration files
**When** the plugin loads and normalizes configuration
**Then** branch naming patterns, command type mappings, merge targets, and workflow policies are available in a consistent effective format
**And** invalid or missing optional values fall back to safe defaults where supported.

**Given** workflow policy configuration changes over time
**When** the plugin resolves the effective configuration
**Then** the active policy reflects the latest applicable project or global settings
**And** the resulting behavior remains deterministic across runs.

### Story 4.2: Preserve Legacy Configuration Compatibility and Bridge Files

As an existing plugin user,
I want older configuration locations and formats to remain usable,
So that I can adopt the refactored plugin structure without disruptive migration work.

**Acceptance Criteria:**

**Given** only legacy project configuration files are present
**When** the plugin starts
**Then** it reads the legacy configuration successfully and preserves equivalent runtime behavior
**And** it generates compatibility bridge files only when the compatibility rules require them.

**Given** both modern and legacy configuration files exist
**When** effective configuration is resolved
**Then** the precedence order remains explicit and predictable
**And** compatibility support does not silently override newer project-intended settings.

### Story 4.3: Preserve Existing BMAD Command Compatibility Through the Wrapper

As a workflow operator,
I want the refactored plugin wrapper to remain behaviorally compatible with the existing BMAD command set,
So that teams can adopt the new structure without retraining users or changing command habits.

**Acceptance Criteria:**

**Given** existing BMAD workflow commands are invoked through the runtime
**When** the refactored wrapper delegates to the legacy core
**Then** command names, hook entry points, and core behavior remain compatible with the prior plugin contract
**And** regression checks can compare wrapper behavior against legacy behavior for key guarded flows.

**Given** placeholder hooks or extension points exist in the wrapper structure
**When** compatibility is evaluated
**Then** unsupported or TODO paths are explicitly bounded so they do not misrepresent supported functionality
**And** future implementation work can extend them without breaking the existing contract.

### Story 4.4: Build and Package Release Artifacts Reliably

As a plugin maintainer,
I want build and release scripts to produce complete and verifiable distributable artifacts,
So that teams can install the plugin consistently across supported environments.

**Acceptance Criteria:**

**Given** a maintainer runs the build and release workflow
**When** packaging completes successfully
**Then** the release output includes the bundled plugin, installers, configuration templates, manifest, and checksums
**And** both versioned and `latest` release directories are populated consistently.

**Given** the plugin is built for distribution
**When** the bundled artifact is generated
**Then** it targets the supported Node.js runtime and preserves the expected plugin entry behavior
**And** release metadata reflects the current package version and artifact hashes.

### Story 4.5: Maintain Regression Coverage for Wrapper and Distribution Behavior

As a maintainer,
I want automated regression checks to verify wrapper compatibility and built artifact behavior,
So that refactoring and releases do not silently break guarded workflow behavior.

**Acceptance Criteria:**

**Given** source, wrapper, and built plugin artifacts are available in the repository
**When** regression tests run
**Then** they compare key command prompts and mutating-tool protections between legacy, wrapper, and built variants
**And** compatibility failures are reported before release output is trusted.

**Given** future changes affect bootstrap, hooks, or finalization behavior
**When** tests are updated or expanded
**Then** the regression suite remains the quality gate for behavioral parity
**And** maintainers can detect compatibility drift before shipping a new version.
