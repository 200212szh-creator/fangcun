# Fangcun 1.0 Task 007A — Location Integration & Production Migration Readiness

## 0. Metadata

- Repository: 200212szh-creator/fangcun
- Verification date: 2026-09-10
- Verified baseline: b80528cb4e5a340d36f4fe1fbc4752e481cb2e29
- Task007 branch: engineering/task007-location
- Task007 commit: b2e846fd81fe82bc7c4ab5a41b17a78c3594af9e
- Task007 worktree: D:\图书库\.worktrees\task007-location
- Integration branch: engineering/task007a-integration
- Integrated source commit: 1416c45bd955b7a39c84d7573ea0fb26fa3ec024
- Formal database: D:\方寸数据\data\library.db
- Formal migration state: 0001, 0002, 0003 only
- Formal 0004 execution in Task007A: none
- Formal database mutation in Task007A: none

Task007A integrates the verified Location implementation, adds a dedicated
production-safe 0004 runner, validates the new release against a pre-0004
database, and stops before formal migration.

## 1. Task007 Diff Audit

The Task007 diff was inspected before integration with git log, status, diff,
diff stat and diff check.

- Compared commits: b80528c to b2e846f
- Changed files: 25
- Diff size: 1,239 insertions and 31 deletions
- git diff --check: PASS
- Audited areas: 0004 SQL, schema truth, Location model and repository, DTOs,
  API routes, Copy movement, Loan original-location behavior, import/export,
  compatibility adapters, tests and documentation
- Integration path: normal cherry-pick into a branch created from the verified
  b80528c baseline
- No dangerous rebase, reset, force push or history rewrite

The change set contains no formal database files, backups, secrets, unrelated
UI redesign, deployment artifact, node_modules content or generated user data.
The only runtime-related change in the Task007 diff is the already-audited
line-ending normalization in the existing 0003 hash gate.

## 2. Migration Contract

The migration is migrations/0004_location_model.up.sql and is additive.

It adds two columns to shelf_locations:

- location_type, default legacy
- display_code

It adds six original-location columns to loans:

- original_location_id
- original_location_slot
- original_location_coordinate
- original_location_text
- original_location_sort_order
- original_location_captured, default 0

It adds three indexes:

- idx_shelf_locations_parent_order
- idx_owned_copies_location_owner
- idx_loans_original_location

The migration does not delete rows, replace existing IDs, rewrite legacy
location meaning, infer hierarchy from display codes, or change Copy location
references. Existing shelf_locations rows remain legacy nodes. The migration
records 0004 in schema_migrations only after the additive changes succeed in
one transaction.

The isolated migration runner is scripts/migrate-v4.ts. The conservative
rollback rehearsal is scripts/rollback-location-migration.ts. Rollback refuses
to run when normalized location data or captured Loan snapshots are populated.
Second execution is explicitly idempotent in the isolated runner and the
production-safe runner refuses a target that is no longer pre-0004.

## 3. Migration SQL Hash

- File: migrations/0004_location_model.up.sql
- Canonical SHA-256: 63cb13d5fbde39b6010866ad28d078c6661fe45d780e1a378f7ccd829c789dcb
- Hash method: UTF-8 SQL with CRLF and CR normalized to LF
- Hash gate: PASS

No SQL content was changed after the final hash was recorded.

## 4. Location DTO Contract

The UI-facing contract is LocationDto. Database-only column names are not
exposed as the long-term UI contract.

| Field or concept | API field | Status |
| --- | --- | --- |
| stable identity | id | LOCKED |
| node type | type | LOCKED |
| display name / label | name | LOCKED |
| optional display code | displayCode | LOCKED |
| parent identity | parentId | LOCKED |
| hierarchy path | breadcrumb | LOCKED |
| sibling order | sortOrder | LOCKED |
| node enabled state | active | LOCKED |
| derived state | status | LOCKED |
| derived availability | available | LOCKED |
| legacy room detail | room | PROVISIONAL |

LocationDto also keeps the legacy type value legacy. The supported normalized
node types are room, zone, shelf, level and slot. Breadcrumb items carry id,
name, type and an optional code.

OwnedCopy location information is represented through LocationReferenceDto:
id, name, code, breadcrumb, slot, coordinate and legacy detail. This keeps raw
SQLite fields behind the repository boundary.

## 5. UI Handoff

No UI work was performed in Task007A.

The stable handoff is:

- GET /api/catalog/locations returns an items array of LocationDto values.
- POST /api/catalog/locations accepts name, type, parentId, room and
  displayCode.
- Existing shelf endpoints remain available for compatibility screens.
- Copy forms can use id, breadcrumb, displayCode, slot and coordinate without
  depending on raw database columns.
- Location status and availability are derived by the backend and should not be
  recomputed by the UI.
- A future location UI should not infer hierarchy from a display code.

The current product UI can continue to run against the 0003 schema because the
repository detects whether the complete Location model is present.

## 6. Loan Compatibility

Status: PASS.

The isolated Location probe verified:

- Copy.currentLocation reflects the Copy's current shelf, slot and coordinate.
- Loan.originalLocation captures the Copy location at loan creation.
- Moving a loaned Copy to an alternative normalized location updates
  currentLocation without overwriting originalLocation.
- Returning the Loan restores the captured original location atomically.
- Existing due-soon and overdue values remain derived Loan display states and
  are unrelated to Location storage.
- No parallel Loan location model was introduced.

The current return action is intentionally return-to-original. A separate
product action for returning to an alternative location is not part of the
existing API and should be designed separately if required; it must continue
to preserve the distinction between originalLocation and currentLocation.

## 7. Integration Strategy

The integration branch was created from the verified b80528c baseline. Task007
commit b2e846f was then cherry-picked normally, producing integration commit
9519193. The dedicated production-safe runner and its tests were added in
e067427, followed by the verified legacy-backup sidecar compatibility fix in
1416c45.

The Work model, Task006E runtime provenance and watchdog safety changes remain
in the integrated history. The formal database was only opened read-only for
validation. No production 0004 command was executed.

## 8. Integrated Git State

- Branch: engineering/task007a-integration
- Source integration commit: 1416c45bd955b7a39c84d7573ea0fb26fa3ec024
- Task007 commit included: b2e846fd81fe82bc7c4ab5a41b17a78c3594af9e
- Base commit preserved: b80528cb4e5a340d36f4fe1fbc4752e481cb2e29
- Integration method: normal cherry-pick
- Working tree before this report: clean
- Sensitive or user-data paths in the code diff: none

The report commit is documentation-only and does not change the release
source commit recorded above.

## 9. Quality

- npm run typecheck: PASS
- npm run lint: PASS, zero errors and zero warnings
- npm test: PASS, 9 test files, 25 passed, 1 skipped
- npm run build: PASS
- npm run db:validate: PASS, formal read-only target
- npm run test:e2e: PASS, 32/32
- git diff --check: PASS

The only build message was the existing Next.js multiple-lockfile workspace
root warning. It did not affect the build or release provenance.

## 10. New Release

- Release: runtime/releases/2026-09-09_Task007A_location_verified
- Release name: 2026-09-09_Task007A_location_verified
- Build ID: Inn8vRlrlKz0c8qQqPqjL
- Source commit: 1416c45bd955b7a39c84d7573ea0fb26fa3ec024
- Release created by: scripts/build-release.ps1
- Previous Task006E release reused: no
- Activated as formal runtime: no
- Deployed externally: no

## 11. Runtime Provenance

The release release.json and health response agree on:

- release and version: 2026-09-09_Task007A_location_verified
- build ID: Inn8vRlrlKz0c8qQqPqjL
- source commit: 1416c45bd955b7a39c84d7573ea0fb26fa3ec024
- dirty: false
- provenanceStatus: ok
- schemaMigrationState: ready

The release was started only in an isolated runtime on port 3018. The formal
release pointer and formal service were not changed.

## 12. Pre-0004 Compatibility

Status: PASS.

The new release was started against a disposable database containing
0001_archive_fields, 0002_loans_annotations and 0003_works, with 0004 absent.
The isolated health check returned:

- status: ok
- database: ok
- provenanceStatus: ok
- currentMigration: 0003_works
- schemaMigrationState: ready
- migrations: 0001, 0002, 0003
- dirty: false
- port: 3018

The isolated process was then closed and its temporary database and runtime
directory were removed. The release was not activated against the formal
database.

## 13. Production Runner

The dedicated runner is scripts/migrate-v4-production.ts and is registered as:

    npm run db:migrate:location:production

It defaults to REFUSE when explicit arguments are absent. It requires:

- explicit mode: PRECHECK, DRY-RUN or EXECUTE
- explicit target: FORMAL or ISOLATED
- exact formal path for FORMAL:
  D:\方寸数据\data\library.db
- expected history exactly 0001, 0002 and 0003 before 0004
- explicit service attestation: stopped for FORMAL, isolated for ISOLATED
- no Fangcun writer and no listener on 127.0.0.1:3000 for FORMAL
- explicit verified backup path and sidecar
- backup SHA-256 and integrity marker
- migration SQL SHA-256
- Works, Editions, Copies, Active Copies, Locations, Loans and Annotations
  baseline counts
- integrity_check, quick_check, foreign_key_check and Copy location reference
  validation
- isolated backup restore rehearsal
- EXECUTE approval token only for execution

The formal EXECUTE token is EXECUTE_0004_LOCATION_MODEL. The runner never
reuses EXECUTE_0003_WORKS. It fails closed on path drift, active writers,
history drift, partial schema, baseline drift, backup mismatch, SQL mismatch,
integrity/FK failure, unknown legacy location state and unexpected Copy
location references. It does not attempt automatic repair.

FORMAL EXECUTE was not invoked in Task007A.

## 14. Approval Gates

| Gate | Result |
| --- | --- |
| Task007 diff audit | PASS |
| additive migration contract | PASS |
| LocationDto contract review | PASS |
| normal integration path | PASS |
| typecheck, lint, tests and build | PASS |
| full E2E | PASS, 32/32 |
| new release provenance | PASS, dirty=false |
| pre-0004 runtime compatibility | PASS |
| exact formal database path | PASS |
| exact pre-0004 history | PASS |
| formal service stopped | PASS |
| formal 3000 port released | PASS |
| no Fangcun writer | PASS |
| formal backup and hash | PASS |
| SQL hash | PASS |
| formal read-only dry-run | PASS |
| formal 0004 execution | NOT RUN BY DESIGN |

The active Fangcun host PID 34488 and release server PID 36304 were verified
by the project service state and exact command lines, then stopped through the
existing service-host SIGTERM graceful shutdown path. No forced termination
was used. A post-stop scan found both PIDs exited, no writer and no listener
on 127.0.0.1:3000.

## 15. Dry Run

Formal-target DRY-RUN: PASS.

Target:

    D:\方寸数据\data\library.db

The runner reported:

- current history: 0001_archive_fields, 0002_loans_annotations, 0003_works
- expected migration: 0004_location_model
- migration SQL SHA-256:
  63cb13d5fbde39b6010866ad28d078c6661fe45d780e1a378f7ccd829c789dcb
- legacy Locations: 2
- valid Copy location references: 2
- expected additions: 2 shelf location columns, 6 Loan location columns and
  3 indexes
- backup restore rehearsal: PASS
- GO / NO-GO: GO
- formalDatabaseMutation: false

The dry-run opened the formal database read-only and did not add 0004 history
or any 0004 column.

## 16. Negative Safety Tests

The isolated test suite covers all required fail-closed cases:

- A. missing approval token: PASS
- B. wrong approval token: PASS
- C. active service simulation: PASS
- D. wrong migration history: PASS
- E. backup hash mismatch: PASS
- F. SQL hash mismatch: PASS
- G. partial location schema: PASS
- no-write PRECHECK: PASS
- correct DRY-RUN with unchanged database hash and history: PASS
- post-validation transaction failure with unchanged database hash and history:
  PASS
- second execution safely refused as no longer pre-0004: PASS

The test file is tests/location-production-runner.integration.test.ts. All
fixtures are disposable files under the operating-system temporary directory.

## 17. Isolated Execute

Status: PASS.

Using an isolated 0003 copy only, the runner:

- accepted the explicit EXECUTE_0004_LOCATION_MODEL token
- applied 0004 in one transaction
- recorded 0004_location_model
- preserved all legacy shelf rows
- preserved all Copy location links and legacy location fields
- preserved table counts
- passed integrity, quick check, FK and reference validation
- safely refused a second execution

The existing rollback-location-migration.ts rehearsal then removed only the
isolated 0004 additions and history record, preserving the same legacy rows.
No formal database file was used in this execute or rollback rehearsal.

## 18. Formal DB Verification

The final formal database read-only probe reported:

- path: D:\方寸数据\data\library.db
- history: 0001_archive_fields, 0002_loans_annotations, 0003_works
- Works: 2
- Editions: 2
- Copies: 2
- Active Copies: 2
- Locations: 2
- Loans: 0
- Annotations: 0
- 0004 columns on shelf_locations: none
- 0004 columns on loans: none
- integrity_check: ok
- quick_check: ok
- foreign_key_violations: 0
- orphan Copy location references: 0
- formal 0004 history record: absent
- final file SHA-256: bc167910b7a03c4b3db00fcca9c8c6b378fad4975a449a47792122e2a7a12b57

The final post-dry-run probe was read-only. Formal business data and schema
remain unchanged at the verified 0003 state.

Verified Task006E backup:

    D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T10-57-34-004Z.db

- backup SHA-256: 8dcd0a1f0dd9b9145605a420333e1be72c66a16a9a6d17648251dff665f0d10a
- sidecar integrity: ok
- sidecar counts: Editions 2, Copies 2, Locations 2, Loans 0, Annotations 0
- backup schema history: 0001, 0002, 0003
- isolated restore rehearsal: PASS

## 19. Git Checkpoint

- Final integration branch: engineering/task007a-integration
- Final source commit used by the release: 1416c45bd955b7a39c84d7573ea0fb26fa3ec024
- Report is added as a documentation-only checkpoint after source verification.
- git diff --check: PASS
- no force push
- no PR or merge automation
- no external deployment
- push target: verified Fangcun remote, branch engineering/task007a-integration

The final checkpoint contains no formal database, backup, secret or user-data
artifact.

## 20. Production Migration Readiness

READY for a separate, explicitly approved production migration phase.

Task007A is complete because the Location implementation was audited and
integrated, all quality gates passed, the new release has clean provenance,
pre-0004 compatibility passed, the production-safe runner and dry-run passed,
isolated execute and rollback rehearsal passed, and the formal database
remained at 0001/0002/0003 with the verified baseline.

0004_location_model was not executed against the formal database.

## 21. Remaining Risks

- Legacy locations remain intentionally semantic-neutral. No automatic room,
  hierarchy or display-code inference is performed.
- Existing screens still use compatibility ShelfLocation fields and need a
  later UI handoff to LocationDto.
- If a future product requirement needs an explicit return-to-alternative Loan
  action, it needs a separate API/UI decision; current return restores the
  captured original location.
- Display codes are display data, not identity, and are unique only within the
  owner scope.
- The final formal migration still requires a new service window, fresh backup,
  preflight and explicit EXECUTE_0004_LOCATION_MODEL approval.
- The launcher left a stale service state file after graceful process exit;
  the watchdog rejects it because both recorded PIDs are absent. This should
  be cleaned up in a future runtime maintenance task, not during migration.

## 22. Recommended Task 007B

Task 007B — Controlled Production Location Migration

Keep the formal database at 0003 until the next task receives explicit
approval. In that separate task:

1. Confirm the service window and verify no Fangcun writer.
2. Create a fresh formal backup and independently verify its sidecar and hash.
3. Run the formal PRECHECK and DRY-RUN with the exact database path, baseline
   and SQL hash.
4. Obtain explicit approval for EXECUTE_0004_LOCATION_MODEL.
5. Execute 0004 exactly once through scripts/migrate-v4-production.ts.
6. Validate migration history, counts, integrity, FK, legacy locations, Copy
   location links and Loan compatibility.

STOP AFTER TASK 007A.
