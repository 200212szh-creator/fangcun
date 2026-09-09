# Fangcun v1 Task 006E — Release Provenance Hardening & GitHub Checkpoint

## 0. Metadata

- Date: 2026-09-09
- Scope: release provenance hardening, activation guard, Git audit, validated GitHub checkpoint
- Explicit boundary: no new migration, no formal write-smoke, no formal fixture, no external deploy
- Formal database: `D:\方寸数据\data\library.db`

## 1. Repository Identity

- Repository root: `D:\图书库`
- Repository: `200212szh-creator/fangcun`
- Remote: `https://github.com/200212szh-creator/fangcun.git`
- Branch: `main`

The repository identity and target remote were confirmed before any commit or push operation.

## 2. Starting Git State

- HEAD before Task 006E: `3b14fe6` (`docs: finalize release verification`)
- `origin/main` matched the starting local HEAD
- The working tree contained the validated Task 001–006D implementation, tests, migration runbooks, and upgrade reports, plus the Task 006E changes recorded in this report.
- No rebase, reset, force operation, branch deletion, or history rewrite was used.

## 3. Sensitive Data Audit

`.gitignore` covers databases, SQLite WAL/SHM files, `.env` secrets, logs, runtime release output, caches, test output, backups, and build output. The only tracked environment file is `.env.example`.

The following were excluded from the checkpoint:

- `D:\方寸数据` and all formal database/backups
- runtime release directories, transient state, logs, and generated artifacts
- the generated design screenshot `design-system/default/references/fangcun-editorial-home-v2.png`
- `.next`, `node_modules`, test results, and temporary databases

The two launcher source files needed for activation provenance are explicitly tracked; runtime release contents remain ignored.

No formal database, backup, secret, token, credential, PID file, cache, or temporary database is included in the intended checkpoint.

## 4. Release Provenance Problem

Task 006C showed that the source tree could contain the repaired Work-aware write path while the formal launcher still ran the older release `2026-09-08_223319`. The prior release builder recorded only a build ID, and the watchdog could fall back to the newest directory when the current-release pointer was missing or invalid. This allowed an old release to start without a clear source binding.

## 5. Provenance Design

The release builder now refuses to create a release unless Git provides a 40-character commit SHA. Each new `release.json` records:

- release name and version
- build ID
- source commit SHA
- `dirty` state
- UTC build timestamp
- provenance format version

`lib/runtime/provenance.ts` provides one runtime reader and a completeness check. A dirty build is allowed only when its dirty state is reported explicitly.

## 6. Runtime Health Contract

`/api/health` now reports:

- `release` and `releaseDir`
- `buildId`
- `sourceCommit`
- `dirty`
- `buildTimestamp`
- `provenanceStatus`
- `migrations`, `currentMigration`, `schemaMigrationState`, and `migrationState`

When running under the formal release launcher, incomplete provenance makes health degraded instead of silently presenting the process as healthy. The migration values are read-only observations from the existing database; this task did not run a migration.

## 7. Release Activation Guard

The watchdog now requires the current-release pointer, refuses empty or invalid pointers, validates the pointed release provenance, and no longer falls back to the newest old release. The service host receives the pointer path and fails closed if the pointer, release directory, release metadata, or build ID do not agree. The promotion script applies the same metadata checks before changing either release pointer.

## 8. Tests

- Provenance integration tests: 2 passed
- Existing Vitest suite: passed; the pre-existing migration suite retained its one intentional skipped case
- Manual release-builder verification: generated release metadata contained a 40-character source commit and `dirty=true` while the working tree was uncommitted
- E2E: 32/32 passed, 16 Chromium and 16 mobile
- E2E server used an isolated temporary database and port 3017; formal database was not used by E2E

## 9. Quality

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS
- `npm run build`: PASS
- `npm run db:validate`: PASS, read-only formal target
- `npm run test:e2e -- --reporter=list`: PASS, 32/32

## 10. Final Diff Audit

The reviewed categories were:

- migration files and isolated/production-safe migration runners
- catalog adapter and Work–Edition–Copy compatibility boundary
- E2E isolation and fixture cleanup
- Task 006 incident repair and write-smoke revalidation reports
- release provenance and activation guard
- upgrade ADRs and Task 001–006 reports

`git diff --check` passed. No formal DB, backup, secret, temporary fixture, or unintended runtime output is part of the intended checkpoint. The generated design screenshot was deliberately left out.

## 11. Commit

- Commit: pending final checkpoint creation
- Message: `fangcun v1: establish verified Work model baseline`

## 12. Push

- Push: pending checkpoint commit verification
- Destination: confirmed `origin` Fangcun remote on `main`
- Force push / history rewrite / PR / merge: not allowed and not used

## 13. Remote Verification

Pending until the local checkpoint commit is created and pushed. Verification will compare local `HEAD` with `origin/main`.

## 14. Formal DB Verification

Read-only validation target: `D:\方寸数据\data\library.db`

- migration history: `0001_archive_fields`, `0002_loans_annotations`, `0003_works`
- current migration: `0003_works`
- Work schema state: `ready`
- Works: 2
- Editions: 2
- Copies: 2
- Active Copies: 2
- Locations: 2
- Loans: 0
- Annotations: 0
- integrity: `ok`
- quick check: `ok`
- foreign-key violations: 0
- formal database mutation during Task 006E: NO

The `0003_works` state was already part of the Task 006D restored baseline. Task 006E executed no formal migration, write-smoke, or fixture.

## 15. Remaining Risks

- Releases created before Task 006E do not contain complete provenance and will now be rejected by the formal activation path until rebuilt.
- A release built from a dirty tree is operationally identifiable but should be replaced by a clean checkpoint release for production use.
- Existing local installations need to use the updated tracked launcher guard when their launcher files are refreshed.

## 16. Recommended Task 007

Task 007 — Location Model Migration

## 17. Recommended UI-001

UI-001 — Figma Book Cover + Book Row Implementation

STOP AFTER TASK 006E.
