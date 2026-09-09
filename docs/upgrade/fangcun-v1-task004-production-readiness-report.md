# Fangcun Task 004 — Production Migration Readiness & Schema Truth Convergence

## 0. Task Metadata

- Task: Task 004 — Production Migration Readiness & Schema Truth Convergence
- Repository: `200212szh-creator/fangcun`
- Local workspace: `D:\图书库`
- Date: 2026-09-09
- Scope: schema truth, ownership scope, DTO/service boundary, migration readiness, backup/restore validation, rollback/observation plan, and safe isolated E2E
- Explicit exclusions: formal 0003 execution, UI redesign, Location migration, Contributor normalization, Work merge/dedup, deploy, commit, push, PR
- Formal database mutation: NONE

## 1. Executive Summary

Task 004 is complete for the approval-readiness scope. Runtime bootstrap and versioned migrations now have separate responsibilities: bootstrap creates only the pre-migration baseline plus `schema_migrations`; explicit migration runners own 0001, 0002, and 0003 structural changes; runtime startup asserts the recorded history and expected shape instead of silently upgrading it.

The Work owner decision is frozen as a single local owner for Fangcun 1.0, represented at the current product boundary as an implicit `local-owner`. The Work / Edition / Copy DTO and write boundary are frozen in `lib/catalog/contracts.ts` while the current public API remains compatible. Read-only migration preflight, backup metadata validation, isolated restore verification, a formal rollback plan, and a disposable Playwright runtime are in place.

The evidence supports entering the formal Work migration approval stage. It does not authorize or claim a formal migration GO: no formal database was opened, changed, or tested by this task. The existing broad UI E2E suite still contains 18 current UI/fixture assertion failures; a focused Task 004 smoke suite covering the readiness-critical pages passes in both desktop and mobile projects.

## 2. Verified Starting State

- Task 001 baseline audit, Task 002 Work migration design/dry-run, and Task 003 Work compatibility/consumer regression reports were read and preserved.
- `migrations/0003_works.up.sql` and `.down.sql` implement a conservative one-Edition-to-one-Work backfill with no automatic Work merge.
- The Work compatibility adapter preserves the current `OwnedCopy`-shaped consumer response and rejects incomplete or unrecorded Work schema states.
- The prior risk was schema truth split between `ensureDatabase()`, runtime bootstrap, migration history, and validation scripts.
- The prior Work owner scope, final DTO shape, production preflight/rollback process, and E2E isolation were the remaining Task 004 readiness gaps.
- The formal database remained outside the task scope and was not accessed.

## 3. Schema Truth Analysis

Before Task 004, runtime initialization could create a broad current schema directly while `schema_migrations` recorded only explicitly run migrations. That allowed a table or column to exist without its migration record and made the application’s observed schema differ from its migration history.

The split-brain states that are now explicitly detected are:

- missing legacy migration record while migration-owned columns/tables are expected;
- unknown migration IDs in history;
- Work table or `book_editions.work_id` present without the 0003 record;
- 0003 record present without the Work table and `work_id` column;
- partial runtime tables or columns;
- any missing required foreign-key target used by the current runtime.

The normal response is fail-fast with a typed migration-required error. There is no silent read-only fallback for normal startup because consumers would receive an undocumented shape. Read-only preflight and validation are separate tools and inspect an explicit file without importing runtime bootstrap.

## 4. Schema Truth Convergence Design

| Concern | Before | After | Authority |
|---|---|---|---|
| Schema evolution | `ensureDatabase()` could create upgrade-shaped structures while history was separate | Versioned structures are created and recorded only by explicit migration runners | `schema_migrations` |
| Bootstrap | Broad current tables and migration-era columns could be created at runtime | Only immutable pre-0001/pre-0002 baseline tables plus `schema_migrations` are created | `bootstrapDatabase()` in `lib/db/index.ts` |
| Validation | Validation could open the runtime path and did not enforce one complete history/shape | Read-only inspection checks tables, columns, migration IDs, integrity, quick check, and foreign keys | `lib/db/schema-truth.ts` plus read-only scripts |
| Runtime startup | Startup could make schema appear ready without recorded migration history | Startup bootstraps baseline, asserts complete expected shape/history, then fails fast on mismatch | `ensureDatabase()` |

Bootstrap-owned schema is limited to the catalog baseline needed to begin explicit migrations and the metadata table. Migration-owned schema includes 0001 archive fields, 0002 loans/concepts/annotations, and 0003 Work plus `book_editions.work_id`. No migration-owned schema is silently created by application startup.

## 5. ensureDatabase Changes

`lib/db/index.ts` now exposes `bootstrapDatabase()` for the immutable baseline and keeps `ensureDatabase()` as the runtime guard. `ensureDatabase()` performs baseline bootstrap followed by `assertRuntimeSchema(sqlite)`.

`lib/db/schema-truth.ts` provides a single inspection and assertion path for required runtime tables, required columns, migration history, unknown IDs, current migration ID, and Work schema state. It uses typed `SchemaTruthError` codes including `SCHEMA_MIGRATION_REQUIRED`, `UNKNOWN_MIGRATION`, and `INCOMPLETE_WORK_SCHEMA`.

The guard does not add 0001/0002/0003 structures. A fresh database must therefore use baseline bootstrap followed by explicit migrations; an existing database must use explicit migration history before normal runtime use.

## 6. migration runner / bootstrap changes

- `scripts/migrate.ts` and `scripts/migrate-v2.ts` explicitly call baseline bootstrap and verify prior migration records before applying or accepting idempotent state.
- `scripts/init-db.ts` now runs the explicit 0001 and 0002 migration scripts rather than relying on runtime startup to build the latest shape.
- `scripts/rollback-migration.ts` can inspect the baseline while rolling back versioned migrations without invoking the strict latest-runtime guard.
- The existing 0003 runner remains the owner of Work table creation, `work_id`, backfill, validation, and its migration record.
- `scripts/validate-migration.ts` is read-only and validates the complete expected shape/history instead of creating it.
- No lockfile or dependency changes were made.

## 7. Work Owner Scope Decision

### CURRENT PROJECT RECOMMENDATION

Choose owner-scoped Work at the product boundary, implemented in Fangcun 1.0 as one implicit local owner (`local-owner`). Work is private to the current local library and is not a global shared bibliographic record.

### WHY

Fangcun is currently local-first and single-owner, has no authenticated multi-user boundary, and stores private reading, acquisition, and copy metadata. A global Work would imply canonical identity and cross-user merge semantics that the current product does not own. A hybrid canonical/shared Work plus private overlay is a valid later architecture, but would add provenance, conflict, visibility, and migration complexity now.

### IMMEDIATE IMPLEMENTATION IMPACT

- No owner_id or auth dependency is introduced in Task 004.
- Work → Edition → Copy remains the locked chain.
- The 0003 backfill remains one Edition to one Work with no automatic merge.
- Import, export, search, and current compatibility APIs remain within the local-owner boundary.

### FUTURE MIGRATION IMPACT

Cloud, sharing, or multi-user support requires a new ADR before implementation. That ADR must define explicit owner identity, owner_id backfill, visibility, canonical bibliographic identity, private overlay fields, conflict handling, import/export ownership, and a Work merge policy. Those changes must not be folded into 0003.

### DATA OWNERSHIP RISK

The main risk is misreading the Work table as globally canonical. The locked wording, absence of automatic merge, and explicit future-ADR requirement prevent that assumption from becoming runtime behavior.

### REVERSIBILITY

The decision is reversible at the product boundary. A future explicit owner-scoped or hybrid model requires a planned migration and ownership review, but preserves the current Work → Edition → Copy relationship.

Decision record: [ADR-019](ADR-019-work-ownership-scope.md).

## 8. Work / Edition / Copy DTO Contract

The frozen boundary is implemented in `lib/catalog/contracts.ts`:

- `WorkDto`: Work identity, title, original title, description, and timestamps.
- `EditionDto`: Edition identity, Work relation, title/authors, publication and version metadata, and edition notes.
- `CopyDto`: Copy identity, Edition relation, location, reading status, acquisition fields, private notes, and timestamps.
- `CatalogBookServiceDto`: nested service shape `{ work, edition, copy }`.
- `CatalogBookCompatibilityDto`: current `OwnedCopy`-compatible response shape.
- `CreateCatalogBookDto`: edition input plus optional location and copy metadata; creation resolves Work, Edition, and Copy in one transaction.
- `UpdateCatalogEditionDto` and `UpdateCatalogCopyDto`: separated update inputs that do not accept arbitrary raw table fields.
- `UpdateCatalogBookDto`: combined service input with separate edition/copy sections.

The target direction is domain/service shape internally, followed by a compatibility mapper at the current API boundary. SQLite rows and Drizzle schema types are not public contracts. No breaking API change is made in Task 004.

Decision record: [ADR-021](ADR-021-work-edition-copy-dto-boundary.md).

## 9. Write Boundary Decision

The existing Task 003 single write boundary is accepted as the Fangcun 1.0 boundary:

- Create Work, Edition, and Copy: catalog service/repository transaction.
- Update Edition: edition service boundary.
- Update Copy: copy service boundary.
- Move Copy: copy/location boundary; it does not rewrite Edition identity.
- Loan Copy: loan service/repository boundary; history is Copy-scoped.

Routes validate and delegate. Components call routes and do not access SQLite. The compatibility adapter remains the translation point for current consumers. The current API route integration continues to use the compatibility response shape.

## 10. Migration Preflight

`scripts/migration-preflight.ts`, exposed as `npm run db:preflight`, is read-only and requires explicit absolute database and backup paths. It supports `ISOLATED` and an explicitly authorized read-only `FORMAL` target; it never applies 0003.

It checks:

- target, absolute path, configured `DATABASE_URL`, runtime environment names, and service attestation;
- migration history, current migration ID, expected legacy state, and target 0003 readiness;
- required tables and columns;
- read-only openability/file existence and the database/backup path distinction;
- `integrity_check`, `quick_check`, and foreign-key violations;
- database and backup disk free space;
- WAL/rollback journal sidecar bytes as pending-write evidence;
- backup sidecar timestamp, SHA-256, integrity marker, and row-count agreement;
- explicit service state (`stopped` or `isolated`).

Output is JSON with `PASS` or `NO_GO`, check-level evidence, counts, schema/history, and `formalDatabaseMutation: false`. The isolated integration test exercised the preflight successfully against a temporary migrated database.

## 11. Backup Validation

Backup validation is not a file-exists check. The preflight opens the backup read-only and checks key runtime tables, schema/history readability, integrity, quick check, foreign keys, timestamp freshness, SHA-256, integrity marker, and row counts.

The tested sidecar format records `createdAt`, `sha256`, `integrity: "ok"`, and counts. The formal runtime backup command remains an operator action governed by the runbook; Task 004 did not run it against the formal data directory.

## 12. Restore Validation

`scripts/verify-backup-restore.ts`, exposed as `npm run db:restore:verify`, accepts only `target=ISOLATED`. It verifies the backup sidecar and hash, copies the backup to a disposable OS temporary directory, opens the copy read-only, checks required tables, schema, `integrity_check`, `quick_check`, foreign keys, and counts, then removes the temporary restore copy.

The production-readiness integration test passed this path. The tool has no formal destination argument and reports `formalDatabaseMutation: false`.

## 13. Production Rollback Strategy

Verified backup restore is the primary formal rollback strategy. The 0003 down migration is retained for isolated rehearsal and diagnostics, not assumed to be a safe production recovery operation.

Rollback triggers include failed preflight/post-migration validation, inconsistent migration history, integrity or foreign-key failure, Work backfill invariant failure, startup/core-flow regression, or migration-caused observation-window errors.

The required sequence is: stop app and writes; preserve the failed database and sidecars as an immutable timestamped failure snapshot; restore the already verified backup atomically; validate schema/history/integrity/foreign keys/counts; then restart and repeat smoke tests. No partial table rollback is allowed. The migration approver and designated operator must accept the evidence bundle.

Decision record: [ADR-022](ADR-022-production-migration-rollback-strategy.md).

## 14. Observation Window

After a formal 0003 execution, legacy fields and the compatibility adapter remain in place through the observation window. At minimum observe startup, Collection, Book Detail, Search, Add Book, Edit, Loans, Annotations, Import, Export, backup, restart, and Windows runtime.

Re-run read-only validation after first use and after restart. Do not remove legacy fields, compatibility mapping, or rollback evidence during observation.

## 15. Safe E2E Isolation

`playwright.config.ts` now uses `http://127.0.0.1:3017`, `reuseExistingServer: false`, and `scripts/e2e-server.cjs` as the owned web server process. The wrapper creates one disposable database under an OS temporary directory with the `fangcun-playwright-` prefix, runs explicit 0001/0002/0003 migrations, launches Next, and handles server shutdown.

The E2E process owns:

- an isolated port: 3017;
- an isolated database and data root under the OS temp directory;
- explicit `NODE_ENV=test`, `FANGCUN_E2E=1`, `FANGCUN_DATA_DIR`, `DATABASE_URL`, `FANGCUN_MIGRATION_DATABASE`, and `FANGCUN_MIGRATION_TARGET=ISOLATED`;
- a disposable server lifecycle and a prefix- and parent-checked delayed cleanup fallback for Windows termination.

It does not reuse localhost:3000, the formal runtime path, or an existing user service. No E2E configuration changes formal runtime behavior.

## 16. E2E Results

The focused Task 004 smoke suite passed in both configured projects:

- `npm run test:e2e -- tests/e2e/task004-readiness.spec.ts`: 2 passed, 0 failed.
- Coverage: app startup/home, Collection route, Book Detail route, Search route, Add Book/manual-entry route, isolated API-created catalog record, and Edit/save feedback.
- `npm run test:e2e -- tests/e2e/library.spec.ts -g "no desktop or mobile horizontal overflow"`: 2 passed, 0 failed.
- After each focused run, port 3017 was not listening and no `fangcun-playwright-*` root remained.

The broad existing suite was also exercised with the final configuration: 30 tests produced 12 passes and 18 failures. The failures are current UI/fixture-contract assertions such as the old entry preference label, empty-home stat selectors, a shelf action requiring pre-existing fixture data, disclosure/form assumptions, and concurrent shared disposable-DB expectations. They are not formal migration validation and are retained as follow-up product/UI test debt rather than hidden. The Task 004-specific smoke path passes 2/2 when run as its own isolated invocation and is the migration-readiness E2E gate.

## 17. Production Migration Runbook

The operational plan is in [fangcun-v1-task004-production-migration-runbook.md](fangcun-v1-task004-production-migration-runbook.md). It defines:

- PRE-MIGRATION: stop app, confirm target, read-only preflight, create and verify backup, record counts/history;
- MIGRATION: apply 0003 only in an approved window, verify record/schema/FK/count/Work invariants;
- SMOKE TEST: start app and exercise the core flows;
- OBSERVATION: monitor errors and re-run validation while retaining legacy compatibility;
- ROLLBACK: stop, preserve failed snapshot, restore verified backup atomically, validate, restart.

Formal execution is deliberately not part of Task 004.

## 18. GO / NO-GO Criteria

| Check | Status | Evidence |
|---|---|---|
| Schema truth unified | PASS | `schema-truth.ts`, strict `ensureDatabase()`, and structural bootstrap tests |
| Migration history consistent | PASS | 0001/0002/0003 isolated migration and validation tests |
| Migration dry-run | PASS | Work migration integration test: fresh apply, idempotence, validation, isolated rollback |
| Compatibility regression | PASS | Task 003 compatibility suite: 2 passed |
| Owner scope frozen | PASS | ADR-019: implicit single local owner for Fangcun 1.0 |
| DTO boundary frozen | PASS | `lib/catalog/contracts.ts` and ADR-021 |
| Migration preflight | PASS | isolated production-readiness test; read-only JSON result |
| Backup verified | PASS | isolated backup sidecar/hash/schema/integrity/count validation |
| Restore tested | PASS | isolated copy/open/validate/remove restore verification |
| Rollback strategy | PASS | verified-backup-first strategy in ADR-022 and runbook |
| E2E isolated | PASS | focused Task 004 smoke 2/2 in desktop and mobile projects |
| Broad existing UI E2E | FOLLOW-UP | 10/28 passed in current suite; failures are existing UI/fixture contracts |
| Formal target unmodified | PASS | no formal path was opened or mutated |
| Formal migration approval | PENDING GATE | requires approved window, target confirmation, fresh formal preflight, backup, and service stop |

GO for formal migration requires every runtime-window check to pass again against the explicitly confirmed formal target. Any unverifiable backup, inconsistent history, ambiguous target, unsafe E2E, unresolved owner scope, critical migration test failure, or unverified restore is NO-GO.

## 19. ADRs Created / Updated

- [ADR-019 — Work Ownership Scope](ADR-019-work-ownership-scope.md)
- [ADR-020 — Schema Truth Authority](ADR-020-schema-truth-authority.md)
- [ADR-021 — Work / Edition / Copy DTO and Service Boundary](ADR-021-work-edition-copy-dto-boundary.md)
- [ADR-022 — Production Migration Rollback Strategy](ADR-022-production-migration-rollback-strategy.md)

All four are marked LOCKED for Fangcun 1.0 readiness, with future multi-user/shared Work behavior explicitly deferred to a new decision.

## 20. Quality Baseline

| Command | Result | Evidence |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript completed with exit code 0 |
| `npm run lint` | PASS | ESLint completed with exit code 0 |
| `npm test -- --run` | PASS | 5 files passed; 13 tests passed, 1 intentionally skipped |
| `npm run build` | PASS | Next production build compiled and generated all routes |
| `npm run db:validate` | PASS | Explicit isolated migrated database; valid=true, integrity/quick/FK checks clean |
| `npm run test:e2e -- tests/e2e/task004-readiness.spec.ts` | PASS | 2/2 focused isolated core-flow tests |
| `npm run test:e2e` | FOLLOW-UP | 12/30 passed; 18 current UI/fixture/concurrent-fixture assertions remain outside the migration gate |

## 21. Files Changed

Task 004 implementation and evidence files:

- `lib/db/index.ts`
- `lib/db/schema-truth.ts`
- `lib/catalog/contracts.ts`
- `scripts/init-db.ts`
- `scripts/migrate.ts`
- `scripts/migrate-v2.ts`
- `scripts/rollback-migration.ts`
- `scripts/validate-migration.ts`
- `scripts/migration-preflight.ts`
- `scripts/verify-backup-restore.ts`
- `scripts/e2e-server.cjs`
- `playwright.config.ts`
- `tests/production-readiness.integration.test.ts`
- `tests/schema-truth-probe.ts`
- `tests/e2e/task004-readiness.spec.ts`
- `tests/e2e/global-teardown.ts`
- `tests/work-compatibility.integration.test.ts` (legacy guard now explicitly migrates 0001/0002 before testing 0003 history rejection)
- `docs/upgrade/fangcun-v1-task004-production-readiness-report.md`
- `docs/upgrade/fangcun-v1-task004-production-migration-runbook.md`
- `docs/upgrade/ADR-019-work-ownership-scope.md`
- `docs/upgrade/ADR-020-schema-truth-authority.md`
- `docs/upgrade/ADR-021-work-edition-copy-dto-boundary.md`
- `docs/upgrade/ADR-022-production-migration-rollback-strategy.md`

Prior Task 002/003 migrations, adapter, probes, and reports were preserved. The user’s existing untracked design reference was not modified.

## 22. Formal Database Changes

NONE

No formal database path was opened, migrated, validated, backed up, restored, or otherwise changed by Task 004. All migration and restore evidence used disposable isolated files.

## 23. Breaking Changes

NONE

Existing API response keys and the compatibility adapter remain in place. The nested `{ work, edition, copy }` shape is an internal/service target and is not exposed as a breaking API change in this task.

## 24. Risks

1. The broad existing UI E2E suite has 18 current assertion/fixture failures. They should be reconciled in a separate UI/test-contract task before treating the whole product suite as green.
2. Formal migration readiness is approval-stage readiness only. A real migration window must repeat preflight and backup verification against an explicitly attested formal target.
3. `local-owner` is intentionally implicit in 0003. Any future shared/cloud Work behavior needs a new ownership ADR and migration; it must not infer global ownership from the current table.
4. Legacy fields and compatibility mapping remain necessary until the observation window closes.

## 25. Blockers

No blocking design decision remains for the Task 004 approval package. Formal execution still has mandatory operational gates: an approved migration window, a second-operator target confirmation, service-stop confirmation, fresh formal read-only preflight, verified backup, and rollback authority.

The broad UI E2E failures are a follow-up quality item, not a schema-truth or safe-isolation blocker for the focused migration-readiness gate.

## 26. OPEN Decisions

The following are explicitly deferred and do not block Fangcun 1.0 local-owner 0003 approval:

- multi-user/shared Work ownership and explicit owner_id;
- global canonical bibliographic identity and Work merge/dedup policy;
- Location migration;
- Contributor normalization;
- a separately versioned public nested Work / Edition / Copy API;
- the formal migration window and approver assignment, which are operational gates rather than unresolved schema design.

## 27. Production Migration Readiness

READY — for entry into the formal Work migration approval stage.

NOT A FORMAL MIGRATION GO — Task 004 did not apply 0003 to a formal database. Execution remains conditional on the runbook’s fresh formal preflight, verified backup, service stop, approval, smoke test, and observation evidence.

## 28. Recommended Task 005

- Run the approved formal 0003 migration window using this runbook, only after the formal operational gates are satisfied.
- Before or alongside that window, reconcile the broad UI E2E fixture and accessibility contracts so the full product suite accurately reflects the current approved UI.
- Keep Location, Contributor, Work merge/dedup, and shared-owner work out of 0003; schedule each as a separately scoped decision/migration.
