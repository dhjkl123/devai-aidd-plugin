# Sprint Change Proposal: Story 1.1 Bootstrap vs Compatibility File Generation

Date: 2026-05-08
Scope: Moderate
Affected Story: 1-1-register-runtime-hooks-through-the-plugin-bootstrap
Related Future Story: 4-2-preserve-legacy-configuration-compatibility-and-bridge-files

## 1. Issue Summary

Story 1.1 currently requires bootstrap initialization to remain read-only, while the current product direction expects required compatibility/configuration files to be written during plugin installation or explicit setup. This creates a planning conflict:

- The story text treats any startup-time file generation as a violation.
- The product direction allows compatibility file generation when it is part of install/setup behavior.
- The current implementation writes compatibility bridge files during runtime bootstrap, which satisfies neither interpretation cleanly.

This is not only a code review finding. It is a mismatch between story scope, runtime responsibilities, and compatibility strategy.

## 2. Impact Analysis

### Epic Impact

- Epic 1 is affected because Story 1.1 currently mixes hook registration with compatibility file lifecycle rules.
- Epic 4 is affected because Story 4.2 is the more natural home for legacy bridge-file generation and compatibility policy.

### Story Impact

- Story 1.1 should focus on bootstrap integrity, hook registration, and controlled runtime failure.
- Story 1.1 should not own install-time compatibility file creation rules.
- Story 4.2 should explicitly own when and how legacy bridge files are generated.

### Artifact Conflicts

- `1-1-register-runtime-hooks-through-the-plugin-bootstrap.md` contains a read-only bootstrap requirement that conflicts with the intended install/setup behavior.
- `epics.md` currently places compatibility behavior in Epic 4, but Story 1.1 still partially claims that concern through its bootstrap wording.

### Technical Impact

- Runtime bootstrap should not create repo-dirty side effects unless the product explicitly treats bootstrap as setup.
- If compatibility files are required, responsibility should move to install/setup or an explicit migration path.
- Regression coverage should continue to validate bootstrap import/dependency failures independently of this scope correction.

## 3. Recommended Approach

Recommended path: Direct adjustment with backlog clarification.

- Keep Story 1.1 scoped to:
  - wrapper/bootstrap loading
  - hook-map registration
  - compatibility alias preservation
  - controlled diagnostics on invalid runtime state
- Move compatibility bridge-file generation rules to Story 4.2 or a dedicated install/setup task.
- Clarify that install/setup may write required compatibility files, but runtime bootstrap must not silently perform install-time migration work.

Rationale:

- This preserves a clean boundary between runtime initialization and configuration migration.
- It aligns the plan with the product expectation that installation may generate required files.
- It avoids baking setup side effects into the plugin load path.

## 4. Detailed Change Proposals

### Proposal A: Update Story 1.1 Acceptance/Task Language

Story: `1-1-register-runtime-hooks-through-the-plugin-bootstrap`
Section: Tasks / Subtasks and supporting notes

OLD:

- `Ensure bootstrap initialization remains read-only with respect to Git state; startup may load config, register hooks, and emit diagnostics, but must not mutate repositories.`

NEW:

- `Ensure bootstrap initialization does not perform implicit install/setup migration work during runtime load; startup may load config, register hooks, and emit diagnostics, but compatibility file generation must belong to explicit install/setup or legacy-migration behavior.`

Rationale:

- This preserves the important runtime-safety goal without incorrectly banning install-time file generation.

### Proposal B: Clarify Story 1.1 Scope

Story: `1-1-register-runtime-hooks-through-the-plugin-bootstrap`
Section: Story intent / technical requirements

OLD:

- Story 1.1 implicitly mixes bootstrap behavior with compatibility bridge-file generation rules.

NEW:

- Story 1.1 covers runtime bootstrap only.
- Compatibility bridge-file generation policy is deferred to Story 4.2 or explicit install/setup flow design.

Rationale:

- This removes the current scope collision and makes review outcomes more objective.

### Proposal C: Strengthen Story 4.2

Story: `4-2-preserve-legacy-configuration-compatibility-and-bridge-files`
Section: Acceptance criteria / implementation notes

NEW ADDITION:

- `Given compatibility bridge files are required for legacy support`
- `When the plugin is installed or an explicit migration/setup step is executed`
- `Then the required bridge files are generated in a deterministic way`
- `And runtime bootstrap does not silently perform that migration on ordinary plugin load unless the product explicitly defines bootstrap as setup.`

Rationale:

- This places file-generation ownership where it belongs.

## 5. Implementation Handoff

Scope classification: Moderate

Routing:

- Product Owner / Scrum Master:
  - update Story 1.1 wording to remove the bootstrap/setup collision
  - strengthen Story 4.2 to own compatibility bridge generation
- Development:
  - keep Story 1.1 review follow-up for missing-import regression coverage
  - later refactor runtime bridge generation behavior to match the corrected planning decision

Success criteria:

- Story 1.1 no longer claims install-time concerns it should not own.
- Story 4.2 clearly defines compatibility bridge-file generation behavior.
- Review outcomes for Story 1.1 can focus on bootstrap behavior without planning ambiguity.
