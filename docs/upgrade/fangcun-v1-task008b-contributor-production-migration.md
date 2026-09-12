# Fangcun 1.0 Task 008B — Controlled Production Contributor Migration

## Workspace Hygiene

This section records Task 008B Phase A.0. It does not activate a runtime, stop
the production service, execute migration 0005, or modify the formal database.

### .worktrees Classification

Classification: Git worktree container.

The .worktrees/ directory contains only locally registered Git worktrees:

- task007-location
- task007a-integration
- task008-contributors
- task008a-release
- ui-001-baseline-audit
- ui-002-component-baseline
- ui-003b-supporting-presentation
- ui-005a-location-prerequisites
- ui-005b-location
- ui-approved-baseline-005a

The release-build worktrees are also registered outside this directory:

- D:\CodexHome\visualizations\2026\09\09\01a0838f-4f75-7821-a3f2-ec25e1f867bf\fangcun-release
- D:\CodexHome\visualizations\2026\09\09\01a0838f-4f75-7821-a3f2-ec25e1f867bf\fangcun-release-final

Git worktree metadata recognizes and manages all listed worktrees. The
worktree contents include normal source trees, local build/test artifacts, and
some uncommitted UI implementation and documentation work in the UI worktrees.
Those changes are independent user work and were not staged, stashed, moved, or
deleted.

No main-repository source or runtime script references .worktrees/ as product
runtime data. The formal database is outside this directory at
D:\方寸数据\data\library.db.

### .worktrees Action

Preserve the entire directory and every registered worktree. Add only the
narrow repository-root ignore rule:

    /.worktrees/

The rule does not ignore source files, migrations, tests, docs, design-system
assets, or any directory outside the root .worktrees/ container.

### design-system/default/references Classification

Classification: SOURCE ASSET.

The directory contains exactly one file:

| File | Type | Size | Dimensions | Created UTC | Modified UTC |
| --- | --- | ---: | ---: | --- | --- |
| fangcun-editorial-home-v2.png | valid PNG visual reference | 1,810,926 bytes | 1487 x 1058 | 2026-09-08 13:31:48 | 2026-09-08 13:24:03 |

SHA-256:

    4943691613cd61acd2420a9aa8486cd5c106e2218c49a29533b6829298be1ace

The image is the approved Editorial Atelier visual baseline. The implementation
brief calls it the unique visual reference, and existing upgrade and UI
documents cite the exact path. It is therefore a reproducible design/source
asset, not disposable screenshot output. It contains no source code, formal
database content, user library records, environment files, credentials,
tokens, or machine-specific paths. The sensitive-pattern scan was empty.

No application source or test directly loads this path at runtime. It is
referenced by design and implementation documentation, including the Editorial
Atelier implementation plan. The image is not being used as a webpage
background or runtime data file.

### Reference Action

Add the exact source asset:

    design-system/default/references/fangcun-editorial-home-v2.png

Do not ignore design-system/, design-system/default/, or any broader reference
pattern. No other reference files are staged.

### .gitignore Changes

Added exactly:

    /.worktrees/

This rule is limited to the local Git worktree container. The canonical
reference asset remains trackable.

### Files Deleted

NONE.

### Existing Worktrees Preserved

YES. Every path returned by git worktree list remains present and registered.
Worktree-local uncommitted files remain untouched.

### Final Git State

Before the hygiene change, local main and origin/main both pointed to
991d3ead8bf82b2aeb103a12b5fa4039d6a3aab8. The hygiene change consists only
of the narrow ignore rule, the exact source reference asset, and this report.
After the logical hygiene commit is pushed, git status --short is expected to
be empty and local main must equal origin/main. No empty commit is required.

### Formal DB Changes

NONE. No formal database path was opened for writing. No migration, runtime
activation, service stop, deployment, or force push was performed in Phase A.0.

## Phase A.0 Decision

Workspace Hygiene: COMPLETE.

Task 008B Phase A runtime activation: NOT STARTED.

Formal 0005: NOT APPLIED.

Production runtime modified: NO.

Phase A.0 stops here. A separate explicit instruction is required to retry
Task 008B Phase A.
