# Fangcun 1.0 Task 008A — Contributor Integration & Production Migration Readiness

## 0. Metadata

- Repository: 200212szh-creator/fangcun
- Base main commit before integration: 585f6d424685e0a788c28ff6b6f0ba60d5549e99
- Task 008 source commit: 459f7543d63cccb86294a41654dd2f99acb6a2a1
- Integrated main functional commit: f662e35d52eb4a169daec31c498d5c3918005a06
- Integration method: normal fast-forward from engineering/task008-contributors
- Formal database: D:\方寸数据\data\library.db
- Formal migration history at verification: 0001_archive_fields, 0002_loans_annotations, 0003_works, 0004_location_model
- Formal 0005_contributors: NOT APPLIED
- Task 008 migration SQL SHA-256: 693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83
- Verification date: 2026-09-10
- Task status: READY for the next separately approved production migration task

The functional release was built from the clean integrated code commit
f662e35d52eb4a169daec31c498d5c3918005a06. The final report commit is
documentation-only and does not change runtime behavior. No formal database
write, 0005 migration, deployment, UI redesign, or force push was performed.

## 1. Executive Result

Task 008A is complete for Contributor integration and production migration
readiness.

| Decision field | Result |
| --- | --- |
| Contributor diff audit | PASS |
| Additive migration safety | PASS |
| DTO and role contract | LOCKED |
| Legacy authors/translators | PRESERVED |
| Work and Location compatibility | PASS |
| Main availability | READY |
| New clean release | PASS |
| Release provenance | PASS |
| Pre-0005 runtime compatibility | PASS |
| Production-safe 0005 runner | READY |
| Isolated dry-run and execute tests | PASS |
| Formal 0005 | NOT APPLIED |
| Formal database mutation | NO |

This report stops at readiness. It is not approval to execute formal migration
0005.

## 2. Scope and Safety Boundary

The task scope was to audit Task 008, integrate it into main, verify the
integrated source, produce a new clean release, validate runtime behavior
against the unchanged pre-0005 formal database, and prepare a fail-closed
production runner.

The following actions were explicitly excluded and were not performed:

- no formal 0005 migration;
- no formal database schema or business-data write;
- no removal of authors or translators;
- no Work or Location redesign;
- no UI or Figma implementation;
- no deploy or service activation;
- no automatic merge or force push;
- no stopping of the current production service on 127.0.0.1:3000.

## 3. Task 008 Diff Audit

The Task 008 branch was inspected from the known main baseline before any
integration. The branch was clean, descended directly from the baseline, and
passed git diff --check.

The audited change set covered the Contributor contract, adapter and repository
integration, schema truth and validation, API compatibility, import/export and
search behavior, migration 0005, isolated migration and rollback tests,
production-readiness tests, and the Task 008 report. It did not introduce an
unrelated Work or Location redesign.

The migration SQL is additive. It creates contributors and
edition_contributors, adds the required indexes and migration history row, and
uses foreign keys and role checks. No legacy table or legacy author/translator
column is dropped, renamed, rewritten, deduplicated, or made unavailable.

Task 008A added only the production-safe runner, its focused safety suite, the
minimal lint ignore required to keep generated worktrees out of source lint,
and this readiness evidence.

## 4. Contributor Migration Contract

Migration 0005_contributors is an isolated, additive migration with the
following contract:

- required history is exactly 0001 through 0004;
- Work schema must be ready;
- Location schema must be ready;
- contributor schema must be absent and 0005 must not be recorded;
- contributors stores stable entity IDs and display data;
- edition_contributors stores edition, contributor, role, order, and optional
  edition-specific credited_as;
- foreign keys and role constraints are enforced in the database;
- migration history is recorded in the same transaction as the schema and
  backfill;
- invalid JSON, invalid roles, invalid IDs, partial schema, duplicate history,
  or an unsafe target fail closed;
- a second invocation is refused after validating the already-applied state.

The locked SQL digest is
693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83. The
runner canonicalizes line endings before comparing this digest and refuses a
mismatch.

## 5. Legacy Data Preservation

The existing book_editions authors and translators JSON fields remain the
compatibility source on a pre-0005 database. Task 008 backfill reads them
without changing their raw values. The structured model is additive and does
not replace those fields.

The formal database read-only evidence is:

| Edition | Title | authors | translators |
| --- | --- | --- | --- |
| 32103d60-9f61-4540-98c0-8e43db788aed | 罗生门 | ["芥川龙之介"] | [] |
| open--works-OL1209288W | Im Westen nichts Neues | ["Erich Maria Remarque"] | [] |

Legacy preservation was verified in isolated migration, isolated execute,
repository adapter, import/export, and runtime compatibility tests.

## 6. DTO and API Contract

The DTO contract is LOCKED for the Task 008 implementation.

BookEdition continues to expose:

    authors: string[]
    translators?: string[]
    contributors?: ContributorPayload[]

The structured read payload contains:

    contributor: { id, displayName, sortName?, normalizedName?, active }
    role
    orderIndex
    creditedAs?

The supported canonical roles are author, translator, editor, compiler,
illustrator, and other. Existing catalog, from-edition, edit, import, export,
wishlist, search, and legacy read paths remain compatible. A separate
Contributor CRUD endpoint was not introduced for this increment.

Structured contributor writes remain behind the existing catalog write
boundary. On a pre-0005 database, new structured-only writes fail closed rather
than creating an untracked partial representation.

## 7. Identity, Roles, and Backfill Policy

Contributor identity is the stable contributor ID. displayName is display data,
not a database identity, and is not used for fuzzy matching, global uniqueness,
automatic merging, or external authority resolution.

Backfill is deliberately conservative:

- every raw author credit creates one Contributor entity and one author relation;
- every raw translator credit creates one Contributor entity and one translator
  relation;
- order is preserved;
- raw display strings are preserved;
- sortName, normalizedName, and creditedAs are not guessed;
- equal display names across editions remain distinct entities.

Automatic contributor merge is explicitly disabled. The isolated test suite
verified that the same display name on separate editions does not collapse
those entities.

## 8. Work and Location Integration

Task 008 was integrated on top of the already verified Work and Location
baseline. The following contracts remain intact:

- Work is the stable book-level identity;
- Edition remains the bibliographic version;
- Copy remains the physical instance;
- Copy.currentLocation remains the current physical location;
- Loan.originalLocation remains the return-to-original-location record;
- Room to Zone to Shelf to Level to optional Slot remains the locked Location
  hierarchy;
- displayCode remains display-only identity;
- no new UI dependency was built on the legacy room field.

The isolated and runtime checks preserved Work, Edition, Copy, Location, Loan,
and Annotation identities and counts. The Contributor increment does not
redesign either the Work model or the Location model.

## 9. Mainline Integration

The integration used the normal fast-forward path:

    git merge --ff-only engineering/task008-contributors

This produced the integrated functional commit
f662e35d52eb4a169daec31c498d5c3918005a06 after the runner correction. No
conflict resolution, squash of unrelated work, automatic merge, or force push
was used.

Tracked main changes are limited to the audited Task 008 implementation, the
production runner and tests, lint configuration needed for generated worktree
exclusion, and the readiness report. Pre-existing untracked worktree and
design-reference directories were not added.

## 10. Production-Safe Runner

The checked-in runner is:

    scripts/migrate-v5-production.ts

The package entry point is:

    npm run db:migrate:contributors:production

The runner defaults to refusal. Every invocation requires explicit mode,
target, absolute database path, backup path, backup SHA-256, migration SQL
SHA-256, complete baseline counts, service attestation, and approval token.
The approval token is exactly EXECUTE_0005_CONTRIBUTORS.

Formal mode requires the exact formal database path
D:\方寸数据\data\library.db and a backup under
D:\方寸数据\backups\pre-upgrade. Isolated mode requires a temporary target
and temporary backup. The runner rejects path ambiguity, wrong targets,
wrong modes, missing approval, stale or mismatched backups, partial schema,
unexpected history, pending SQLite sidecars, active writers, or a listening
formal port.

The runner verifies integrity_check, quick_check, foreign-key violations,
baseline counts, Work and Location readiness, legacy snapshots, backup
metadata, backup hash, backup history, and a read-only backup restore
rehearsal before any execute transaction. Existing sidecar formats that omit a
legacy count field are accepted only after the backup database itself passes
the complete count check; any field that is present in the sidecar must match.

Formal target writer detection is restricted to Fangcun service-host and
Fangcun runtime release server processes. It does not stop or kill any
process.

## 11. Formal Target Preflight and Dry-Run

The formal target was intentionally left running and untouched. A formal
target DRY-RUN was executed with the exact formal path, fresh verified backup,
locked SQL hash, baseline, service attestation, and approval token. It returned
non-zero with:

    Preflight NO-GO: port3000: 127.0.0.1:3000 is listening;
    fangcunWriters: 2 Fangcun writer process(es) detected:
    PID 5912 service-host.js and PID 21732 Task007B server.js

This is the required fail-closed result. No write was attempted.

An isolated DRY-RUN passed and remained read-only. The formal NO-GO is expected
until a separate task safely stops the identified Fangcun service and obtains
the required production migration approval.

## 12. Isolated Safety Matrix A–P

The focused production-runner suite passed all A–P safety cases:

| Case group | Result |
| --- | --- |
| A–B missing or wrong approval | PASS; refusal |
| C active writer simulation | PASS; refusal |
| D wrong or unexpected migration history | PASS; refusal |
| E backup/hash/timestamp/count mismatch | PASS; refusal |
| F migration SQL hash mismatch | PASS; refusal |
| G partial or unrecorded contributor schema | PASS; refusal |
| H dry-run mutation check | PASS; isolated database unchanged |
| I first explicit isolated execution | PASS |
| J legacy author/translator preservation | PASS |
| K Work, Location, Edition, Copy, Loan, Annotation preservation | PASS |
| L equal display names remain distinct | PASS |
| M canonical author/translator relation roles | PASS |
| N second execution is safely refused | PASS |
| O existing contributor search/import/export probe | PASS |
| P post-validation failure transaction rollback | PASS |

The test-only active-writer and post-validation hooks are available only under
NODE_ENV=test and cannot authorize a formal execution.

## 13. Transaction and Rollback Safety

Contributor entities, edition relations, edition metadata, Work creation where
applicable, and Copy creation share the existing catalog transaction boundary.
Missing locations, invalid IDs, invalid roles, duplicate constraints, and
post-validation failures roll back the complete unit.

Migration 0005 creates tables, indexes, backfill rows, and the migration
history row in one transaction. The isolated rollback rehearsal removes the
new schema and history row without changing the legacy or core snapshots.
Rollback after a new Contributor relation/entity is present is refused rather
than silently deleting potentially reusable identity data.

## 14. Pre-0005 Runtime Compatibility

The new clean release was started on isolated port 3018 against the formal
database in GET-only mode. The following all returned HTTP 200:

- /home
- /library
- /search?q=Im%20Westen
- /api/health
- /api/catalog/books
- /api/catalog/locations
- /books/{copyId}
- /api/catalog/books/{copyId}
- /api/catalog/books/{copyId}/loans

The API returned both formal books, Work and Location data, authors arrays,
and translators arrays. The current formal translator values are empty arrays,
which is preserved data rather than a runtime omission.

Health returned database=ok, provenanceStatus=ok, currentMigration
0004_location_model, and the exact 0001–0004 migration list. The runtime did
not require contributors or 0005. The temporary compatibility server was
gracefully stopped; the existing 127.0.0.1:3000 service was not touched.

## 15. Quality Gates

| Gate | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm test | PASS — 30 passed, 1 skipped |
| npm run build | PASS |
| npm run db:validate with formal path explicitly set | PASS — read-only |
| npm run test:e2e final integrated run | PASS — 32/32 |
| focused Contributor runner tests | PASS — 3/3 |
| git diff --check | PASS |

The first full E2E attempt had one known mobile timing race in the stale-add
results case: the 350 ms assertion observed only the second query. The
targeted rerun passed 1/1, and the explicitly repeated full run passed 32/32.
This was recorded and not silently hidden.

The final runner-only source correction was followed by typecheck, lint,
complete Vitest, production build, and the focused runner suite. It does not
alter application routes or UI behavior.

## 16. New Clean Release

The new inactive clean release is:

    D:\图书库\runtime\releases\2026-09-10_Task008A_contributor_main_final_release

Release provenance:

| Field | Value |
| --- | --- |
| release | 2026-09-10_Task008A_contributor_main_final_release |
| buildId | ysN3eVkeoNZbiPlvXWuki |
| sourceCommit | f662e35d52eb4a169daec31c498d5c3918005a06 |
| dirty | false |
| buildTimestamp | 2026-09-10T05:56:38.9959664Z |
| server.js | present |
| .next/static | present |
| better-sqlite3 native binding | present |
| activated | NO |

The build was produced in an independent clean detached worktree from the
integrated functional commit. A copied pre-0005 backup was used only as
temporary build data. The formal database was not used as build-time write
data.

## 17. Release Health and Provenance

The isolated release health response was:

- status=ok;
- database=ok;
- provenanceStatus=ok;
- release and releaseDir equal the new final release;
- buildId equal ysN3eVkeoNZbiPlvXWuki;
- sourceCommit equal f662e35d52eb4a169daec31c498d5c3918005a06;
- dirty=false;
- currentMigration=0004_location_model;
- migrations exactly 0001 through 0004.

No release pointer was activated. The current production service remains on
the existing Task007B release until a future controlled activation decision.

## 18. Formal Database Verification

The formal database was accessed read-only after integration and after the
runner checks.

| Check | Result |
| --- | --- |
| Path | D:\方寸数据\data\library.db |
| History | 0001, 0002, 0003, 0004 |
| Works | 2 |
| Editions | 2 |
| Copies | 2 |
| Active copies | 2 |
| Locations | 2 |
| Loans | 0 |
| Annotations | 0 |
| contributors table | absent |
| edition_contributors table | absent |
| integrity_check | ok |
| quick_check | ok |
| foreign_key_check | 0 |
| formalDatabaseMutation | false |

The explicit formal db:validate run reported valid=true, current migration
0004_location_model, and databaseFile exactly
D:\方寸数据\data\library.db. No 0003 or 0004 rerun and no 0005 command was
issued.

The last successful read-only formal file-hash evidence retained from the
preceding verified checkpoint is
282d5b79c4546fd1143a2c9ee080a8192c7fb1b660b3fd25efe8afb8e949e243. A live
Windows service keeps the formal database handle open, so this turn relied on
the read-only schema, count, integrity, foreign-key, runtime, and runner
evidence rather than interrupting that service to reopen the file for a new
physical hash.

Formal database touched: NO.

## 19. Backup Verification

The designated prior pre-upgrade backup remains unchanged and was previously
verified as:

    D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db
    SHA-256: 79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f

The fresh current pre-0005 backup used by the production runner was read-only
verified as:

    D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-10T03-15-24-776Z.db
    SHA-256: 0947a7cc748a45281427fab4a5b0ee20a3d776746c12fe4c80c16f742d0a7016

The fresh backup has exact 0001–0004 history, no Contributor tables, valid
integrity and foreign keys, and database counts matching the formal baseline.
Its sidecar omits a legacy Works/Active Copies metadata field; the runner now
verifies all complete counts from the backup database and strictly verifies
every sidecar field that is present. The backup file and sidecar were not
modified.

## 20. GitHub Checkpoint

The integrated main was pushed using the normal non-forced path. The final
local main HEAD and origin/main must be identical at the report checkpoint.
The verification record is:

    local main HEAD = origin/main = final report commit
    force push = NO

The only pre-existing untracked paths, .worktrees/ and
design-system/default/references/, were preserved and excluded from commits.
No unrelated files were staged.

## 21. UI Impact

No UI implementation is included in Task 008A. No route layout, Figma file,
visual design, or interaction contract was changed.

Existing pre-0005 UI and API consumers continue to use authors and
translators. On a future 0005 database, the optional structured contributors
payload is available to a later UI task. The current formal database does not
expose that optional payload because its Contributor schema is correctly
absent.

## 22. ENGINEERING → UI HANDOFF

Contributor Contract = LOCKED.

Main Availability = READY.

Formal 0005 = NOT APPLIED.

The next UI task may rely on:

- optional edition-level contributors;
- stable contributor.id as entity identity;
- canonical roles author, translator, editor, compiler, illustrator, other;
- orderIndex for display ordering;
- creditedAs for edition-specific visible credit;
- displayName as display data only, never as identity or merge key;
- authors and translators retained as compatibility fields;
- Work and Location contracts already locked by prior handoffs;
- no new dependency on legacy Location room.

No UI implementation should assume formal 0005 has been executed until the
separate controlled production migration is completed and verified.

## 23. Readiness Decision and Stop

Task 008A readiness decision: READY.

All required code integration, compatibility, provenance, runner, isolated
dry-run, isolated execute, rollback, formal read-only verification, backup,
and safety evidence is complete. The production runner is ready for a future
explicitly approved Task 008B controlled migration.

Required stop conditions remain in force:

- do not execute 0005 in this task;
- do not stop the current production service as part of Task 008A;
- do not activate the new release;
- do not redesign Work, Location, or UI;
- do not merge unrelated work;
- do not force push;
- require a separate production approval before formal execution.

Recommended next action: Task 008B — Controlled Production Contributor
Migration, repeating the service stop gate, writer scan, fresh backup and
hash verification, formal DRY-RUN, explicit approval, transactional execution,
post-migration validation, and release activation review.

Task 008A stops here.
