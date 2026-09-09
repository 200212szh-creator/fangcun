# Fangcun v1 Task 005A — Production-Safe Migration Runner Report

## 0. Task Metadata

- Task: Task 005A — Production-Safe Migration Runner
- Date: 2026-09-09
- Repository: `200212szh-creator/fangcun`
- Baseline HEAD observed: `3b14fe6c5fafc72a010d383a6e64b65b48a9377a`
- Scope: build and validate a separate runner for the `0003_works` production window.
- Explicit exclusion: no formal database migration, no formal database write, no service restart, no commit, push, PR or deploy.

## 1. Why Phase B Was Blocked

Task 005 Phase B was correctly blocked because the only existing `0003_works` runner, `scripts/migrate-v3.ts`, hard-rejected every target other than `FANGCUN_MIGRATION_TARGET=ISOLATED`. That guard was not bypassed. A separate production-safe runner was therefore required before a future Phase B window can be considered.

## 2. Existing Runner Safety Boundary

`scripts/migrate-v3.ts` remains unchanged. Its verified SHA-256 is:

`346410503ecf73faedc1462a3961e96d40312fdfd26cba9bbada480a3c5c45ec`

It continues to require `FANGCUN_MIGRATION_TARGET=ISOLATED` and an explicit absolute `FANGCUN_MIGRATION_DATABASE`. The new runner does not replace, weaken or alter this isolated boundary.

## 3. Production Runner Design

New runner: `scripts/migrate-v3-production.ts`

The runner is separate from the isolated runner and has three explicit modes:

- `PRECHECK`: read-only gates and backup restore rehearsal.
- `DRY-RUN`: read-only gates plus expected-change output; no target write.
- `EXECUTE`: all gates plus the exact approval token, then one atomic migration.

The package command is `npm run db:migrate:production`. It has no implicit target, database, backup, service state or approval defaults.

## 4. Approval Gates

The default invocation refuses. `EXECUTE` requires the exact command-line token:

`--approval=EXECUTE_0003_WORKS`

The token is required in addition to `--target=FORMAL`, `--mode=EXECUTE`, the explicit absolute paths, baseline counts, backup hash and service attestation. `NODE_ENV=production` alone cannot authorize execution. Isolated execution tests also require the token, so the apply boundary is consistent in both modes.

## 5. Target Validation

- `FORMAL` must use the exact expected path `D:\方寸数据\data\library.db`.
- `FORMAL` is rejected if the path is temporary.
- `ISOLATED` requires both target and backup to be inside the OS temporary directory.
- Database and backup must be different existing files.
- The target must contain the normal runtime schema and exactly the legacy migration history `0001_archive_fields`, `0002_loans_annotations`.
- `0003_works`, `works` and `book_editions.work_id` must be absent before apply.
- Partial, present-but-unrecorded, recorded-without-schema and unknown-migration states fail closed.
- Target counts must match the explicit baseline: Editions, Copies, Loans, Annotations and Locations.

## 6. Backup Gate

The runner requires an explicit `--backup-sha256` and validates the backup file against both that value and its sidecar. The sidecar must have a valid timestamp, `integrity: ok`, matching baseline counts and a maximum age of 168 hours by default. The backup is opened read-only.

The runner performs an isolated restore rehearsal by copying the backup into a temporary directory, validating schema, migration history, integrity, quick check, foreign keys and baseline counts, then removing only that temporary copy. It never restores over the formal database.

The previously verified formal backup remains outside this task's write scope. Its recorded SHA-256 is:

`79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f`

## 7. Migration SQL Hash Gate

The checked-in `migrations/0003_works.up.sql` is pinned to the Task 002 artifact hash:

`294b653605b440e2db8187f218d9c7be169c185b27182007ec181152916ac8b4`

The runner refuses if the checked-in SQL hash differs. An optional `--sql-sha256` attestation must also match. No SQL was changed in this task.

## 8. Writer / Service Gate

The runner requires `--service=stopped` for FORMAL and `--service=isolated` for ISOLATED. It also checks that `127.0.0.1:3000` is not listening and, on Windows, scans for Fangcun `service-host` and release `server` Node processes. Any uncertain writer scan fails closed. The runner never starts or stops services.

## 9. Dry-run Mode

`--mode=DRY-RUN` performs the complete read-only target, backup, restore, writer, port, baseline and SQL gates. It reports target path, migration state, gate results, baseline counts, SQL hash and expected changes:

- create one Work per pre-existing Edition;
- add the `works` table;
- add `book_editions.work_id`;
- add the Work-link index;
- record `0003_works`.

The isolated dry-run test proved that the target's logical schema, history, counts and integrity remain untouched by the runner.

## 10. Execution Mode

`--mode=EXECUTE` rechecks the target immediately before opening it read-write. It executes the verified SQL inside a SQLite transaction, creates one Work per Edition, links every Edition, records `0003_works`, and performs post-migration validation before the transaction can commit.

The runner does not execute the formal target in this task. The successful execution test used an isolated representative database only.

## 11. Post-Migration Validation

The transaction and final read-only validation check:

- `works` exists and `book_editions.work_id` exists;
- `0003_works` is recorded exactly once;
- Work count equals Edition count;
- missing Work links, orphan Works, orphan Editions and duplicate Work IDs are zero;
- Work title and timestamps are non-null;
- foreign-key violations are zero;
- `integrity_check` and `quick_check` are `ok`;
- Editions, Copies, Loans, Annotations and Locations counts are unchanged;
- legacy Edition rows remain unchanged after removing the newly added `work_id` field from the comparison.

## 12. Failure Behaviour

Any preflight or validation failure exits non-zero. The runner does not start the service, invoke a down migration, restore a backup or retry. Apply uses SQLite transaction atomicity, so a simulated post-validation failure leaves the isolated target in its pre-apply state without invoking an automatic rollback script or backup restore.

## 13. Isolated Safety Test Matrix

| Case | Condition | Result |
|---|---|---|
| A | No approval token | REFUSE |
| B | Wrong approval token | REFUSE |
| C | Simulated active service attestation | REFUSE |
| D | Migration history mismatch | REFUSE |
| E | Backup SHA-256 mismatch | REFUSE |
| F | SQL SHA-256 mismatch | REFUSE |
| G | Correct gates plus dry-run | PASS; no target modification |
| H | Correct gates plus isolated execution | PASS |
| I | Second execution after 0003 | REFUSE; already migrated state |
| J | Simulated post-validation failure | Non-zero; no down migration or restore |

## 14. Test Results

- New production-runner safety suite: **5 tests passed**.
- Matrix A–F are covered by the fail-closed gate test; G, H, I and J have dedicated assertions.
- Full Vitest suite: **18 passed, 1 skipped** across 6 test files.
- No formal database path was supplied to the runner or test fixture.

## 15. Quality Baseline

- typecheck: PASS — `npm run typecheck`
- lint: PASS — `npm run lint`
- tests: PASS — `npm test` (`18 passed, 1 skipped`)
- build: PASS — `npm run build`
- db validation: PASS — `npm run db:validate`, explicitly targeted local `D:\图书库\data\library.db` read-only; migration history remained 0001/0002, work schema absent, integrity and foreign-key checks clean.

## 16. Files Changed

- `scripts/migrate-v3-production.ts` — new fail-closed production-safe runner.
- `package.json` — registered `db:migrate:production`.
- `tests/production-migration-runner.integration.test.ts` — isolated safety matrix.
- `docs/upgrade/fangcun-v1-task005a-production-runner-report.md` — this report.

The existing `scripts/migrate-v3.ts`, migration SQL, product UI, runtime service and formal data files were not changed by this task.

## 17. Formal DB Changes

NONE

## 18. Production Readiness

READY for a separately approved production migration window, subject to repeating the formal preflight, fresh backup/hash/restore gates, stopped-writer confirmation and the exact approval token. This task itself did not authorize or perform formal execution.

## 19. Remaining Risks

- The production runner is Windows-specific for the Fangcun process scan and intentionally fails closed on unsupported platforms.
- The formal target path is explicitly pinned to the current Windows deployment path; a future deployment path change requires a reviewed runner change.
- Formal execution still requires a fresh operational gate and a new Phase B approval; this report is not that approval.
- Runtime startup and post-migration smoke remain future-window actions.
- Existing unrelated working-tree changes from Tasks 002–004 remain uncommitted and were not reset.

## 20. Recommended Next Action

- Keep the formal service stopped until a new migration window is explicitly opened.
- In the next approved window, run PRECHECK, then DRY-RUN, review their outputs, and only then run EXECUTE with the exact approval token.
- Revalidate the formal database, runtime startup and read-only smoke paths after apply.
- Do not run Task 005 Phase B from this task and do not start Task 006 implicitly.

Task 005A completion boundary reached. No commit/push/PR/deploy was performed.
