# Fangcun 1.0 — Task 008C-R Production Contributor Write Smoke

Date: 2026-09-13
Status: COMPLETE

## 1. Scope and safety decision

Task 008C-R verified the formal Contributor create, read, search, edit, and persistence paths against the production Fangcun runtime. The fixture was intentionally written to the formal database during an exclusive maintenance window and was removed by restoring the single fresh pre-smoke backup created for this task.

The original Task 008C cleanup requirement was superseded. The product `DELETE /api/catalog/books/:copyId` remains a soft delete. No hard-delete API was added, the test-only cleanup endpoint was not used, and no raw SQL business cleanup was performed.

Only the following database state changes were allowed during the window:

- the Task008C-R fixture write through the real application API;
- the supported Contributor relation-order edit through the real application API;
- full formal database replacement from the validated fresh backup.

## 2. Authoritative baseline

Repository:

- `HEAD`: `90443d82303ce26e57c536b5398c23d64d39ea0e`
- `origin/main`: `90443d82303ce26e57c536b5398c23d64d39ea0e`
- working tree: clean before execution

Runtime:

- release: `2026-09-13_Task008B_PhaseA1_contributor_main_final`
- build ID: `WK8jgGgNr-Oya-8B8-6pL`
- executable source baseline: `b89ca628f332933e873db63266c9b0bc545e5a39`
- dirty: `false`
- provenance: `ok`
- formal database: `D:\方寸数据\data\library.db`

Formal migration history was exactly:

```text
0001_archive_fields
0002_loans_annotations
0003_works
0004_location_model
0005_contributors
```

The pre-smoke logical baseline was:

| Entity | Count |
| --- | ---: |
| Works | 2 |
| Editions | 2 |
| Copies | 2 |
| Active Copies | 2 |
| Locations | 2 |
| Loans | 0 |
| Annotations | 0 |
| Contributors | 2 |
| Edition Contributors | 2 |

The existing real Contributor relations were preserved as:

- `Erich Maria Remarque` → `author`, Edition `open--works-OL1209288W`
- `芥川龙之介` → `author`, Edition `32103d60-9f61-4540-98c0-8e43db788aed`

Baseline integrity checks were all successful: `integrity_check=ok`, `quick_check=ok`, and `foreign_key_check=0`.

## 3. Exclusive maintenance window

The maintenance window was enforced by disabling the exact scheduled tasks `Fangcun Archive Service` and `Fangcun Archive Health Recovery`, then stopping only the verified Fangcun service host with graceful `SIGTERM`.

Initial verified process chain:

- service host PID `23824`
- Next server PID `32812`
- server child of the service host
- `127.0.0.1:3000` owned only by PID `32812`

The stop completed without force termination. The host and server exited, port 3000 had no listener, no Fangcun writer remained, and both scheduled tasks were disabled before backup creation. The tasks were enabled again only when the verified release was restarted.

## 4. Fresh pre-smoke backup and rehearsal

The project’s existing production-safe maintenance convention uses `backups/pre-upgrade`; this fresh backup is the Task008C-R pre-smoke rollback anchor:

- path: `D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-13T14-32-10-858Z.db`
- creation timestamp: `2026-09-13T14:32:10.858Z` (from the timestamped artifact name)
- size: `217088` bytes
- SHA-256: `c8a7d5243ec74bbba0fce644ef466f5892b029cfc58c6fa61d59e8867bec79c6`
- sidecar: present and hash-matched

The project `verify-backup-restore.ts` performed an isolated restore rehearsal. It confirmed the complete 0001–0005 schema, baseline counts, Contributor tables and relations, `integrity_check=ok`, `quick_check=ok`, and `foreign_key_check=0`. The isolated copy was removed after validation; the fresh backup was retained.

## 5. Production fixture create

After restarting the exact verified release, the fixture was created once through `POST /api/catalog/books/from-edition`.

Unique fixture values:

- title: `FANGCUN_TASK008C_20260913T143418597Z`
- author: `TASK008C_AUTHOR_20260913T143418597Z`
- translator: `TASK008C_TRANSLATOR_20260913T143418597Z`
- source marker: `task008c-production-write-smoke`

Exact IDs recorded immediately after create:

| Object | ID |
| --- | --- |
| Work | `7fd74888-817a-442d-9be9-1deaccae3033` |
| Edition | `task008c-edition-20260913T143418597Z` |
| Copy | `d5570f01-0fdd-40e5-b18e-6bfbc2a9e2bb` |
| Author Contributor | `d00edb23-d505-4463-9612-43e7204a59ab` |
| Translator Contributor | `1003466a-21cf-46bd-9c99-b818f719f4c3` |

The two composite-key relations were:

| Contributor | Role | Order |
| --- | --- | ---: |
| `d00edb23-d505-4463-9612-43e7204a59ab` | `author` | 0 |
| `1003466a-21cf-46bd-9c99-b818f719f4c3` | `translator` | 1 |

Create validation passed. Temporary counts became Works 3, Editions 3, Copies 3, Active Copies 3, Contributors 4, and Edition Contributors 4. Locations remained 2; Loans and Annotations remained 0. No automatic merge with either existing Contributor occurred.

## 6. Read, DTO, and Search validation

The formal read path returned the fixture Work, Edition, Copy, and two structured Contributors with stable internal IDs. The legacy fields were also populated according to the current implementation contract:

- `authors`: `["TASK008C_AUTHOR_20260913T143418597Z"]`
- `translators`: `["TASK008C_TRANSLATOR_20260913T143418597Z"]`

The formal Search API found the same fixture Edition for all three queries:

- fixture title: PASS
- fixture author display name: PASS
- fixture translator display name: PASS

Contributor search was therefore exercised through the current existing local-search behavior; no Search contract was added or changed.

## 7. Supported edit validation

The current Contributor contract supports replacing edition Contributor relations, including canonical role and `orderIndex` values. The fixture was edited through `PATCH /api/catalog/books/{copyId}` to reorder the relations while preserving both roles and legacy fields:

- translator → `orderIndex=0`
- author → `orderIndex=1`

The edit was read back successfully. Contributor count remained 4, relation count remained 4, no duplicate Contributor was created, and both real Contributor relations remained unchanged.

## 8. Persistence restart

A second graceful restart was performed using the same verified release:

- before: host `30848`, server `24836`
- after: host `32916`, server `30144`

After restart, the fixture readback, structured Contributor DTO, and translator Search all passed. The writer chain remained single and the release provenance remained valid.

## 9. Pre-restore audit and formal restore

Before restore, the exact fixture inventory and temporary counts were recorded. The temporary state was Works 3, Editions 3, Copies 3, Active Copies 3, Contributors 4, and Edition Contributors 4, with no orphan, invalid role, or duplicate relation.

The runtime was then stopped gracefully again using the exact verified process identity. The smoke-time SQLite main file and its `library.db-wal` / `library.db-shm` sidecars were retained in:

`D:\方寸数据\recovery\task008c-r-formal-smoke-20260913T144226657Z`

The fresh backup was copied using `scripts/restore-db.ts`, independently validated as a staging database, and restored to the formal target using same-volume atomic replacement. No fixture-by-fixture deletion, SQL cleanup, or partial restore was used.

Restored formal database SHA-256:

`c8a7d5243ec74bbba0fce644ef466f5892b029cfc58c6fa61d59e8867bec79c6`

The forensic directory retains:

- `library.db.before-restore.db`
- `library.db-wal.before-restore`
- `library.db-shm.before-restore`

## 10. Post-restore validation

After restore, the formal database returned to the complete 0001–0005 history and the original logical baseline:

| Entity | Before smoke | After restore |
| --- | ---: | ---: |
| Works | 2 | 2 |
| Editions | 2 | 2 |
| Copies | 2 | 2 |
| Active Copies | 2 | 2 |
| Locations | 2 | 2 |
| Loans | 0 | 0 |
| Annotations | 0 | 0 |
| Contributors | 2 | 2 |
| Edition Contributors | 2 | 2 |

Exact fixture residue after restore:

- Work: 0
- Edition: 0
- Copy: 0
- Author Contributor: 0
- Translator Contributor: 0
- fixture relations: 0

The real Work, Edition, Copy, Contributor, relation, author, translator, location, and legacy field snapshots matched the pre-smoke baseline. Post-restore checks passed:

- orphan contributors: 0
- orphan relations: 0
- invalid roles: 0
- duplicate unintended relations: 0
- `integrity_check`: `ok`
- `quick_check`: `ok`
- `foreign_key_check`: `0`

The restored database SHA is not used as a byte-for-byte baseline criterion; the logical and integrity checks above are the acceptance criteria.

## 11. Final runtime read smoke

The exact release was restarted after restore and passed health/provenance validation:

- final host PID: `18880`
- final server PID: `31156`
- `127.0.0.1:3000`: Fangcun server only
- release: `2026-09-13_Task008B_PhaseA1_contributor_main_final`
- build ID: `WK8jgGgNr-Oya-8B8-6pL`
- source commit: `b89ca628f332933e873db63266c9b0bc545e5a39`
- dirty: `false`
- provenance: `ok`
- current migration: `0005_contributors`
- watchdog/recovery: safe
- scheduled tasks: enabled

Final non-destructive read smoke:

- Home: PASS
- Collection: PASS
- Book Detail: PASS
- Search: PASS
- Loans: PASS (both existing copies returned zero active loans)
- Locations: PASS
- Contributor-aware DTO/API: PASS

Both existing books were returned correctly with title, author, Contributor relation, location, copy, and Edition data. No additional migration or Contributor creation occurred during runtime start.

## 12. Change and closure status

- product code changed: NO
- UI changed: NO
- migration or schema changed: NO
- hard-delete API introduced: NO
- test-only cleanup endpoint used: NO
- raw SQL cleanup: NO
- force termination: NO
- formal user data loss: NONE
- fixture cleanup strategy: full restore from fresh pre-smoke backup

This report is the only intended repository change for Task008C-R. It is a docs-only checkpoint; the active runtime release does not require rebuilding.

Task008C-R: COMPLETE
Contributor production write verification: COMPLETE
Contributor engineering line: CLOSED
Ready for Runtime / Release Hardening: YES
