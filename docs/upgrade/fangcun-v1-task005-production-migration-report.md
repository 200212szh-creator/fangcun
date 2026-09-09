# Fangcun Task 005 — Production Work Migration 0003

> Task 005 Phase B 已按恢复授权完成。本报告保留 Phase A 的原始门禁证据，并在末尾以 **Phase B Completion Addendum（authoritative）** 记录正式迁移、验证、runtime startup 和 production smoke 的最终结果。

## 0. Migration Metadata

- Task：Task 005 — Controlled Production Work Migration (`0003_works`)
- Phase：A — Production Preflight + Verified Backup；B — Controlled Formal Migration
- Date：2026-09-09（Asia/Shanghai）
- Repository：`200212szh-creator/fangcun`
- Branch：`main`
- HEAD commit：`3b14fe6c5fafc72a010d383a6e64b65b48a9377a`
- Working tree：存在 Task 002–004 的未提交变更以及用户已有未跟踪设计文件；本轮没有修改产品代码、迁移 SQL、依赖或 lockfile。
- Task category：DATA MIGRATION / RUNTIME OPERATIONS
- Migration target：`0003_works`
- Approval state：已收到并执行精确授权 `GO — RESUME TASK 005 PHASE B USING THE VERIFIED PRODUCTION RUNNER`
- Formal database mutation：仅由 verified production runner 执行一次 `0003_works`；未执行其他 schema 或业务数据写入。
- Evidence labels：`VERIFIED` 表示本轮直接读取或执行得到；`PENDING` 表示必须在 Phase B 前再次确认；`NO-GO` 表示当前不能进入正式迁移。

## 1. Approval Evidence

Phase A 已按 Task 005 交接说明执行。随后收到并核验了正式恢复授权：

```text
GO — RESUME TASK 005 PHASE B USING THE VERIFIED PRODUCTION RUNNER
```

授权明确要求只使用 `scripts/migrate-v3-production.ts`，依次完成 PRECHECK、DRY-RUN、GO/NO-GO、EXECUTE、post-validation、runtime startup 和 smoke，并在 Task 005 后停止。上述序列已全部完成。

正式 migration 的执行门禁包括：

1. 服务及所有 Fangcun writer 已由授权人员停止；
2. 目标路径、HEAD、备份 hash、基线计数和迁移状态重新确认无变化；
3. 收到精确的 Phase B `GO` 授权。

## 2. Formal Database Identification

### Repository

- Remote：`https://github.com/200212szh-creator/fangcun.git`
- Remote repository：`200212szh-creator/fangcun`
- Visibility：public
- Default branch：`main`
- Current branch：`main`
- Current HEAD：`3b14fe6c5fafc72a010d383a6e64b65b48a9377a`
- Repository evidence：`gh repo view`、`git remote -v`、`git branch --show-current`、`git rev-parse HEAD`

### Runtime target

正式目标不是根据文件名猜测，而是由以下运行时证据共同指向：

- `Fangcun Archive Service` scheduled task arguments：`-DataRoot "D:\方寸数据"`
- `runtime/launcher/watchdog.ps1`：`DATABASE_URL = D:\方寸数据\data\library.db`
- `D:\方寸数据\state\current-release.txt`：指向 `D:\图书库\runtime\releases\2026-09-08_223319`
- `D:\方寸数据\state\service.pid`：当前 service host 使用该 release，监听端口 `3000`
- `README.md`、`package.json`、正式任务参数和 state pointer 的路径一致

Formal runtime database path：

```text
D:\方寸数据\data\library.db
```

当前文件证据：

- Size：`167,936 bytes`
- Last modified：`2026-09-09T07:52:49.4465332+08:00`
- `library.db-wal`：`0 bytes`
- `library.db-shm`：`32,768 bytes`
- `library.db-journal`：不存在
- Target ambiguity：`PASS`；当前运行配置没有发现第二个正式目标

### Current application/runtime state

- Release pointer：`D:\图书库\runtime\releases\2026-09-08_223319`
- Service host PID：`20256`
- Fangcun Next server PID：`17772`
- Listener：`127.0.0.1:3000`，owner PID `17772`
- `/api/health`：`status=ok`、`database=ok`、build ID `GvGbCaBTvxoo10hKN-lKd`
- `Fangcun Archive Service`：scheduled task state 为 `Ready`，但对应 service host/server 进程正在运行；本报告以进程和监听证据为准
- `Fangcun Archive Health Recovery`：scheduled task state 为 `Ready`
- Post-reboot verification：已有记录为 `failed`，原因是期望发行编号与实际 build ID 不一致；这不是本轮迁移造成的变更，须在正式迁移窗口前由运维人员确认

## 3. Preflight

执行的 Task 004 工具：

```text
npm run db:preflight -- --target=FORMAL --allow-formal-readonly \
  --database=D:\方寸数据\data\library.db \
  --backup=D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db \
  --service=running
```

工具输出为 `NO_GO`，唯一失败项为 `serviceState`。其余关键只读检查通过：

- Database readable：`PASS`
- Explicit formal target：`PASS`
- Runtime environment/path match：`PASS`
- `schema_migrations`：`0001_archive_fields`、`0002_loans_annotations`
- Current migration：`0002_loans_annotations`
- `0003_works`：尚未执行
- Work schema：`absent`；`works` 不存在，`book_editions.work_id` 不存在
- Expected pre-0003 schema：`PASS`
- `integrity_check`：`ok`
- `quick_check`：`ok`
- `foreign_key_check`：`0 violations`
- Disk free space：数据库目录和备份目录均为 `379,431,108,608 bytes`
- WAL / rollback journal pending-write check：工具输出 `PASS`；另有 `.db-shm` 文件和 active process，不能替代服务停止证明
- Backup metadata/hash/count validation：`PASS`
- Migration target state：`ready_for_0003_works`
- `formalDatabaseMutation` reported by tooling：`false`

### Active writer assessment

当前不能证明没有 active writer，反而已直接证明存在 Fangcun writer：

- `service-host.js` PID `20256`
- release `server.js` PID `17772`
- `127.0.0.1:3000` 由 PID `17772` 监听
- `service.pid` 明确记录该 server 使用正式 release
- `health-status.json` 持续更新，watchdog 正在定期检查服务

结论：`Active writer / service status = FAIL / NO-GO`。本轮没有停止服务、没有杀进程、没有启动或重启任何 runtime。

## 4. Baseline Counts

正式库只读探针与 preflight 的关键计数如下。未执行任何修复、清理或回填。

| Table / metric | Baseline count | Status |
|---|---:|---|
| `schema_migrations` | 2 | `VERIFIED` |
| `book_editions` / Editions | 2 | `VERIFIED` |
| `owned_copies` / Copies | 2 | `VERIFIED` |
| `loans` | 0 | `VERIFIED` |
| `annotations` | 0 | `VERIFIED` |
| `shelf_locations` / Locations | 2 | `VERIFIED` |
| `categories` | 0 | `VERIFIED` |
| `tags` | 0 | `VERIFIED` |
| `copy_tags` | 0 | `VERIFIED` |
| `wishlist_items` | 0 | `VERIFIED` |
| `research_works` | 0 | `VERIFIED` |
| `research_folders` | 0 | `VERIFIED` |
| `folder_works` | 0 | `VERIFIED` |
| `concepts` | 0 | `VERIFIED` |
| `annotation_concepts` | 0 | `VERIFIED` |
| `external_references` | 0 | `VERIFIED` |
| `search_cache` | 0 | `VERIFIED` |
| `works` | not present | expected pre-0003 state |
| `book_editions.work_id` | not present | expected pre-0003 state |

### Null / orphan / FK anomalies

Read-only anomaly probes returned zero for the checked relationships:

| Check | Result |
|---|---:|
| Copies without Edition | 0 |
| Loans without Copy | 0 |
| Annotations without Copy | 0 |
| Shelf locations with missing parent | 0 |
| Copy-Tags without Copy | 0 |
| Copy-Tags without Tag | 0 |
| `PRAGMA foreign_key_check` violations | 0 |

No attempt was made to inspect, normalize or repair individual user records.

## 5. Backup

使用现有、Task 004 已验证的 `runtime/maintenance/database-maintenance.js`，执行：

```text
FANGCUN_DATA_DIR=D:\方寸数据
DATABASE_URL=D:\方寸数据\data\library.db
node runtime/maintenance/database-maintenance.js --mode=pre-upgrade
```

生成了新的、未覆盖旧文件的正式备份：

```text
D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db
```

Backup file evidence：

- Size：`167,936 bytes`
- Last modified：`2026-09-09T11:15:18.5499345+08:00`
- Sidecar：同路径追加 `.json`
- Sidecar `createdAt`：`2026-09-09T03:15:18.558Z`
- Sidecar `integrity`：`ok`
- Sidecar baseline counts：与本报告第 4 节一致
- Backup file collision/overwrite：未发现；文件名包含 timestamp

备份命令采用 SQLite safe backup API。正式服务仍在运行，因此这份备份不能替代 Phase B 前的服务停止和最终 gate；它仅作为本轮 Phase A 的独立回滚候选。

## 6. Backup Verification

Task 004 preflight 对备份执行了只读打开、schema/history、integrity、quick check、FK、sidecar timestamp、integrity marker、SHA-256 和 row count 校验，结果：`PASS`。

Backup SHA-256：

```text
79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f
```

验证细节：

- Backup readable：`PASS`
- SHA-256 matches sidecar：`PASS`
- Integrity marker：`ok`
- `integrity_check`：`ok`
- `quick_check`：`ok`
- `foreign_key_check`：`0 violations`
- `schema_migrations`：0001、0002；0003 未执行
- Expected pre-0003 schema：`PASS`
- Critical counts：与正式目标基线一致

## 7. Restore Rehearsal

使用刚生成的正式备份执行 Task 004 已建立的隔离恢复验证：

```text
npm run db:restore:verify -- --target=ISOLATED \
  --backup=D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db
```

结果：`PASS`。

- 备份只复制到 OS temp 下的 isolated restore copy
- isolated copy 只读打开并验证 schema/history/integrity/quick/FK/counts
- 临时 restore copy 在验证后已删除
- 没有覆盖 `D:\方寸数据\data\library.db`
- 没有向正式数据库执行 restore
- `formalDatabaseMutation`：`false`

## 8. Service Stop

- Service stopped：`NO`
- Fangcun writer：仍在运行
- Action taken：未停止、未重启、未杀进程
- Required before Phase B：由授权操作人员停止 `Fangcun Archive Service` 及其确认属于 Fangcun 的 writer，确认 `service-host.js`、release `server.js` 和端口 `3000` 均已停止，并重新运行正式 preflight

## 9. Migration Execution

`0003_works.up.sql` **未执行**。

未执行以下任何动作：

- 未创建 `works` 表
- 未添加 `book_editions.work_id`
- 未写入 `schema_migrations.0003_works`
- 未停止服务
- 未启动服务
- 未执行正式 smoke write
- 未修改 SQL、runner、API、UI、依赖、lockfile 或 runtime 代码

## 10. schema_migrations Result

Phase A 当前正式历史保持：

```text
0001_archive_fields
0002_loans_annotations
```

Current migration：`0002_loans_annotations`

`0003_works` record：不存在（符合 Phase A 预期）。

## 11. Post-Migration Validation

本节尚未进入 Phase B，全部标记为 `NOT RUN`。正式执行后必须至少验证：

- `works` exists
- `book_editions.work_id` exists
- `schema_migrations.0003_works` exists
- `works count == editions count` for the conservative one-Edition-to-one-Work phase
- edition/copy/loan/annotation/location counts unchanged
- missing `work_id = 0`
- orphan works/editions = 0
- duplicate Work IDs = 0
- FK violations = 0
- `integrity_check = ok`
- `quick_check = ok`

## 12. Data Count Comparison

Phase A only captures the “before” side. The “after” side is intentionally absent because no migration was executed.

| Metric | Before | After | Status |
|---|---:|---:|---|
| Editions | 2 | N/A | `NOT RUN` |
| Works | N/A, table absent | N/A | `NOT RUN` |
| Copies | 2 | N/A | `NOT RUN` |
| Loans | 0 | N/A | `NOT RUN` |
| Annotations | 0 | N/A | `NOT RUN` |
| Locations | 2 | N/A | `NOT RUN` |

## 13. Integrity / Foreign Keys

Phase A formal target and new backup both passed read-only checks:

- Target `integrity_check`：`PASS / ok`
- Target `quick_check`：`PASS / ok`
- Target `foreign_key_check`：`PASS / 0`
- Backup `integrity_check`：`PASS / ok`
- Backup `quick_check`：`PASS / ok`
- Backup `foreign_key_check`：`PASS / 0`

Post-0003 checks are `NOT RUN` by design.

## 14. Runtime Startup

Current pre-migration runtime health was read-only checked:

- `/api/health`：`PASS` (`status=ok`, `database=ok`)
- Current writer/service：running
- Post-migration startup：`NOT RUN`
- Existing post-reboot verification record：`failed` because expected and actual release build IDs differ; this is an existing operational warning to resolve before the migration window

No runtime restart or release pointer change was attempted.

## 15. Production Smoke

- Migration smoke：`NOT RUN`
- Read-only current health endpoint：`PASS`
- Core post-migration smoke for Home / Collection / Book Detail / Search / Settings：`NOT RUN`
- Formal write smoke：`DEFERRED`
- No test book, loan, annotation, import or other fake business record was created in the formal database.

## 16. Observation Status

`NOT STARTED`。

The formal observation window begins only after an approved Phase B migration, post-migration validation, runtime startup and minimal smoke. Legacy Edition fields, raw contributor strings, compatibility adapter and legacy repository methods remain unchanged.

## 17. Rollback Status

- Phase A rollback candidate：verified backup preserved
- Formal rollback：`NOT REQUIRED` at this stage because 0003 was not executed
- Formal restore：not performed
- Isolated restore rehearsal：`PASS`
- Automatic rollback：not configured or executed
- If Phase B fails：stop service/writes, preserve failed database and sidecars, then request explicit `ROLLBACK APPROVAL`; do not overwrite the formal DB automatically

## 18. Files Changed

Created in this Phase A reporting step:

- `docs/upgrade/fangcun-v1-task005-production-migration-report.md`

No product code, migration SQL, runtime service, UI, API contract, dependency, lockfile, global CSS, font file or layout file was changed during the migration window.

The following were pre-existing working-tree changes from earlier tasks and were not reset, staged, committed or pushed by this task:

- Task 002/003 migration, adapter, test and report files
- Task 004 schema-truth, preflight, restore verification, E2E and report files
- user-provided `design-system/default/references/fangcun-editorial-home-v2.png`

## 19. Formal Database Change

Schema change：`NO`

Business data change：`NO`

Migration history change：`NO`

The approved existing backup procedure generated one independent backup and its sidecar under `D:\方寸数据\backups\pre-upgrade`. The procedure used SQLite backup handling while the service was running; no 0003 schema or business-row migration was performed. Because an active writer exists, Phase B remains NO-GO until a stopped-writer preflight is repeated.

## 20. Risks

1. **Active writer / service is still running.** The formal database is being used by Fangcun’s `service-host.js` and release `server.js`; this is a hard Phase B gate.
2. **Existing post-reboot release mismatch.** `post-reboot-verification.json` records an expected-vs-actual build ID mismatch. Current `/api/health` is healthy, but the release/runtime state requires operator confirmation before a migration window.
3. **Backup was created while the service was running.** It passed the approved safe backup, hash, integrity, schema and restore verification, but the final backup gate must be repeated after the service is stopped and before migration.
4. **Formal target is currently locked by another process.** A direct file hash attempt was denied because `library.db` is in use. This is further evidence that the target cannot be treated as writer-free.
5. **Working tree is dirty.** The reported HEAD is the last committed baseline; Task 002–004 work is uncommitted. Phase B must re-check the migration SQL hash and runtime release independently; it must not silently treat uncommitted source as the deployed runtime.
6. **Existing DDL has limited declared foreign keys.** Phase A probes are clean, but post-migration validation must retain explicit orphan and count checks.

## 21. Incidents

- No migration incident occurred because Phase B was not entered.
- No formal schema or business data drift was observed by the read-only probes.
- The existing post-reboot verification mismatch remains an operational warning, not a new migration incident.
- The standalone Task 004 checklist path `docs/upgrade/fangcun-v1-task004-go-no-go-checklist.md` is absent from the current worktree. The equivalent GO/NO-GO table in Task 004 report §18 was used as the available checklist evidence; no migration authorization was inferred from its PASS entries.

## 22. Legacy Compatibility Status

- Legacy `book_editions` metadata：preserved
- Raw `authors` / `translators` fields：preserved
- Legacy repository methods：preserved
- Compatibility adapter：preserved
- Automatic Work merge：`NO`
- Contributor normalization：`NOT STARTED`
- Location migration：`NOT STARTED`
- Legacy field removal：`NO`

## 23. Recommended Task 006

Task 006 must not begin from this report until Task 005 Phase B is separately authorized and completed. After a successful, validated 0003 window and observation handoff, recommended next work is:

- reconcile the broad UI/E2E fixture and test-contract failures as a separate task;
- keep legacy fields and the compatibility adapter through the observation window;
- define any future Contributor, Location, shared-owner or Work merge/dedup work as separate migrations/decisions;
- do not infer a global Work identity from the one-Edition-to-one-Work backfill.

## Phase A GO / NO-GO Checklist

| Check | Status | Evidence |
|---|---|---|
| Formal DB identified | PASS | Runtime task, watchdog, state pointer and service PID agree on `D:\方寸数据\data\library.db` |
| No target ambiguity | PASS | No conflicting formal target found |
| Migration history valid | PASS | 0001 and 0002 recorded; no unknown IDs |
| 0003 not yet applied | PASS | No `works`, no `work_id`, no 0003 record |
| Schema expected | PASS | Complete pre-0003 runtime schema |
| `integrity_check` | PASS | Target and backup `ok` |
| `foreign_key_check` | PASS | Target and backup `0` |
| Disk space | PASS | `379,431,108,608 bytes` available on both paths |
| Baseline counts captured | PASS | Critical tables and supporting tables recorded |
| Fresh backup created | PASS | Unique timestamped pre-upgrade backup |
| Backup SHA-256 | PASS | `79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f` |
| Backup integrity | PASS | Sidecar marker, schema, integrity, quick and FK checks pass |
| Restore rehearsal | PASS | Isolated temp copy validated and removed |
| Active writer status | FAIL | Fangcun server PIDs 20256/17772 and port 3000 active |
| Compatibility regression evidence | PASS | Task 003 report and Task 004 readiness report preserved |
| Isolated migration evidence | PASS | Task 002–004 isolated evidence preserved |

Overall Phase A decision：**NO-GO** until the active writer is stopped by an authorized operator and the final gate is repeated. This is not a formal migration GO.

## Phase A Completion Boundary

```text
Task 005 — Phase A Production Preflight: NO-GO

Formal database:
D:\方寸数据\data\library.db

Current migrations:
- 0001_archive_fields
- 0002_loans_annotations

Baseline:
- editions: 2
- copies: 2
- loans: 0
- annotations: 0
- locations: 2

Fresh migration backup:
D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db

Backup SHA-256:
79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f

Backup validation: PASS
Restore rehearsal: PASS
Active writer / service status: STOPPED — PASS
Preflight: PASS — serviceState=stopped
GO / NO-GO: PHASE B AUTHORIZED, EXECUTION BLOCKED

Phase B execution attempt:
- The exact approval `GO — EXECUTE TASK 005 PHASE B` was received.
- The formal target and backup gates were rechecked read-only.
- No formal migration command was run because the only verified 0003 runner, `scripts/migrate-v3.ts`, hard-rejects every target other than `FANGCUN_MIGRATION_TARGET=ISOLATED` before opening the database.
- No separate formal-safe 0003 runner exists in `scripts/` or `migrations/`.
- The runner and SQL were not modified, and no raw SQL or ad hoc migration was used.

Post-attempt evidence:
- Formal DB: `D:\方寸数据\data\library.db`; service host/runtime absent; `127.0.0.1:3000` not listening.
- Migration history remains `0001_archive_fields`, `0002_loans_annotations`; `0003_works` is absent.
- `works` and `book_editions.work_id` are absent.
- Counts remain `Editions=2`, `Copies=2`, `Loans=0`, `Annotations=0`, `Locations=2`.
- `integrity_check=ok`; foreign-key violations `0`.
- Backup SHA-256 remains `79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f`.

0003 executed: NO
Formal schema changed: NO
Final decision: STOPPED — cannot safely execute Phase B without an already-verified formal-target runner. A follow-up implementation task is required; do not retry or bypass this gate in the current production window.
```

## Phase B Completion Addendum (authoritative)

The historical Phase A sections above are retained as an audit trail. This addendum supersedes their pre-execution `NOT RUN` / `NO-GO` statements and records the completed Phase B window.

## Approval

- Approval received: `GO — RESUME TASK 005 PHASE B USING THE VERIFIED PRODUCTION RUNNER`.
- Approved runner: `scripts/migrate-v3-production.ts` only.
- Execute token accepted: `EXECUTE_0003_WORKS`.
- No raw SQL, manual schema patch, runner change, SQL change or automatic retry was used.

## Formal target

`D:\方寸数据\data\library.db`

Repository and release identity remained:

- repository: `https://github.com/200212szh-creator/fangcun.git`
- branch: `main`
- HEAD: `3b14fe6c5fafc72a010d383a6e64b65b48a9377a`
- backup: `D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db`

## PRECHECK

`FORMAL PRECHECK`: **PASS**.

- target path accepted exactly;
- service stopped, no Fangcun writer, and `127.0.0.1:3000` not listening;
- history exactly `0001_archive_fields`, `0002_loans_annotations`;
- `0003_works`, `works` and `book_editions.work_id` absent;
- baseline counts matched;
- target and backup integrity/quick/FK checks passed;
- backup sidecar/hash and isolated restore rehearsal passed;
- verified migration SQL hash passed.

## DRY-RUN

`FORMAL DRY-RUN`: **PASS**.

The runner accepted the formal target and reported only the expected `0003_works` changes: create `works`, add `book_editions.work_id`, add its index, create two Work rows and record the migration. The formal target was rechecked afterward and remained pre-0003.

## Migration execution

`FORMAL EXECUTE`: **PASS**.

- runner: `scripts/migrate-v3-production.ts`;
- mode: `EXECUTE`;
- target: `FORMAL`;
- approval token: accepted;
- transaction: committed once;
- migration timestamp: `2026-09-09T04:37:03.316Z`;
- created Work count: `2`.

## Migration SQL hash

`294b653605b440e2db8187f218d9c7be169c185b27182007ec181152916ac8b4` — PASS and unchanged from the verified Task 002 artifact.

## Backup hash

`79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f` — PASS and unchanged after execution.

## Baseline before

| Metric | Before |
|---|---:|
| Editions | 2 |
| Copies | 2 |
| Loans | 0 |
| Annotations | 0 |
| Locations | 2 |

## Validation after

- `works` table: present;
- `book_editions.work_id`: present;
- Work count: `2`;
- missing `work_id`: `0`;
- orphan Works: `0`;
- orphan Editions: `0`;
- duplicate Work IDs: `0`;
- duplicate Edition-to-Work links: `0`;
- Work title/timestamp null fields: `0`;
- legacy Edition metadata and columns: present and preserved;
- automatic Work merge: none; strategy remained one Edition → one Work.

## schema_migrations

The formal database now records exactly:

```text
0001_archive_fields
0002_loans_annotations
0003_works
```

Current migration: `0003_works`.

## Row-count invariants

| Metric | Before | After | Result |
|---|---:|---:|---|
| Editions | 2 | 2 | PASS |
| Works | N/A | 2 | PASS; equals Editions |
| Copies | 2 | 2 | PASS |
| Loans | 0 | 0 | PASS |
| Annotations | 0 | 0 | PASS |
| Locations | 2 | 2 | PASS |

## Integrity

- `integrity_check`: `ok` — PASS.
- `quick_check`: `ok` — PASS.

## Foreign keys

- `foreign_key_check`: `0` violations — PASS.

## Runtime startup

**PASS**. Fangcun was started using the existing `Fangcun Archive Service` scheduled task, which points to `runtime/launcher/watchdog.ps1`. The service host and release Next server started successfully; `/api/health` returned HTTP 200 with `status=ok` and `database=ok`. The schema guard accepted the migrated database.

## Production smoke

**PASS**, read-only only:

- `/home`: HTTP 200;
- `/library`: HTTP 200;
- `/search`: HTTP 200;
- `/settings`: HTTP 200;
- existing Book Detail route: HTTP 200;
- `/api/catalog/books`: HTTP 200, `total=2`, `items=2`;
- `/api/health`: HTTP 200, database healthy.

## Incidents

No migration incident occurred. PRECHECK, DRY-RUN, EXECUTE, post-validation, runtime startup and smoke completed without failure. No automatic rollback, down migration, manual repair or retry was invoked.

## Rollback status

`NOT REQUIRED`.

The verified pre-upgrade backup remains preserved and its SHA-256 is unchanged. No rollback action was performed.

## Legacy compatibility

- Legacy Edition fields removed: **NO**.
- Legacy titles and metadata remained present.
- Compatibility adapter and legacy repository boundary remain in place.
- Automatic Work merge: **NO**.
- Write smoke: **DEFERRED**; no fake books, loans or annotations were inserted into the formal collection.

## Observation status

Observation begins after the successful runtime smoke. The service is running through the project's normal launcher. Further observation and any remediation must remain separate from this completed migration task.

## Recommended Task 006

Do not start Task 006 automatically from this turn. If separately approved after observation, Task 006 should address only its own scoped follow-up work; it must not implicitly perform UI redesign, Location migration, Contributor normalization, Work merge/dedup, legacy cleanup or other schema changes.

## Final completion boundary

- Product code changed during migration: **NO**.
- Formal database touched: **YES — ONLY BY VERIFIED `0003_works` MIGRATION**.
- `0003_works` formal migration: **COMPLETE**.
- No commit/push/PR/deploy was performed.
- Task 005 complete; stop here.
