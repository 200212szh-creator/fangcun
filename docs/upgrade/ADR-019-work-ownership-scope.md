# ADR-019 — Work Ownership Scope

Status: LOCKED FOR FANGCUN 1.0

Date: 2026-09-09

## Context

Fangcun 1.0 is a local-first, single-owner library. The current schema and runtime do not have an authenticated multi-user boundary or an owner_id on Work. Work metadata and copy metadata are therefore private local-library data, not a global bibliographic registry.

## Options considered

- A — Global Work: one shared Work record for every user. This would require a canonical public-data identity, shared ownership rules, and a later separation between bibliographic data and private metadata.
- B — Owner-scoped Work: every owner has an independent Work namespace. This best matches private metadata and future account boundaries, but requires an explicit owner identity before cloud or multi-user operation.
- C — Hybrid: shared canonical Work plus owner-specific overlay. This is the most extensible long-term shape, but it introduces merge, provenance, conflict, and migration complexity that Fangcun 1.0 does not need.

## Decision

### CURRENT PROJECT RECOMMENDATION

Choose B at the product boundary, implemented in Fangcun 1.0 as an implicit single local owner (`local-owner`). Work records are not global and are not shared across owners. The 0003 migration intentionally does not add owner_id because the current product has exactly one local owner and no identity provider.

### WHY

This preserves the current single-owner/local-first contract, keeps private reading and acquisition metadata private, avoids inventing a global canonical identity, and keeps the Work backfill one Edition to one Work without automatic cross-record merge.

### IMMEDIATE IMPLEMENTATION IMPACT

- No owner_id column or auth dependency is introduced in Task 004.
- Work → Edition → Copy remains the locked domain chain.
- Import, export, search, and compatibility responses operate within the current local owner boundary.
- Deduplication and merge are not silently broadened to a global namespace.

### FUTURE MIGRATION IMPACT

Before cloud, sharing, or multiple local owners are introduced, a new ADR must define owner identity, owner_id backfill, canonical bibliographic identity, visibility, conflict handling, import/export ownership, and a Work merge policy. That future migration must not be folded into 0003.

### DATA OWNERSHIP RISK

The primary risk is that a future global or shared Work model could be assumed from the table name. This is mitigated by the locked local-owner wording, the absence of silent merge, and the requirement for a new ownership ADR before multi-user behavior.

### REVERSIBILITY

The decision is reversible at the product boundary. Moving to an explicit owner-scoped or hybrid model later requires a planned schema migration and data-ownership review, but does not require changing the current Work → Edition → Copy relationship.
