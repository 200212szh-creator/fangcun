# ADR-020 — Schema Truth Authority

Status: LOCKED FOR FANGCUN 1.0

Date: 2026-09-09

## Decision

`schema_migrations` is the authoritative history for versioned schema evolution. A migration-owned table, column, or relationship is valid at runtime only when its migration record and expected schema are both present.

Bootstrap owns only the immutable pre-migration baseline and the `schema_migrations` metadata table. Bootstrap may create the base catalog tables required to begin explicit migrations, but it must not create 0001, 0002, or 0003 structures. The migration runner is the only writer for versioned structural changes and migration records.

`ensureDatabase()` now performs baseline bootstrap followed by a strict schema-truth assertion. It never silently creates migration-owned columns or tables. Missing history, unknown history, partial Work schema, or an unrecorded Work schema raises a typed fail-fast error with migration-required semantics.

## Consequences

- A fresh development or test database is made consistent by baseline bootstrap followed by the explicit migration runner.
- An existing database is upgraded only by explicit migrations.
- A table-exists-but-history-is-missing split-brain state is visible and blocked rather than normalized silently.
- Read-only preflight and validation tools inspect an explicit database path and never import the runtime bootstrap path.

## Rejected alternatives

- Runtime auto-upgrade: rejected because it hides migration history and can mutate an unintended database.
- Read-only fallback for an incomplete runtime schema: rejected for normal startup because consumers would observe an undocumented shape. Operators receive a fail-fast migration-required signal instead.
