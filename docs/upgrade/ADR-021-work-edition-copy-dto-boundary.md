# ADR-021 — Work / Edition / Copy DTO and Service Boundary

Status: LOCKED FOR FANGCUN 1.0

Date: 2026-09-09

## Decision

The internal domain is separated into `WorkDto`, `EditionDto`, and `CopyDto`. A service-facing catalog object is composed as `{ work, edition, copy }`; the compatibility-facing object retains the current `OwnedCopy` response shape.

The boundary is implemented in `lib/catalog/contracts.ts`. The compatibility mapper is the only intended translation from the service/domain shape to the current API shape. SQLite rows and Drizzle schema types are not public API contracts.

## Contract families

- Work DTO: work identity, title, original title, description, timestamps, and future extensible bibliographic identity fields.
- Edition DTO: edition identity, work relation, title, authors, publication/version metadata, and edition notes.
- Copy DTO: copy identity, edition relation, location, reading state, acquisition fields, private notes, and copy-level timestamps.
- CatalogBookServiceDto: nested `{ work, edition, copy }` service shape.
- CatalogBookCompatibilityDto: current consumer-compatible `OwnedCopy` shape.
- CreateCatalogBookDto: edition input plus optional location and copy metadata; the service creates or resolves Work, then Edition, then Copy in one transaction.
- UpdateCatalogBookDto: separated edition and copy updates; neither accepts arbitrary raw table fields.

## Single write boundary

- Create Work / Edition / Copy: catalog service and repository transaction.
- Update Edition: catalog service delegates to the edition repository boundary.
- Update Copy: catalog service delegates to the copy repository boundary.
- Move Copy: copy/location service boundary; it never rewrites edition identity.
- Loan Copy: loan service/repository boundary; loan history remains copy-scoped.

Routes validate input and call the service boundary. Components call API routes and never access SQLite. Existing response keys remain unchanged in Task 004; a future target API may expose the nested service shape only through a separately versioned, non-breaking contract.
