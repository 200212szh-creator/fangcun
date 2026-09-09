# Fangcun 1.0 — 0003 Production Migration Runbook

This runbook is an approval-stage operating plan. It is not an instruction that formal migration is currently approved. Task 004 performs no formal database mutation.

## PRE-MIGRATION

1. Stop the Fangcun app and any process that can write the formal SQLite file.
2. Confirm the formal database target, absolute path, release environment, and service state with a second operator.
3. Run the read-only preflight with explicit paths and service attestation:

   `npm run db:preflight -- --target=FORMAL --allow-formal-readonly --database=<absolute-formal-db> --backup=<absolute-backup> --service=stopped`

4. Create a backup using the approved runtime maintenance process. Do not copy a live WAL database by hand.
5. Run backup validation and isolated restore verification. Formal restore is not performed by the verification command:

   `npm run db:restore:verify -- --target=ISOLATED --backup=<absolute-backup>`

6. Record edition, copy, loan, annotation, and location counts, plus the complete `schema_migrations` history and current migration ID.

## MIGRATION

7. Obtain the migration-window approval and re-confirm the target path.
8. Apply 0003 with the approved migration runner only; do not use application startup as the migration mechanism.
9. Validate the `0003_works` record and expected Work schema.
10. Run schema, integrity, quick-check, and foreign-key validation.
11. Compare counts with the pre-migration evidence.
12. Verify every Edition has exactly one Work, Work/Edition invariants hold, and the conservative one-Edition-to-one-Work backfill did not merge records.

## SMOKE TEST

13. Start the app against the confirmed target.
14. Exercise startup, Collection, Book Detail, Search, Add Book, Edit, Loans, Annotations, Import, Export, backup, and restart. Record errors and screenshots/log references as required by the change window.

## OBSERVATION

15. Keep legacy fields and the compatibility adapter unchanged during the observation window.
16. Re-run read-only validation after the first use period and after restart.
17. Record application errors, schema history, counts, backup status, and Windows runtime health before closing the window.

## ROLLBACK

18. Stop the app and write traffic.
19. Preserve the failed formal database and sidecars as an immutable failure snapshot.
20. Restore the verified backup atomically; do not perform a partial table rollback.
21. Validate restored schema, migration history, integrity, foreign keys, and baseline counts.
22. Start the app only after the validation evidence is accepted, then repeat smoke tests and extend observation if necessary.

## Exit criteria

The window closes only when migration history is consistent, all validation checks pass, the smoke/observation evidence is recorded, and the approver accepts the evidence bundle. A failed or unverified backup is an immediate NO-GO.
