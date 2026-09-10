# Fangcun 1.0 Task 008 — Contributor Normalization

## 0. Metadata

- Repository: 200212szh-creator/fangcun
- Base main commit: 585f6d424685e0a788c28ff6b6f0ba60d5549e99
- Working branch: engineering/task008-contributors
- Isolated worktree: D:\图书库\.worktrees\task008-contributors
- Formal database: D:\方寸数据\data\library.db
- Rehearsal backup: D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db
- Migration: 0005_contributors
- Migration SQL SHA-256: 693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83
- Execution date: 2026-09-10
- Initial isolated worktree status: clean
- Formal database mutation by Task 008: NO

Task 008 introduces a structured Contributor model while preserving the existing
edition-level authors and translators JSON fields. The work ends at isolated
engineering readiness. It does not apply 0005 to the formal database, change the
Location or Work models, redesign the UI, deploy, or merge to main.

## 1. Current Contributor Model

The current production schema stores contributor credits only on book_editions:

- authors — JSON array of author display strings
- translators — JSON array of translator display strings

The current read path parses those two fields into BookEdition.authors and
BookEdition.translators. The current UI and API do not have separate Contributor
entities, stable contributor IDs, contributor roles beyond author and translator,
or cross-edition identity links.

No existing editor, compiler, illustrator, or other-role storage was found.
No external authority ID or contributor authority service was found.

## 2. Formal Read-Only Audit

The formal database was opened read-only after implementation and validated
without any write or migration command.

| Check | Result |
| --- | --- |
| Database path | D:\方寸数据\data\library.db |
| Migration history | 0001_archive_fields, 0002_loans_annotations, 0003_works, 0004_location_model |
| Works | 2 |
| Editions | 2 |
| Copies | 2 |
| Active copies | 2 |
| Locations | 2 |
| Loans | 0 |
| Annotations | 0 |
| Contributor tables | absent |
| PRAGMA integrity_check | ok |
| PRAGMA quick_check | ok |
| Foreign-key violations | 0 |
| db:validate | valid, read-only |

Formal edition values observed:

| Edition ID | Title | authors | translators |
| --- | --- | --- | --- |
| 32103d60-9f61-4540-98c0-8e43db788aed | 罗生门 | ["芥川龙之介"] | [] |
| open--works-OL1209288W | Im Westen nichts Neues | ["Erich Maria Remarque"] | [] |

The final read-only file hash was:

282d5b79c4546fd1143a2c9ee080a8192c7fb1b660b3fd25efe8afb8e949e243

The designated pre-upgrade backup exists and hashes to:

79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f

No contributors or edition_contributors table exists in the formal database,
and no 0005_contributors history row exists.

## 3. Consumer Inventory

| Consumer | Existing behavior | Task 008 handling |
| --- | --- | --- |
| lib/types.ts | BookEdition.authors and optional translators | Adds optional structured contributors; legacy fields remain |
| lib/db/repository.ts | Reads and edits edition JSON fields | Loads optional relations and replaces them atomically on structured edit |
| lib/db/catalog-adapter.ts | Creates editions and copies | Single write boundary creates structured relations in the same transaction |
| Catalog GET/POST APIs | Legacy edition shape | Exposes optional structured contributors while retaining legacy fields |
| From-edition API | Creates a copy from a selected edition | Accepts optional flat contributor inputs |
| Import | Author/authors legacy columns | Accepts author/authors, translator/translators, and structured contributor JSON |
| Export | JSON and CSV edition metadata | JSON v2 preserves structured data; CSV adds quoted contributor field |
| Local discovery | Title, author, ISBN matching | Also searches contributor display names and credited-as values |
| Wishlist | Edition metadata | Preserves legacy fields and includes relations when 0005 is present |
| UI | Existing author/translator presentation | No visual redesign or new UI dependency was introduced |

## 4. Target Contributor Model

Migration 0005 adds two tables.

contributors:

- id — stable Contributor entity ID
- display_name — required display name
- sort_name — optional sort value
- normalized_name — optional future search value
- active — integer boolean with a 0/1 check
- created_at and updated_at

edition_contributors:

- edition_id — foreign key to book_editions, cascade on edition deletion
- contributor_id — foreign key to contributors, restrict on entity deletion
- role — constrained canonical role code
- order_index — non-negative presentation/order value
- credited_as — optional edition-specific credit string
- composite primary key over edition, contributor, role, and order

Indexes support edition-order reads and contributor-role lookup. The model does
not require global uniqueness of names or normalized names.

## 5. Role Contract

The canonical stored role codes are:

author, translator, editor, compiler, illustrator, other

Role values are constrained in both application validation and the database CHECK
constraint. UI labels are intentionally not persisted as identity or authority
data. A future UI may localize these codes without changing stored relations.

## 6. Legacy Compatibility

Legacy book_editions.authors and book_editions.translators are retained.
Migration 0005 does not remove, rewrite, merge, or deduplicate either field.

Compatibility behavior:

- On a database without 0005, legacy reads and legacy writes continue to work.
- On a database with 0005, reads add an optional contributors array while still
  returning legacy author and translator arrays.
- Legacy-only creation backfills structured relations when the structured model
  is available.
- Structured creation derives legacy author/translator arrays only when the
  corresponding supplied legacy array is empty.
- Supplied legacy values are preserved rather than silently replaced.
- If structured data is sent before 0005 is applied, the write fails closed and
  the enclosing transaction rolls back.

## 7. Backfill Strategy

The isolated backfill reads each edition's legacy arrays in edition ID order.
For each raw author credit it creates one Contributor entity and one author
relation. It then does the same for each raw translator credit with role
translator. Order is author credits first, followed by translator credits,
starting at zero for each edition.

The backfill preserves raw display strings exactly, stores no guessed credited_as,
and does not derive sort or normalized identity values.

The representative fixture contained:

- Edition 1: two authors and one translator
- Edition 2: one author with the same display string as Edition 1
- Edition 3: no credits

The result was four Contributor entities and four relations. Core Work, Edition,
Copy, Location, Loan, and Annotation IDs and counts were unchanged.

Invalid JSON, non-array legacy values, or non-string/empty credits cause a
fail-closed refusal before any schema change.

## 8. Dedup Policy

Automatic contributor merge is explicitly disabled.

Each raw legacy credit becomes a distinct Contributor entity, including the same
display name appearing on different editions or multiple times in one edition.
No name-based lookup, fuzzy matching, external authority lookup, or VIAF-like
identity resolution is performed.

## 9. Migration Design

Migration 0005 is additive and isolated-only:

- Requires 0001, 0002, 0003, and 0004 history and prerequisite tables.
- Requires an explicit absolute database path under the OS temporary directory.
- Refuses formal or non-isolated targets.
- Supports --dry-run without opening the database for writes.
- Creates the two Contributor tables and two indexes in one transaction.
- Inserts the migration history row in the same transaction.
- Validates constraints, integrity, quick check, foreign keys, history, and
  unchanged core identities/counts before commit.
- A second invocation returns already_applied after validation.
- Existing partial Contributor tables without recorded history are refused.

The isolated package entry point now runs 0001 through 0005. No production 0005
runner was added or invoked.

## 10. DTO Contract

BookEdition retains:

    authors: string[]
    translators?: string[]
    contributors?: ContributorPayload[]

The read DTO for structured contributors is:

    {
      contributor: {
        id,
        displayName,
        sortName?,
        normalizedName?,
        active
      },
      role,
      orderIndex,
      creditedAs?
    }

Write boundaries also accept flat contributor inputs with displayName, role,
optional stable id, optional ordering, optional sort/normalized values, and
optional creditedAs. Flat inputs are converted into the nested read DTO without
changing the legacy edition contract.

DTO contract: LOCKED for the Task 008 implementation.

## 11. API Contract

Existing catalog boundaries remain in use:

- GET /api/catalog/books returns optional structured contributors.
- POST /api/catalog/books accepts structured contributors in addition to legacy
  author/translator inputs.
- POST /api/catalog/books/from-edition accepts flat structured contributors.
- Existing book edit flow accepts structured contributors through the edition
  update contract.
- Legacy import fields remain accepted.
- JSON export reports version 2 and compatibilityVersion 1 when 0005 is ready;
  a pre-0005 database continues to export version 1.

No separate Contributor CRUD endpoint is needed for this increment. Contributor
entities are created and related at the edition write boundary, with existing
IDs required for edits.

API contract: LOCKED for the current edition/catalog boundaries.

## 12. Write Boundary

The catalog adapter remains the single write boundary for new edition/copy
creation. When 0005 is ready, edition, Work where applicable, copy, Contributor
entities, and edition relations are written in one transaction.

The verified failure case uses a missing shelf location after structured
Contributor work has begun. The transaction leaves no edition, Work, Contributor,
or relation residue.

Explicit Contributor IDs resolve existing entities only. Missing IDs, invalid
roles, invalid ordering, or invalid display names fail closed.

Write boundary: PASS.

## 13. Edit Semantics

Structured edition edits update the edition row and replace that edition's
relations in one transaction. The replacement validates every input before
inserting relations. If an existing Contributor ID is missing, the edition
metadata change is rolled back with the relation change.

Removing all relations removes only the edition links. Contributor entities are
retained because they are independent entities and the database relation uses
restrict semantics.

Changing a structured role or order does not silently rewrite legacy arrays.
Legacy fields remain preserved compatibility data and can be updated explicitly
by a caller.

Edit transaction: PASS.

## 14. Search

Local book discovery now searches title, legacy authors, legacy translators,
structured Contributor display names, structured credited-as values, and ISBN.
Local candidates are returned before ranked external candidates and are
deduplicated by candidate ID.

The isolated probe verified a local result by structured translator display name
before the relation was edited away.

Search: PASS.

## 15. Import / Export

Import remains compatible with author and authors fields and now accepts
translator and translators fields plus a contributors array or JSON string.
Structured imports without a legacy author derive the legacy author from the
structured author rather than inserting an unknown-author placeholder.

JSON export reports version 2 with compatibilityVersion 1 when the Contributor
model is ready. It includes the structured relation DTO and retains legacy
fields. A database without 0005 continues to report version 1.

CSV export retains the legacy author and translator columns and adds a quoted
contributors JSON column. Existing location and reading metadata remains in the
CSV output.

Import: PASS.

Export: PASS.

## 16. Isolated Migration Results

Migration tests used fresh temporary databases only.

| Scenario | Result |
| --- | --- |
| 0005 dry-run | PASS; database unchanged |
| First 0005 apply | PASS; four Contributor entities and four relations in representative fixture |
| Second 0005 invocation | PASS; returns already_applied |
| Legacy fields after backfill | PASS; unchanged |
| Core identities/counts after backfill | PASS; unchanged |
| Clean rollback rehearsal | PASS; tables and history row removed, legacy/core state preserved |
| Rollback after new relation/entity | PASS; refuses rollback |
| Invalid/partial schema policy | PASS; fail closed |

Isolated migration: PASS.

Second-run safety: PASS.

Rollback rehearsal: PASS.

## 17. Transaction Safety

The new Contributor entity and edition relation inserts run inside the existing
catalog creation transaction. Edition and copy creation therefore cannot leave
partial Contributor data when a later location, duplicate, or constraint check
fails.

Edition metadata and relation replacement share one transaction. A failed
existing-ID lookup proves that metadata changes are rolled back together with
relation changes.

Contributor relation deletion does not delete Contributor entities. This
prevents an edition edit from destroying potentially reusable entities and is
consistent with the relation foreign-key restriction.

Transaction safety: PASS.

## 18. Regression Tests

The focused Contributor migration suite passed:

- 1 test file
- 2 tests passed
- dry-run, apply, idempotency, conservative backfill, clean rollback, and
  rollback refusal coverage

The complete Vitest suite passed:

- 10 test files
- 27 tests passed
- 1 existing skipped test
- 0 failed

Orphan validation covered both missing edition references and missing
Contributor references, and migration validation also checked unreferenced
entities during the conservative backfill.

Orphan validation: PASS.

## 19. E2E

The final full Playwright run passed:

- 32 tests
- 0 failed
- 0 failedTests in test-results/.last-run.json

The isolated E2E migration history expectation was updated from 0001–0004 to
0001–0005 so Task 004 and Task 006 smoke tests reflect the new isolated
baseline. The final run passed the existing library, motion, readiness, and
write-smoke flows.

E2E: PASS.

## 20. Quality

| Gate | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm test | PASS — 27 passed, 1 skipped |
| npm run build | PASS |
| npm run db:validate against formal DB | PASS — read-only |
| npm run test:e2e | PASS — 32 tests |

The Next build and E2E server report a pre-existing workspace-root warning
because both the main checkout and this independent worktree contain lockfiles.
The final clean build completed successfully without the temporary dependency
link used to run legacy integration helpers.

## 21. Formal DB Verification

Formal verification remained read-only:

- Path remains D:\方寸数据\data\library.db.
- History remains 0001_archive_fields, 0002_loans_annotations, 0003_works,
  0004_location_model.
- Works = 2, Editions = 2, Copies = 2, Active Copies = 2.
- Locations = 2, Loans = 0, Annotations = 0.
- Contributor tables are absent.
- Integrity check and quick check both return ok.
- Foreign-key violations = 0.
- 0003 and 0004 remain the latest formal migrations; 0005 has not executed.
- Formal database SHA-256 remains
  282d5b79c4546fd1143a2c9ee080a8192c7fb1b660b3fd25efe8afb8e949e243.

The designated backup remains present with SHA-256
79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f.

Formal DB touched: NO.

## 22. UI Impact

No visual UI redesign, Figma change, route layout change, or UI Contributor
editor was added in Task 008.

Existing UI consumers continue to receive authors and translators. On a
database with 0005, the optional contributors array is available to a future
UI increment. On the current formal database it is absent, and all existing
screens continue to use the legacy-compatible shape.

## 23. UI Handoff

The locked handoff for a future UI increment is:

- Read contributors as an optional edition-level array.
- Render role from the canonical codes author, translator, editor, compiler,
  illustrator, and other.
- Preserve orderIndex when presenting credits.
- Use creditedAs for the edition-specific visible credit when present.
- Treat contributor.id as the stable entity identity.
- Keep authors and translators as compatibility fields until a separate
  deprecation decision is approved.
- Do not use displayName as a database identity or build name-based merge UI.
- Do not depend on the legacy Location room field for this work.

This handoff is data-contract guidance only; no UI implementation is included.

## 24. Risks

1. Conservative backfill intentionally creates duplicate Contributor entities
   for equal display strings. A later identity-resolution task must be
   explicit, reviewable, and separately approved.
2. Legacy fields may diverge from structured relations when a caller edits only
   structured roles or order. This is intentional for compatibility and should
   be resolved by a future authoritative-field decision, not an implicit merge.
3. Contributor entities remain after an edition relation is removed. This avoids
   destructive cleanup but requires a future explicit retention/garbage
   collection policy.
4. The formal database has not received 0005. Production runtime behavior
   remains on the 0004-compatible path until a separate controlled migration
   approval.
5. No external authority or name normalization was introduced, so search and
   future deduplication remain display-data based.

## 25. Production Migration Readiness

Task 008 is READY for the next separately approved migration planning gate,
limited to isolated engineering readiness. It is not authorization to apply
0005 to the formal database.

The formal production database remains at 0001, 0002, 0003, and
0004_location_model. No formal 0005 command was added or run. No production
runner, deployment, merge, or release was performed by this task.

Production migration readiness: READY for a future approval gate; formal 0005
execution: NOT EXECUTED.

## 26. Recommended Next Action

Review the branch and this report, then obtain a separate explicit approval for
any future formal 0005 migration. That future task must repeat the production
preflight, service/runtime safety checks, backup verification, dry-run, and
post-migration validation against the unchanged formal database.

Do not merge to main, deploy, or execute formal 0005 as part of Task 008.

Task 008 stops here at isolated engineering readiness.
