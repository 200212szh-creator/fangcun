# ADR-022 — Production Migration Rollback Strategy

Status: LOCKED FOR FANGCUN 1.0 READINESS

Date: 2026-09-09

## Decision

For a formal 0003 migration, verified backup restore is the primary rollback strategy. A down migration is a rehearsal and an isolated diagnostic aid, not the default production recovery mechanism. This task does not execute either strategy against the formal database.

## Rollback triggers

Trigger rollback when preflight or post-migration validation fails, migration history is inconsistent, integrity or foreign-key checks fail, Work backfill invariants fail, startup or core smoke tests fail, or the observation window shows a migration-caused data or compatibility regression.

## Required sequence

1. The designated operator and migration approver stop the app and write traffic.
2. Preserve the failed database file and all sidecars as a timestamped failure snapshot; never overwrite it.
3. Restore only the already verified backup to the formal target using an atomic replacement procedure with an explicit confirmation gate.
4. Validate the restored copy before replacement and validate the formal target after replacement: schema, history, integrity, quick check, foreign keys, and baseline counts.
5. Start the app only after validation passes, then run smoke tests and record the observation window.

## Partial rollback prevention

Do not mix selected table restoration with a versioned migration rollback. The failed snapshot, verified backup hash, migration history, operator identity, and validation output form one evidence bundle. Legacy fields and the compatibility adapter remain in place throughout observation and are not removed as part of rollback.

## Approval

Formal execution requires a separate approved migration window and explicit service-stop and target-path attestation. Task 004 provides the preflight and restore-verification tools but does not grant or exercise formal write authority.
