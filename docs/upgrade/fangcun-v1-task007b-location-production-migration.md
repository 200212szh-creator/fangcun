# Fangcun v1 Task 007B — Controlled Production Location Migration

## 0. Metadata

- Task: 007B Phase A — Mainline Promotion & Runtime Alignment
- Repository: `200212szh-creator/fangcun`
- Origin: `https://github.com/200212szh-creator/fangcun.git`
- Formal database: `D:\\方寸数据\\data\\library.db`
- Scope boundary: promote and activate the Location-aware runtime while the formal database remains on 0003.
- Explicit exclusion: formal migration `0004_location_model` was not executed.
- Migration SQL SHA-256: `63cb13d5fbde39b6010866ad28d078c6661fe45d780e1a378f7ccd829c789dcb`
- Phase B approval token: `EXECUTE_0004_LOCATION_MODEL`

## 1. Git Promotion

The verified `engineering/task007a-integration` checkpoint `21b564b1f858372e8ec5fa44e990931a887886b9` was reviewed against `main` before promotion. The difference contained the reviewed Task007/007A Location implementation, production runner, tests, and readiness documentation. `git diff --check` passed.

Promotion used a normal fast-forward:

```text
b80528cb4e5a340d36f4fe1fbc4752e481cb2e29
  -> 21b564b1f858372e8ec5fa44e990931a887886b9
```

No force push, history rewrite, rebase, migration SQL edit, or unrelated worktree change was used. The main branch was pushed normally and matched `origin/main` at the promotion checkpoint.

## 2. Main Commit

Promoted main contains:

- `0004_location_model` up/down SQL and the locked Location model contract.
- Location DTOs and `GET`/`POST /api/catalog/locations`.
- Copy/loan compatibility changes and pre-0004 schema handling.
- `scripts/migrate-v4-production.ts` with explicit PRECHECK/DRY-RUN/EXECUTE gates.
- Task007/007A unit and integration tests.
- Task006E provenance, activation guard, and graceful watchdog protections.

The final active release is rebuilt after this report is committed. Its `release.json` is the authoritative binding for the final main HEAD, and the final health response is required to report the same 40-character source commit with `dirty=false`.

## 3. Quality

Quality gates on the promoted code passed:

- Typecheck: PASS
- Lint: PASS in a clean worktree at the promoted commit. A root-directory lint invocation also scanned pre-existing untracked `.worktrees` generated output and produced false positives; no source lint errors were present.
- Unit/integration tests: `9 passed`, `25 passed`, `1 skipped`
- Production build: PASS
- `db:validate`: PASS, read-only; `formalDatabaseMutation=false`
- E2E: `32/32 passed`

The E2E negative-path log includes an expected NOT NULL response while testing invalid fixture input; the test suite passed.

## 4. Main Push

Main was pushed to the configured GitHub origin using a normal push. Local `main` and `origin/main` matched at `21b564b1f858372e8ec5fa44e990931a887886b9` before the final Phase A report checkpoint. The report checkpoint is pushed as part of the final mainline release binding.

## 5. New Release

The final release is intentionally distinct from the Task007A release and from the old Task006E release:

- Release name: `2026-09-10_Task007B_location_main_final`
- Built from the final promoted `main` checkout.
- `dirty=false` is required and verified from `release.json`.
- Build ID and exact source commit are recorded in the final release provenance and `/api/health` response.
- The release was created with the existing `scripts/build-release.ps1`; no formal database operation is part of release creation.

## 6. Runtime Provenance

After activation, the expected final runtime evidence is:

- active release: `2026-09-10_Task007B_location_main_final`
- build ID: final `release.json` / `/api/health`
- source commit: final active release source commit equals current `main` HEAD
- dirty: `false`
- health: `status=ok`
- database: `ok`
- provenanceStatus: `ok`
- migration state: `0001_archive_fields`, `0002_loans_annotations`, `0003_works`; current `0003_works`
- listener: exactly one expected Fangcun listener on `127.0.0.1:3000`
- writer chain: one verified service-host plus its one release server
- old release `2026-09-09_Task006E_a2652ac`: not active

## 7. Windows Recovery Audit

The two Fangcun-specific scheduled tasks were inspected before switching:

- `Fangcun Archive Service`: enabled, action points to the project watchdog, logon trigger.
- `Fangcun Archive Health Recovery`: enabled, action points to the same watchdog with `-Once -Port 3000`, five-minute repetition.
- Login startup link: `方寸后台恢复.lnk`, calling the project `startup-hidden.vbs` and `startup-recovery.ps1`.

At the start of Phase A both release pointers still named `2026-09-09_Task006E_a2652ac`. The watchdog therefore legitimately read the old pointer and restored that old runtime after a failed health probe. The pointer was not missing; this was an unpromoted-release state, not an unrelated Windows service.

## 8. Old Release Resurrection Prevention

During each controlled switch, only the two Fangcun recovery tasks were temporarily disabled. The old host and server were verified by exact executable path, command line, release path, parent/child relation, state file, and port ownership. They were then stopped through the project service-host SIGTERM path; no force termination was used.

Temporary task state:

- original: `Enabled=True`, `State=Ready`
- maintenance window: `Enabled=False`, `State=Disabled`
- final intended state: `Enabled=True`; service task running, health recovery task ready

The project and data pointers were then updated through `scripts/promote-release.ps1` to the new release. The activation guard requires pointer, release metadata, source commit, and build ID agreement. Consequently the watchdog no longer has a valid path to silently resurrect the old Task006E release.

## 9. Pre-0004 Compatibility

With the new Location-aware runtime active and the formal database still on 0003, non-destructive reads passed:

- Home: HTTP 200
- Collection: HTTP 200
- Book Detail page: HTTP 200
- Book Detail read API: existing title and location returned
- Search: HTTP 200
- Health: HTTP 200, `status=ok`, `database=ok`, `provenanceStatus=ok`
- Books read API: 2 existing copies
- Locations read API: 2 existing locations
- Copy loans read API: 0 loans
- No `/loans` page route is present; the copy loans read path passed

No formal Location, copy, loan, or annotation data was created or changed by this smoke. The detail page's title is client-hydrated, so its API response was used as the authoritative read assertion.

## 10. Formal Baseline

Final read-only inspection of `D:\\方寸数据\\data\\library.db` showed:

- migrations: `0001_archive_fields`, `0002_loans_annotations`, `0003_works`
- Works: 2
- Editions: 2
- Copies: 2
- Active Copies: 2
- Locations: 2
- Loans: 0
- Annotations: 0
- `integrity_check`: `ok`
- `quick_check`: `ok`
- `foreign_key_check`: 0
- 0004-only columns: absent (`shelf_locations` retains only the legacy `parent_id`; loans have no 0004 location columns)
- formal database SHA-256: `BC167910B7A03C4B3DB00FCCA9C8C6B378FAD4975A449A47792122E2A7A12B57`

The hash was computed during a verified stopped-service window and matched the pre-switch hash. No formal schema or business-data write occurred. The standard release-activation backup check was allowed by the existing promotion mechanism; no Phase B `EXECUTE` or Phase B migration backup preparation was performed.

## 11. Phase B Execution

Phase A status: **COMPLETE**.

Phase B was explicitly approved with:

```text
GO — EXECUTE TASK 007B PHASE B
```

The formal maintenance window used the project service-host graceful shutdown
path. Only the two Fangcun watchdog tasks were temporarily disabled. The
verified host/server chain exited through SIGTERM; no force termination was
used, and no unrelated process, service or port owner was stopped.

Fresh pre-upgrade backup:

    D:\\方寸数据\\backups\\pre-upgrade\\fangcun-pre-upgrade-2026-09-10T02-37-04-884Z.db

- backup SHA-256: `8dcd0a1f0dd9b9145605a420333e1be72c66a16a9a6d17648251dff665f0d10a`
- backup sidecar integrity: `ok`
- backup restore rehearsal: PASS
- backup state: pre-0004, history 0001/0002/0003
- backup baseline: Works 2, Editions 2, Copies 2, Locations 2, Loans 0,
  Annotations 0

The formal PRECHECK and DRY-RUN both returned **GO**. The production runner
then executed exactly one `0004_location_model` transaction using the approved
token `EXECUTE_0004_LOCATION_MODEL` at `2026-09-10T02:39:15.379Z`.

Expected and applied changes:

- two additive columns on `shelf_locations`
- six additive original-location columns on `loans`
- three Location/loan indexes
- one `0004_location_model` row in `schema_migrations`

Post-migration validation passed before the transaction was committed:

- history: `0001_archive_fields`, `0002_loans_annotations`, `0003_works`,
  `0004_location_model`
- current migration: `0004_location_model`
- Works: 2
- Editions: 2
- Copies: 2
- Active Copies: 2
- Locations: 2
- Loans: 0
- Annotations: 0
- all 0004 columns and indexes present
- legacy location rows unchanged
- owned-copy location rows unchanged
- edition rows unchanged
- new Location defaults remain empty/legacy; no Loan original-location
  snapshots were created
- `integrity_check=ok`, `quick_check=ok`, `foreign_key_check=0`

The formal database was touched for the approved additive schema migration only.
No business data was added, deleted or rewritten. The post-migration formal
database SHA-256 is:

    282d5b79c4546fd1143a2c9ee080a8192c7fb1b660b3fd25efe8afb8e949e243

## 12. Post-Migration Runtime Verification

The final runtime remains the clean, provenance-bound release:

- release: `2026-09-10_Task007B_location_main_phaseB_final`
- build ID: `MIYAX2NVj1sHK-EAty8kT`
- source commit: `e9c889d44921464cc6e5bce9139d8b8e235e9e5f`
- dirty: `false`
- health: `ok`
- database: `ok`
- provenance: `ok`
- current migration: `0004_location_model`
- both release pointers resolve to the final release
- exactly one listener on `127.0.0.1:3000`
- exactly one Fangcun writer chain: service host → final release server
- Fangcun Archive Service: enabled/running
- Fangcun Archive Health Recovery: enabled/ready

Read-only compatibility smoke passed with HTTP 200 for home, collection,
search, manage, research, add, settings and book detail pages, plus health,
books, locations, metadata, book detail and copy-loans APIs. The authoritative
read results were 2 books, 2 locations and 0 loans.

The full isolated E2E suite completed with 32 tests passing under one allowed
test retry; one mobile reduced-motion test was flaky on its first attempt and
passed on retry. The suite's NOT NULL log is the expected negative-path test.

Task 007B — Phase B: **COMPLETE**.
