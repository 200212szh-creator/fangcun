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

## 0. Metadata

Task: 008B — Controlled Production Contributor Migration, Phase A.

Execution date: 2026-09-13.

Repository: 200212szh-creator/fangcun.

Phase A source of truth at release build time:

    89a2471d294242bee9d29f01d2734733c988405f

At the start of this rerun, local main and origin/main both matched the
source commit and the working tree was clean. The release was built from that
exact commit before the documentation and watchdog checkpoint changes below.

Formal database target:

    D:\方寸数据\data\library.db

Formal 0005 contributor migration: NOT APPLIED.

## 1. Source Commit Difference Audit

The previous Contributor release was built from:

    f662e35d52eb4a169daec31c498d5c3918005a06

The new source of truth is:

    89a2471d294242bee9d29f01d2734733c988405f

Intervening commits:

| Commit | Files | Classification |
| --- | --- | --- |
| 991d3ead8bf82b2aeb103a12b5fa4039d6a3aab8 | .gitignore; the Task 008A and Task 008B reports | repository hygiene; docs/report |
| 89a2471d294242bee9d29f01d2734733c988405f | design-system/default/references/fangcun-editorial-home-v2.png | design source asset |

The intervening file audit found no executable product code, runtime code,
migration code, test code, or build configuration. The PNG is a valid
1487 x 1058 canonical visual source asset. The root .worktrees ignore rule
is limited to the local worktree container.

## 2. Quality Gates

All quality gates passed against the exact Phase A source commit:

- typecheck: PASS
- lint: PASS
- unit tests: PASS — 11 files; 30 passed; 1 skipped
- production build: PASS — Next.js 15.5.25; all 15 static pages generated
- database validation: PASS — formal database; integrity and quick checks ok
- E2E: PASS — 32 passed
- git diff check: PASS

The E2E suite used its isolated test database for write-path coverage. No
formal write endpoint was called during runtime acceptance.

## 3. Formal Database Baseline

The formal database remained at:

    D:\方寸数据\data\library.db

Migration history was exactly:

    0001_archive_fields
    0002_loans_annotations
    0003_works
    0004_location_model

Read-only baseline:

| Measure | Value |
| --- | ---: |
| Works | 2 |
| Editions | 2 |
| Copies | 2 |
| Active Copies | 2 |
| Locations | 2 |
| Loans | 0 |
| Annotations | 0 |

Contributor and edition_contributors tables were absent. The database
integrity_check and quick_check returned ok, and foreign_key_check returned
zero violations.

The designated backup was re-hashed and remained:

    D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db
    79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f

The 0004-era backup used for the contributor runner PRECHECK was:

    D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-10T03-15-24-776Z.db
    0947a7cc748a45281427fab4a5b0ee20a3d776746c12fe4c80c16f742d0a7016

## 4. Runtime Pre-Activation Audit

The old active release was:

    D:\图书库\runtime\releases\2026-09-10_Task007B_location_main_phaseB_checkpoint

The old service host was PID 5912 and the old Next server was PID 21732.
Both were confirmed as D:\node.exe processes. The host command line was the
Fangcun service-host launcher, the server command line pointed to the exact
old release server.js, the server parent was PID 5912, and the only listener
on 127.0.0.1:3000 was PID 21732.

The two supervised tasks were the only tasks in scope:

    Fangcun Archive Service
    Fangcun Archive Health Recovery

No unrelated Node process, Windows service, project, or port owner was
modified.

## 5. Safe Stop and Watchdog Alignment

Only the two verified Fangcun tasks were temporarily disabled. The old host
was asked to stop through the service-host graceful SIGTERM path. No force
kill, task kill, or unrelated process termination was used.

After the signal, both old PIDs exited within the guarded stop window,
127.0.0.1:3000 was no longer listening, and no other Fangcun-scoped Node
writer remained. The launcher left a stale service.pid state file after the
processes had exited; it was removed only after the exact old PIDs and port
were confirmed absent, matching the project watchdog cleanup behavior.

Windows PowerShell 5.1 was decoding the health JSON using the system code
page because the endpoint did not declare a charset. That caused a healthy
Chinese release path to be rejected by the existing watchdog. The minimal
runtime-only repair decodes the response stream as UTF-8. It does not change
UI, database, migration, or business behavior.

The repaired watchdog one-shot check returned:

    status=ok
    reason=healthy

Both Fangcun tasks were then re-enabled. The health recovery task was started
once and returned LastTaskResult=0. Recovery/watchdog state: SAFE.

## 6. New Release

The new release was created from the exact required source commit and was not
reused from the previous Contributor release:

    D:\图书库\runtime\releases\2026-09-13_Task008B_PhaseA_contributor_main_final

Release metadata:

| Field | Value |
| --- | --- |
| Build ID | y95L5VD4s-HsHltBWFjoG |
| sourceCommit | 89a2471d294242bee9d29f01d2734733c988405f |
| dirty | false |
| provenanceStatus | ok |
| server.js | present |
| .next/static | present |
| better-sqlite3 native binding | present |

The old release is no longer active.

## 7. Controlled Activation

The existing promote-release.ps1 mechanism completed successfully. It
performed its pre-upgrade backup and integrity check and atomically updated
both release pointers:

    D:\图书库\runtime\current-release.txt
    D:\方寸数据\state\current-release.txt

Both pointers now resolve to the new Task 008B release. The watchdog then
started the service from the new pointer while the two recovery tasks were
temporarily paused for validation.

The active writer chain is:

    host PID 9704 -> Next server PID 37860

PID 37860 is the sole listener on 127.0.0.1:3000. Both supervised tasks are
enabled and Ready after validation.

## 8. Runtime Provenance

The active GET /api/health response reported:

| Field | Value |
| --- | --- |
| app | fangcun-archive |
| status | ok |
| database | ok |
| release | 2026-09-13_Task008B_PhaseA_contributor_main_final |
| buildId | y95L5VD4s-HsHltBWFjoG |
| sourceCommit | 89a2471d294242bee9d29f01d2734733c988405f |
| dirty | false |
| provenanceStatus | ok |
| currentMigration | 0004_location_model |

## 9. Pre-0005 Compatibility and Runner Verification

The final active runtime retained exact pre-0005 compatibility:

- migration history remained 0001, 0002, 0003, 0004_location_model
- contributor tables remained absent
- formal database integrity remained valid
- current schema state remained ready

The production runner exists at scripts/migrate-v5-production.ts and was
verified without execution. Its locked migration SQL SHA-256 is:

    693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83

The read-only runner PRECHECK passed with target FORMAL, service=stopped,
the verified 0004-era backup, the required baseline, and approval token:

    EXECUTE_0005_CONTRIBUTORS

The PRECHECK reported formalDatabaseMutation=false and expected only the
future 0005 contributor schema changes. No DRY-RUN or EXECUTE mode was run.

## 10. Legacy Author and Translator Display

Read-only GET /api/catalog/books returned two book records. Both records
preserved the legacy edition.authors field with the existing author values,
and both preserved the legacy edition.translators field as an empty array.

Legacy author display: PASS — 2 of 2 records.

Legacy translator display: PASS — 2 of 2 records; empty arrays preserved.

No UI-side Contributor identity inference or deduplication was introduced.

## 11. Runtime Smoke and E2E

The active release returned HTTP 200 for all 12 read-only smoke targets:

    /api/health
    /api/catalog/books
    /api/catalog/locations
    /api/catalog/books/c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e
    /api/catalog/books/c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e/loans
    /home
    /library
    /search?q=Im%20Westen
    /manage
    /settings
    /research
    /add

Runtime smoke: PASS.

The full isolated E2E suite remained PASS at 32 passed. No write smoke,
fixture insertion, contributor migration, or formal write request was
performed in this Phase A rerun.

## 12. Formal Database Final Integrity

Final read-only validation again reported:

- database path: D:\方寸数据\data\library.db
- migration history: 0001, 0002, 0003, 0004_location_model
- Works: 2
- Editions: 2
- Copies: 2
- Locations: 2
- Loans: 0
- Annotations: 0
- contributor tables: absent
- integrity_check: ok
- quick_check: ok
- foreign_key_check: 0
- formalDatabaseMutation: false

The formal database SHA-256 was recomputed through the running Node shared
read path and remained:

    282d5b79c4546fd1143a2c9ee080a8192c7fb1b660b3fd25efe8afb8e949e243

No schema or business-data change occurred. Formal DB touched: NO.

## 13. Phase B Readiness

Task 008B Phase A: COMPLETE.

New active release: YES.

Old release active: NO.

Recovery/watchdog: SAFE.

Pre-0005 compatibility: PASS.

Legacy author display: PASS.

Legacy translator display: PASS.

Formal DB touched: NO.

Formal migrations:

    0001_archive_fields
    0002_loans_annotations
    0003_works
    0004_location_model

Contributor tables: ABSENT.

0005_contributors: NOT APPLIED.

Integrity: PASS.

Production runner: PRECHECK PASS; EXECUTE NOT RUN.

Migration SHA-256:

    693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83

Approval token:

    EXECUTE_0005_CONTRIBUTORS

Phase B readiness: READY.

WAITING FOR:

    GO — EXECUTE TASK 008B PHASE B

STOP.

## Phase B — Controlled Production Migration

Task 008B Phase B executed the approved Contributor migration against the
formal production database only after the documented preconditions passed.
The docs-only checkpoint aafbf77910826e0e36d80f0e5207ab6052bdfe07 was
verified clean and equal to origin/main. The active executable release
remained the Phase A.1 release built from runtime baseline
b89ca628f332933e873db63266c9b0bc545e5a39; no rebuild was performed.

### B.1 Pre-Execution Baseline

The formal database target was:

    D:\方寸数据\data\library.db

Before migration, the exact history was:

    0001_archive_fields
    0002_loans_annotations
    0003_works
    0004_location_model

0005_contributors was not applied and both Contributor tables were absent.
The read-only formal database SHA-256 was:

    282d5b79c4546fd1143a2c9ee080a8192c7fb1b660b3fd25efe8afb8e949e243

The pre-migration business baseline was:

    Works: 2
    Editions: 2
    Copies: 2
    Active Copies: 2
    Locations: 2
    Loans: 0
    Annotations: 0

integrity_check=ok, quick_check=ok, and foreign_key_check=0.

The exact legacy source values were frozen before execution:

    Edition 32103d60-9f61-4540-98c0-8e43db788aed
    authors: ["芥川龙之介"]
    translators: []

    Edition open--works-OL1209288W
    authors: ["Erich Maria Remarque"]
    translators: []

The conservative backfill plan was:

    expected contributors: 2
    expected edition_contributors: 2
    expected author relations: 2
    expected translator relations: 0

Per Edition:

    32103d60-9f61-4540-98c0-8e43db788aed
    -> 芥川龙之介 / author / order_index 0

    open--works-OL1209288W
    -> Erich Maria Remarque / author / order_index 0

Each legacy credit row was assigned a distinct Contributor identity. No
automatic merge or display-name identity inference was performed.

### B.2 Runner and Migration Window

The canonical normalized migration SQL SHA-256 was:

    693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83

The verified production runner was used with:

    approval: EXECUTE_0005_CONTRIBUTORS
    target: FORMAL
    database: D:\方寸数据\data\library.db
    migration: 0005_contributors

The Fangcun writer was stopped through the verified service-host graceful
SIGTERM path. No force termination was used:

    host before:   20824
    server before: 11340

The two Fangcun scheduled watchdog tasks were disabled during the migration
window. After shutdown, both recorded processes exited, port
127.0.0.1:3000 was released, and the Fangcun writer scan returned zero.
The stale service.pid file was removed only after exact PID and port absence
was confirmed.

### B.3 Fresh Backup and Restore Rehearsal

A new rollback anchor was created from the stopped formal database through
the existing Fangcun database maintenance procedure:

    path:
    D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-13T14-08-20-292Z.db
    createdAt: 2026-09-13T14:08:20.303Z
    size: 192512 bytes
    SHA-256: 0947a7cc748a45281427fab4a5b0ee20a3d776746c12fe4c80c16f742d0a7016

The fresh backup retained exact 0001–0004 history, absent Contributor schema,
the frozen business counts, the frozen legacy values, integrity_check=ok,
quick_check=ok, and foreign_key_check=0. Its sidecar hash matched the file
hash and remained unchanged after migration.

The existing independent restore validation copied the fresh backup to an
isolated temporary location, opened it read-only, validated schema, counts,
integrity and foreign keys, and removed only that temporary rehearsal copy.

Restore rehearsal: PASS.

### B.4 Dry-Run and Single Execution

The formal production runner PRECHECK passed with the fresh backup, stopped
service attestation, zero active writers, exact baseline, and exact SQL hash.
The formal DRY-RUN then passed and left the formal database unchanged:
0005 remained absent and the pre-migration SHA-256 remained
282d5b79c4546fd1143a2c9ee080a8192c7fb1b660b3fd25efe8afb8e949e243.

The runner EXECUTE mode was invoked exactly once. It returned:

    status: PASS
    migrationStatus: applied
    migration timestamp: 2026-09-13T14:10:35.667Z

No retry, manual SQL patch, or second execution was performed.

### B.5 Post-Migration Schema and Backfill

The final formal migration history is exactly:

    0001_archive_fields
    0002_loans_annotations
    0003_works
    0004_location_model
    0005_contributors

Both Contributor tables exist. The migration created the expected columns,
the composite primary key on edition_contributors, the two expected
indexes, the book_editions and contributors foreign keys, and the canonical
role CHECK constraint.

Actual Contributor results:

    contributors: 2
    edition_contributors: 2
    author relations: 2
    translator relations: 0

Actual per Edition mappings exactly matched the frozen plan:

    32103d60-9f61-4540-98c0-8e43db788aed
    -> 芥川龙之介 / author / order_index 0

    open--works-OL1209288W
    -> Erich Maria Remarque / author / order_index 0

Orphan Contributor relations: 0.

Orphan Contributors: 0.

Invalid role codes: 0.

Duplicate relations: 0.

Relations to missing Editions: 0.

Backfill validation: PASS. No automatic merge occurred.

### B.6 Preservation and Integrity

Legacy authors preserved: YES.

Legacy translators preserved: YES.

The exact authors and translators JSON values matched their pre-migration
values record by record.

Business counts were unchanged:

    Works:          before 2 / after 2
    Editions:       before 2 / after 2
    Copies:         before 2 / after 2
    Active Copies:  before 2 / after 2
    Locations:      before 2 / after 2
    Loans:          before 0 / after 0
    Annotations:    before 0 / after 0

The post-migration formal database SHA-256 is:

    b274e949ca1d5e949e4674a69aaf79207533bd05e7d63e92b9b742c864dc8a0f

The SHA change is the expected result of the single approved 0005 schema and
backfill transaction. No unrelated schema or business-data change occurred.

integrity_check=ok.

quick_check=ok.

foreign_key_check=0.

Formal user data loss: NONE.

### B.7 Runtime Restart and Production Read Smoke

The exact verified Phase A.1 release was restarted without rebuilding or
switching releases:

    release:
    2026-09-13_Task008B_PhaseA1_contributor_main_final
    buildId: WK8jgGgNr-Oya-8B8-6pL
    sourceCommit: b89ca628f332933e873db63266c9b0bc545e5a39
    dirty: false
    provenance: PASS

The restarted writer chain was:

    host PID:   23824
    server PID: 32812
    port:       127.0.0.1:3000

The server is the child of the Fangcun service host and is the only Fangcun
listener on port 3000. Both expected scheduled tasks are enabled, health is
ok, recovery/watchdog is SAFE, and no old release resurrection or duplicate
writer was observed.

Non-destructive production read smoke returned HTTP 200 for:

    Home: /home
    Collection: /library
    Book Detail: /books/c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e
    Search: /search?q=Im%20Westen
    Locations: /manage?focus=shelf
    Books API: /api/catalog/books
    Detail API: /api/catalog/books/c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e
    Loans API: /api/catalog/books/c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e/loans
    Locations API: /api/catalog/locations
    Search API: /api/discovery/search?q=Im%20Westen&type=book
    Export API: /api/export?format=json

The two existing books returned correct title, author, legacy translator
field, structured Contributor relations, location, copy and Edition data.
The structured Contributor DTO was readable for both existing books and the
legacy author/translator fallback remained compatible.

Post-0005 production read smoke: PASS.

### B.8 Phase B Decision

Task 008B Phase B: COMPLETE.

Migration: 0005_contributors.

Execution count: 1.

Contributor production migration: COMPLETE.

Fresh backup: VALIDATED and retained.

Restore rehearsal: PASS.

Integrity: PASS.

Quick check: PASS.

Foreign keys: PASS.

Single writer: YES.

Recovery/watchdog: SAFE.

Force termination: NO.

Formal DB touched by the approved migration: YES, exactly once.

No UI changes, no schema redesign, no unrelated refactor, no broad cleanup,
and no force push were performed.

Ready for Task 008C: YES.

STOP.

## Phase A.1 — Post-Checkpoint Runtime Realignment

Phase A.1 revalidated the Contributor-aware mainline after the post-Phase-A
checkpoint. The source-of-truth checkpoint at the start of this work was:

    main        b89ca628f332933e873db63266c9b0bc545e5a39
    origin/main b89ca628f332933e873db63266c9b0bc545e5a39
    worktree    clean

The fresh release in this section was built from that exact commit.

### A.1.1 Source Commit Difference Audit

The complete delta from the previous Contributor release source
f662e35d52eb4a169daec31c498d5c3918005a06 to the current checkpoint was
reviewed. For the required immediate delta
89a2471d294242bee9d29f01d2734733c988405f..b89ca628f332933e873db63266c9b0bc545e5a39,
there was one intervening commit:

    b89ca62 docs: complete task008b phase a evidence

Its files were classified after inspection:

- docs/upgrade/fangcun-v1-task008b-contributor-production-migration.md:
  docs/report
- runtime/launcher/watchdog.ps1: executable runtime control code

The watchdog change is limited to UTF-8 decoding of the Windows PowerShell
5.1 health response stream. It is not a migration, API, schema, or business
data change. No Contributor SQL, migration, API route, database repository,
or production business-logic change was present in this delta. No repository
hygiene or design source asset change was present in this immediate delta;
those changes are outside the 89a2471..b89ca628 checkpoint interval.

### A.1.2 Quality Gates

The following gates were rerun from the b89ca628 checkpoint:

- typecheck: PASS
- lint: PASS
- focused Contributor/provenance/readiness/Work compatibility tests:
  PASS, 4 files and 9 tests
- full unit/integration suite: PASS, 11 files, 30 passed and 1 skipped
- production build: PASS, Next.js 15.5.25
- isolated E2E: PASS, 32/32 on the clean rerun across Chromium desktop and
  mobile projects

An initial E2E attempt was not counted because the isolated 3017 test server
exited before the final six mobile cases; the formal Fangcun service remained
healthy throughout. A clean rerun completed all 32 cases successfully.

### A.1.3 Fresh Release and Provenance

A new release was built and activated:

    D:\图书库\runtime\releases\2026-09-13_Task008B_PhaseA1_contributor_main_final

Its release metadata was:

    buildId: WK8jgGgNr-Oya-8B8-6pL
    sourceCommit: b89ca628f332933e873db63266c9b0bc545e5a39
    dirty: false
    provenanceStatus: ok

This release was not reused from the earlier Phase A build.

### A.1.4 Controlled Runtime Realignment

The previously active Phase A host PID 9704 and server PID 37860 were
confirmed as Fangcun processes before shutdown. They were stopped through
the project service-host graceful SIGTERM path; no force termination was
used. The old server released port 3000 before the pointer switch.

Both project release pointers were then atomically aligned to the fresh
Phase A.1 release, and the patched Windows PowerShell 5.1 watchdog started
the new runtime:

    host PID:   20824
    server PID: 11340
    port:       127.0.0.1:3000

The server process is the child of the Fangcun service host and the only
Fangcun process listening on port 3000. The one other observed Node process
belongs to an unrelated project and was not stopped. The old release did not
resurrect. Both Fangcun scheduled tasks are enabled, the recovery check
returned result 0, and the active writer is the single verified
20824>11340 pair.

The runtime health response reported status=ok, database=ok,
currentMigration=0004_location_model, and provenanceStatus=ok. The
PowerShell 5.1 UTF-8 health decoding path was verified with the Chinese
release directory and the recovery/watchdog path remained SAFE.

### A.1.5 Pre-0005 Compatibility Smoke

Read-only requests against the active release all returned HTTP 200 for:

    /home
    /library
    /books/c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e
    /search?q=Im%20Westen
    /api/catalog/books/c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e/loans
    /api/catalog/locations
    /api/catalog/books
    /api/discovery/search?q=Im%20Westen&type=book

The Books API returned the existing records with both legacy authors and
translators fields. Legacy author display: PASS. Legacy translator display:
PASS; the two current records preserve translators as empty arrays, and the
legacy fallback adapter tests preserve non-empty legacy translator values.
No UI-side Contributor identity inference or deduplication was introduced.

### A.1.6 Formal Database and Backup Revalidation

The formal database was opened read-only at:

    D:\方寸数据\data\library.db

The migration history remained exactly:

    0001_archive_fields
    0002_loans_annotations
    0003_works
    0004_location_model

Contributor tables remained absent. Read-only counts remained:

    Works: 2
    Editions: 2
    Copies: 2
    Locations: 2
    Loans: 0
    Annotations: 0

integrity_check=ok, quick_check=ok, foreign_key_check=0, and
formalDatabaseMutation=false. The formal database SHA-256 remained:

    282d5b79c4546fd1143a2c9ee080a8192c7fb1b660b3fd25efe8afb8e949e243

The designated pre-upgrade backup was rehashed and remained:

    D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db
    SHA-256: 79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f

Formal DB touched: NO. No schema or business-data change occurred.

### A.1.7 Production Runner and Decision

The canonical normalized SHA-256 of migrations/0005_contributors.up.sql
was rechecked:

    693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83

The production runner PRECHECK passed on an isolated temporary copy of the
verified 0004-era backup with the required baseline, explicit isolated
service attestation, and:

    approval token: EXECUTE_0005_CONTRIBUTORS
    expected migration: 0005_contributors
    formalDatabaseMutation: false

No DRY-RUN or EXECUTE mode was run. The designated older backup above was
not reused as a Phase B execution backup. Phase B must create and verify a
new timestamped fresh backup immediately before any formal migration.

Task 008B Phase A.1: COMPLETE.

Recovery/watchdog: SAFE.

Pre-0005 compatibility: PASS.

Legacy author display: PASS.

Legacy translator display: PASS.

Formal DB touched: NO.

Contributor tables: ABSENT.

0005_contributors: NOT APPLIED.

Integrity: PASS.

Production runner: PRECHECK PASS; DRY-RUN and EXECUTE NOT RUN.

Phase B readiness: READY.

WAITING FOR:

    GO — EXECUTE TASK 008B PHASE B

STOP.
