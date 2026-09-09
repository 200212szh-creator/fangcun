# Fangcun 1.0 Task 007 — Location Model Migration Report

## 0. Metadata

- Task: Task 007 — Location Model Migration
- Date: 2026-09-09
- Repository: 200212szh-creator/fangcun
- Base commit: b80528cb4e5a340d36f4fe1fbc4752e481cb2e29
- Branch: engineering/task007-location
- Worktree: D:\图书库\.worktrees\task007-location
- Main worktree: D:\图书库
- Pre-edit main status: one unrelated untracked design reference, design-system/default/references/fangcun-editorial-home-v2.png
- Formal database: D:\方寸数据\data\library.db
- Formal database writes in Task 007: none
- Formal migration executed in Task 007: none
- Local checkpoint commit: final local engineering checkpoint on this branch

Task 007 was implemented only in the dedicated engineering worktree. The main branch and the UI-001 working tree were not used for implementation.

## 1. Existing Location Model

The audit was completed before schema work began.

The current model is a single shelf_locations table, not a separate spatial database. Its existing columns are:

- id
- name
- parent_id
- room
- user_id
- sort_order
- active

The existing id is already a stable UUID-like identity. parent_id and room are present, but the current runtime does not enforce a hierarchy or parent type. The formal rows use top-level legacy shelf semantics. No foreign key is declared for parent_id.

owned_copies currently carries both legacy and shelf-oriented location data:

- location: free text
- shelf_location_id: reference by convention only; no declared foreign key
- shelf_slot: free-form slot value
- shelf_coordinate: display-oriented coordinate value
- location_sort_order: optional copy ordering value

The current copy-to-location relationship is therefore application-level and nullable. Existing copies can retain a text location, a shelf id, a slot, or a combination.

loans has no original-location columns. Creating a loan records the copy and borrower data only. Returning a loan changes loan status and does not restore a prior copy location.

Current listShelves ordering is global sort_order followed by name. Shelf creation uses the next global sort order. Parent cycles, orphan parents, and invalid copy shelf ids are not validated by the legacy implementation.

## 2. Consumer Audit

| Consumer | Existing assumption | Task 007 treatment |
| --- | --- | --- |
| Repository | Maps location, shelf id, slot and coordinate directly to OwnedCopy | Keeps legacy fields and adds stable location references |
| Add-book flow | Writes shelfLocationId, shelfSlot and generated shelfCoordinate | Preserved; validated when the normalized schema exists |
| Book detail/edit | Edits shelf, slot, coordinate and legacy location text | Preserved; backend gains safe location validation |
| Shelf map | Uses shelfLocationId and fixed slot presentation | Preserved as compatibility UI; no UI redesign in this task |
| Manage page | Manages flat shelves, active state and sort order | Existing shelf DTO remains available; normalized DTO is added |
| Loans | Per-copy loan panel; no original location model | Backend captures original location and restores it on return |
| Search | Discovery search returns external book/paper candidates; no location filter | No search UI redesign; location DTO is available for a future collection query |
| Import | Imported location text and shelf fields | Import accepts shelfLocationId/locationId, slot, coordinate and order while retaining location text |
| Export | Exported version 1 book data and shelf-compatible fields | CSV and JSON retain existing fields and add normalized location information |
| Catalog adapter | One write boundary creates Edition and Copy | Uses the same boundary and rejects unknown normalized locations |
| APIs | Shelf routes expose compatibility shelf records | Adds GET/POST locations and includes locations in metadata/export |

No current consumer was found that requires automatic parsing of a display code into a physical hierarchy. Display strings remain display data.

## 3. Formal Baseline

The formal database was inspected read-only at D:\方寸数据\data\library.db.

- Migration history: 0001_archive_fields, 0002_loans_annotations, 0003_works
- Current migration: 0003_works
- Works: 2
- Editions: 2
- Copies: 2
- Active Copies: 2
- Locations: 2
- Loans: 0
- Annotations: 0
- Integrity check: ok
- Quick check: ok
- Foreign-key violations: 0
- Orphan parent locations: 0
- Orphan copy location references: 0

The two formal locations remain:

| id | name | parent_id | room | sort_order | active |
| --- | --- | --- | --- | ---: | ---: |
| 73f58e9c-edc8-407f-8ffe-74a91b589620 | 卧室书橱一层 | null | null | 0 | 1 |
| 52cf67bc-24e2-4a12-a2ec-4e90323bd727 | 卧室书橱二层 | null | empty string | 1 | 1 |

The two formal copies retain their existing location values:

| copy id | shelf_location_id | shelf_slot | shelf_coordinate | location |
| --- | --- | --- | --- | --- |
| 30617184-a7df-4e6f-98db-347275b89be0 | 52cf67bc-24e2-4a12-a2ec-4e90323bd727 | 1 | 卧室书橱-1 | empty string |
| c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e | 73f58e9c-edc8-407f-8ffe-74a91b589620 | 2 | null | null |

The final read-only audit confirmed that the formal shelf_locations and loans schemas still have their original columns only; no 0004 columns or 0004 history record exist.

The Task 006E promotion backup remains:

- D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T10-57-34-004Z.db
- SHA-256: 8dcd0a1f0dd9b9145605a420333e1be72c66a16a9a6d17648251dff665f0d10a

The live formal file could not be directly hashed during the final audit because the active service held the file open. This produced no write and did not prevent the read-only logical/schema verification.

## 4. Target Semantics

The target conceptual hierarchy is:

Room → Zone → Shelf → Level → optional Slot

All normalized nodes continue to use the existing shelf_locations table. There is no parallel location database.

Each node has:

- stable internal id
- human display name
- optional display code
- parent id
- node type
- sibling-local ordering
- active/inactive status
- derived breadcrumb
- derived availability

Legacy records are represented as type legacy. Existing parent, room, name, id and order values are not inferred into a new hierarchy.

Display codes such as A3-02-04 are not used as identity. They are mutable display data and may be absent.

## 5. Schema Design

The next migration is 0004_location_model.

It is additive and extends the existing tables:

On shelf_locations:

- location_type TEXT NOT NULL DEFAULT legacy
- display_code TEXT

On loans:

- original_location_id TEXT
- original_location_slot TEXT
- original_location_coordinate TEXT
- original_location_text TEXT
- original_location_sort_order INTEGER
- original_location_captured INTEGER NOT NULL DEFAULT 0

Indexes added by 0004:

- idx_shelf_locations_parent_order
- idx_owned_copies_location_owner
- idx_loans_original_location

No new Room, Zone, Shelf, Level or Slot tables are introduced. The node type and parent relationship are normalized within the existing location table, which preserves existing identity and application ownership.

No cloud, multi-user, contributor, or Work-model concepts were added.

## 6. Compatibility Strategy

The runtime detects whether the complete 0004 location schema is present.

When it is absent:

- legacy shelf queries continue to use the original columns
- existing ShelfLocation compatibility DTOs remain available
- legacy copy location fields remain readable and writable
- loans keep their pre-0004 behavior

When it is present:

- normalized Location DTOs are available
- parent type, parent existence and cycle checks are enforced
- copy location ids are checked before writes
- sibling order is scoped by parent
- loans capture and restore original location snapshots

No automatic relocation, code parsing, room inference, or legacy identity replacement occurs.

## 7. Migration Design

Forward migration is implemented in migrations/0004_location_model.up.sql and scripts/migrate-v4.ts.

The runner is fail-closed:

- requires FANGCUN_MIGRATION_TARGET=ISOLATED
- requires an explicit absolute database path
- requires the database to be inside the temporary directory
- requires migrations 0001, 0002 and 0003
- refuses partial or unrecorded 0004 schema
- applies all changes and records 0004 in one transaction
- validates counts, legacy shelf rows, copy location rows, integrity, quick check, foreign keys and orphan references

The runner supports:

- --dry-run: read-only pre-apply validation and expected-change output
- first execution: applied
- second execution: already_applied
- rollback rehearsal through scripts/rollback-location-migration.ts

Rollback is intentionally conservative. It refuses to run when normalized node types, display codes, loan snapshots, or captured original-location fields are populated. A clean rollback rehearsal drops only the 0004 additions and removes the 0004 history record while preserving legacy rows.

The checked-in 0004 SQL SHA-256 is 63cb13d5fbde39b6010866ad28d078c6661fe45d780e1a378f7ccd829c789dcb.

During regression verification, the existing 0003 production runner was found to hash Windows CRLF bytes while its verified artifact hash represents LF bytes. The runner now canonicalizes SQL line endings before the existing verified hash gate. It does not change 0003 SQL or execute a migration.

## 8. DTO Contract

The stable LocationDto contract provides:

- id
- name
- type
- displayCode when present
- parentId
- breadcrumb items containing id, name, type and optional code
- sortOrder
- active
- status
- available
- legacy room value when present

OwnedCopy exposes locationInfo as a reference DTO rather than exposing raw database columns as the future UI contract. The reference includes stable id when present, display name, code, breadcrumb, slot, coordinate and legacy detail.

Compatibility ShelfLocation DTOs remain available for current screens and APIs.

## 9. Loan Integration

Creating a loan on a normalized schema captures the Copy's current location into the loan:

- original location id
- original slot
- original coordinate
- original legacy detail
- original sort order
- captured flag

The loan read DTO can represent:

- originalLocation
- currentLocation

Moving the Copy while it is loaned changes currentLocation only. Returning the loan restores the complete captured location snapshot and then marks the loan returned. A pre-0004 loan without a captured snapshot is not guessed or relocated.

The Loans UI was not redesigned. Location Code / Detail remains a provisional backend contract for future UI work.

## 10. Search / Import / Export

Search remains an external discovery workflow and does not gain a new location search UI in Task 007. The stable location DTO and location API are ready for a future collection-browsing query without coupling that UI to raw columns.

Import compatibility:

- existing location text is retained
- shelfLocationId and locationId are accepted
- shelfSlot, shelfCoordinate and locationSortOrder are accepted
- unknown normalized location ids are rejected when 0004 is active

Export compatibility:

- JSON export remains version 1
- existing books and shelves fields remain
- JSON adds locations and copy locationInfo
- CSV retains location and adds shelfLocationId, shelfSlot, shelfCoordinate and locationSortOrder

The isolated probe exercised both the import endpoint and exportData path.

## 11. Isolated Migration Results

The isolated migration suite used disposable SQLite databases only.

Results:

- legacy 2-location snapshot preserved: PASS
- legacy 2-copy location snapshot preserved: PASS
- first 0004 run: PASS
- 0004 second run returns already_applied: PASS
- explicit --dry-run leaves history and rows unchanged: PASS
- Room → Zone → Shelf → Level → Slot creation: PASS
- hierarchy breadcrumb read: PASS
- invalid parent type rejected: PASS
- fixture Copy move: PASS
- sibling ordering scoped by parent: PASS
- loan original/current location behavior: PASS
- return-to-original-location restoration: PASS
- in-use location deletion protected: PASS
- no orphan parent locations: PASS
- no orphan copy location references: PASS
- import compatibility: PASS
- export compatibility: PASS
- populated rollback refused: PASS
- clean rollback rehearsal: PASS

专项 test result: 1 test file, 2 tests passed in tests/location-migration.integration.test.ts.

## 12. Regression Results

Full Vitest regression:

- 8 test files passed
- 22 tests passed
- 1 existing skipped test

The previous 0003 production-runner hash gate mismatch was repaired as a Windows line-ending canonicalization issue. After that minimal repair, the full regression suite passed without changing the migration target or formal database.

## 13. E2E

The full Playwright E2E suite ran against its isolated runtime, temporary database and isolated port.

- 32 tests passed
- desktop and mobile projects passed
- Task 004 and Task 006 isolated baseline assertions were updated from 0003 to the new 0004 isolated migration chain
- formal port 127.0.0.1:3000 was not reused
- formal database was not used

The write-smoke test's intentional NOT NULL error log is part of its atomic-failure assertion and ended in PASS.

## 14. Quality

- npm run typecheck: PASS
- npm run lint: PASS
- npm test: PASS, 22 passed and 1 skipped
- npm run build: PASS
- npm run db:validate: PASS, read-only formal target
- npm run test:e2e: PASS, 32 passed
- git diff --check: PASS

The build emitted only the existing multiple-lockfile workspace-root warning. No lint warnings remain.

## 15. Formal DB Changes

NO.

Task 007 did not:

- write D:\方寸数据\data\library.db
- execute 0004 against the formal database
- add 0004 history to the formal database
- alter formal Location columns
- alter formal Copy rows
- alter formal loan or business data

The final read-only inspection still reports 0001, 0002 and 0003 only, Works 2, Editions 2, Copies 2, Active Copies 2, Locations 2, Loans 0 and Annotations 0.

## 16. Risks

- Legacy locations remain intentionally untyped in user meaning; no automatic hierarchy mapping is attempted.
- Legacy copy location fields remain nullable and are not converted into display codes.
- Parent/type rules are enforced by the repository and should remain the only normalized write boundary.
- Display-code uniqueness is local to the owner scope and should not be treated as global identity.
- Existing UI screens still use compatibility ShelfLocation fields; a future UI should consume LocationDto.
- The live formal database file can be read while the service is active, but direct file hashing requires a coordinated service stop window.
- A formal 0004 run still requires a fresh backup, service attestation, preflight and explicit production approval.

## 17. Production Migration Readiness

READY for a separate, explicitly approved formal migration phase.

The engineering migration is isolated, additive, transactional, idempotent, rollback-rehearsed and compatible with the current runtime. Production execution remains intentionally unperformed and must be a separate approval event.

## 18. UI Contract for Location

READY.

No UI redesign was performed. Current screens retain their compatibility behavior. Future location UI can consume GET /api/catalog/locations and the LocationDto contract, including stable identity, breadcrumb, type, display code, sibling order, status and availability.

Current shelf endpoints remain available for existing screens. The backend loan contract is prepared for original and current location display without changing the existing Loans layout.

## 19. Recommended Next Action

Keep the formal database at the current 0003 state. For a later production phase:

1. schedule a service stop window;
2. create and verify a fresh formal backup;
3. run a formal read-only preflight against the exact database and backup;
4. obtain explicit approval for 0004_location_model;
5. execute the production migration once with the verified runner;
6. validate migration history, counts, integrity, foreign keys, legacy rows and Copy location preservation;
7. only then plan a separate UI implementation using LocationDto.

STOP AFTER TASK 007.
