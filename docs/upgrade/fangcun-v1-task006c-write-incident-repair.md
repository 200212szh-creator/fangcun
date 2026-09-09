# Task 006C — Production Write Incident Repair

## 0. Incident Metadata

- 日期：2026-09-09（Asia/Shanghai）
- 任务：Task 006C — Production Write Incident Repair
- 触发背景：Task 006 Phase B 的正式写入 smoke 暴露出 `Edition -> Copy` 写入成功、但 `Work` 未创建/未关联的问题。
- 正式数据库：`D:\方寸数据\data\library.db`
- 修复前 release：`D:\图书库\runtime\releases\2026-09-08_223319`
- 修复后 release：`D:\图书库\runtime\releases\2026-09-09_IncidentRepair`
- 清理授权：用户已明确授权“仅删除上述三个 exact fixture rows，并在单一事务中执行 cleanup”。
- 执行边界：先安全停服、备份和审计，再修复/验证，最后执行 exact-ID cleanup；未执行 Task 006D。

## 1. Incident Summary

Task 006 Phase B 使用旧的正式 release 写入了一个带唯一 marker 的测试 Edition、Copy 和 Shelf Location。旧 release 能创建 Edition 与 Copy，但没有创建 Work，也没有把 Edition 关联到 Work，导致正式库出现一个缺失 `work_id` 的 Edition。

Task 006C 已完成：

1. 通过项目自身的正常停服路径停止正式 runtime。
2. 在清理前创建并验证新的 incident-state backup。
3. 完成 exact fixture、依赖和写入路径审计。
4. 确认根因是 stale production release bundle，而不是 0003 schema migration 或请求 payload。
5. 使用现有 Work-aware transaction adapter 构建并激活修复 release。
6. 通过 targeted regression、完整单元/集成测试、完整 E2E 和 release 静态检查。
7. 在用户明确授权后，仅在单一事务中删除 exact Edition、Copy、Location 三行。
8. 恢复正式 runtime，并确认健康接口、数据库和任务调度状态正常。

## 2. Formal State Before Repair

清理前正式库只读审计结果：

| 指标 | 清理前 |
| --- | ---: |
| Works | 2 |
| Editions | 3 |
| Copies | 3 |
| Active Copies | 2 |
| Locations | 3 |
| Loans | 0 |
| Annotations | 0 |
| Editions missing `work_id` | 1 |
| Orphan Editions | 1 |
| Orphan Works | 0 |
| Foreign-key violations | 0 |
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA quick_check` | `ok` |

Migration history 在修复前已为且保持为 `0001_archive_fields`、`0002_loans_annotations`、`0003_works`；Task 006C 没有执行 migration。

## 3. Incident-State Backup

清理前使用项目已有的 database maintenance pre-upgrade 流程创建新的备份，未覆盖任何既有备份：

- 文件：`D:\方寸数据\backups\pre-upgrade\fangcun-task006c-pre-cleanup-20260909-072319833.db`
- sidecar：`D:\方寸数据\backups\pre-upgrade\fangcun-task006c-pre-cleanup-20260909-072319833.db.json`
- SHA-256：`f7e15dde0e8b2e377096bf051ebf0ea29a9f24e6de8e26b035a00c07fc9886eb`
- 数据库完整性：`ok`
- quick check：`ok`
- 外键违规：`0`
- 备份计数：Works 2、Editions 3、Copies 3、Locations 3、Loans 0、Annotations 0

该备份是清理前的 incident-state 证据；它与先前的正式基线备份独立存在。

## 4. Exact Fixture Inventory

本次清理目标由 exact ID 与额外字段条件共同限定：

### Edition

- ID：`__FANGCUN_TASK006_FORMAL_WRITE_SMOKE_20260909T065026160Z_sjh3jt32__-edition`
- title：`__FANGCUN_TASK006_FORMAL_WRITE_SMOKE_20260909T065026160Z_sjh3jt32__ edition`
- authors：`["Fangcun Task 006"]`
- source：`task006-write-smoke`
- `work_id`：`NULL`

### Copy

- ID：`3a38767c-3040-4bcf-9cd0-043c357ed3ad`
- `user_id`：`local-owner`
- `edition_id`：上述 exact Edition ID
- `shelf_location_id`：`51e52298-3459-43e8-968a-a5eea338182d`
- `shelf_slot`：`11`
- `deleted_at`：`2026-09-09T06:50:26.324Z`

### Location / Shelf

- ID：`51e52298-3459-43e8-968a-a5eea338182d`
- name：`__FANGCUN_TASK006_FORMAL_WRITE_SMOKE_20260909T065026160Z_sjh3jt32__ shelf`
- room：`__FANGCUN_TASK006_FORMAL_WRITE_SMOKE_20260909T065026160Z_sjh3jt32__ room`
- `user_id`：`local-owner`
- `sort_order`：`2`
- `active`：`1`

### Work

没有与该 fixture 对应的 Work；审计确认 Work 表中仅有两个真实用户记录，且没有 marker Work。

## 5. Dependency and Safety Audit

清理前再次使用只读查询确认：

- exact Copy 存在且归属 `local-owner`。
- exact Copy 指向 exact Edition 和 exact Location。
- Copy 已软删除，`deleted_at` 非空。
- exact Edition 的 source 和 title marker 均匹配，且 `work_id IS NULL`。
- exact Location 的 name、room 和 owner 均匹配。
- 该 Location 没有其他 Copy。
- Loans：0。
- Annotations：0。
- Copy tags：0。
- Wishlist references：0。
- External references：0。
- 动态引用审计为 0；没有需要迁移到其他用户记录的依赖。

因此清理范围可以安全收敛为一个事务中的三个 exact fixture rows，不需要广泛条件删除。

## 6. Production Write Path Trace

正式写入链路如下：

`components/add-book-page.tsx` 的按书名/版本确认 → `POST /api/catalog/books/from-edition` → `app/api/catalog/books/from-edition/route.ts` → `repository.createOwnedCopy` → catalog adapter 的事务写入。

当前源码中的 route 已调用 repository 的 Work-aware 创建边界。`lib/db/repository.ts` 将创建委托给 `lib/db/catalog-adapter.ts`；adapter 根据 schema truth 检查 Work 表、`book_editions.work_id` 和已记录 migration，再以事务完成 Work、Edition、Copy 的创建和关联。

对旧正式 release `2026-09-08_223319` 的 route bundle 和 repository bundle 做了静态检查：它仍包含旧的直接 `INSERT INTO book_editions` / `INSERT INTO owned_copies` 逻辑，没有 Work 创建和 `work_id` 关联。这与正式库的事故形态一致。

## 7. Root Cause

根因是正式 runtime 使用了 stale release bundle：`2026-09-08_223319` 构建于 Work-aware adapter 集成之前，虽然工作区源码已经具备新的 adapter 逻辑，但旧 release 的 Next server bundle 仍携带 legacy `repository.createOwnedCopy` 实现。

因此：

- 不是 0003 migration 未执行导致的 schema 不存在；正式库当时已经有 Work schema。
- 不是请求参数偶发缺失；旧 bundle 的写入边界本身就没有 Work 创建/关联。
- 是 source 与实际运行 release 不一致导致的生产写入路径漂移。

## 8. Code Fix and Release Packaging

修复采用工作区已有的 Work-aware production path：

- `lib/db/repository.ts` 的 `createOwnedCopy` 委托给 `createCatalogOwnedCopy`。
- `lib/db/catalog-adapter.ts` 在 work schema ready 时，使用同一 SQLite transaction 创建/复用 Work，创建带 `work_id` 的 Edition，再创建 Copy。
- `ensureEditionInTransaction` 统一 Edition 去重和 Work 关联。
- 任一字段校验、Work/Edition/Copy 写入失败，事务整体回滚。
- 新 release：`D:\图书库\runtime\releases\2026-09-09_IncidentRepair`
- 新 build ID：`_FfAZIB--lN5O8FdEkJhZ`

新 release 静态检查 PASS：route bundle 不再包含旧的 standalone Edition/Copy insert path；Work-aware bundle 同时包含 `INSERT INTO works` 和 `work_id` 关联逻辑。

Task 006C 没有对正式数据库执行 schema migration，也没有在事故处理中修改真实用户业务数据。

## 9. Write Boundary After Fix

修复后的创建边界为单一事务：

1. 校验输入和 schema truth。
2. 创建或复用 Work。
3. 创建带 `work_id` 的 Edition。
4. 创建 Copy，并指向该 Edition 和用户位置。
5. 任一阶段失败则 rollback，不能留下半成品 Edition、Copy 或 Work。

回归测试包含故意制造的缺失 authors 场景，验证失败后计数和关系均保持不变，证明原子性边界有效。

## 10. Regression Verification

Targeted production-like write smoke：

```text
npm run test:e2e -- tests/e2e/write-smoke.spec.ts --reporter=list
```

结果：2/2 PASS（Chromium 与 mobile Chromium）。测试覆盖创建 Shelf、调用 `/api/catalog/books/from-edition`、读取 Copy detail、验证 Work/Edition 关联、故意失败的原子性场景、编辑、删除和 exact cleanup。

其他质量门禁：

- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：6 files，18 passed，1 skipped（预期的 migration/work 测试 skip）
- `npm run build`：PASS，Next 15.5.25，15 个静态页面

## 11. Full E2E Verification

完整 E2E：

```text
npm run test:e2e -- --reporter=list
```

结果：

- passed：32
- failed：0
- unexplained：0
- Chromium：16
- mobile Chromium：16

完整 E2E 输出中出现的 `NOT NULL constraint failed: book_editions.authors` 是测试专门注入的失败场景，用于验证事务回滚；它是预期日志，不是未解释的测试失败。

## 12. Isolated Lifecycle Verification

隔离环境中的 lifecycle 已验证：

`baseline → create → read/detail → search/mock catalog → edit → delete → exact cleanup → baseline compare`

结果：创建后 Work、Edition、Copy 关系完整；编辑和删除成功；故意失败的创建不改变 baseline 计数；清理后无 missing Work ID、orphan Work、orphan Edition、duplicate Work ID；integrity、quick check 和 foreign-key check 均通过。

E2E temporary server/database 已清理，没有残留的 Playwright/e2e server 进程或临时 writer。

## 13. Approval Basis

在执行正式清理前，以下条件均已满足：

- 根因已定位到旧正式 release bundle。
- Work-aware source path 已验证。
- 新 release 已构建并通过静态检查。
- targeted regression、完整测试和完整 E2E 均 PASS。
- incident-state backup 已创建并验证 SHA-256、integrity、quick check、FK。
- exact fixture 的 ID、owner、依赖、软删除状态均已审计。
- 用户已明确授权仅删除三个 exact fixture rows，并要求单一事务 cleanup。

## 14. Exact Cleanup Actions

在一个 SQLite transaction 中执行，仅允许以下三个带 exact ID 和额外 marker/owner 条件的 DELETE：

- Copy：删除 1 行。
- Edition：删除 1 行。
- Location：删除 1 行。

脚本对每条 prepared statement 要求 `changes === 1`；任一条不是 1 行则 rollback。执行结果 PASS，三条均为 1 行；没有 broad delete，没有删除 Work，没有级联删除其他用户记录。

## 15. Formal State After Cleanup

清理后的正式库状态与清理前已验证的正式基线一致：

| 指标 | 清理后 |
| --- | ---: |
| Works | 2 |
| Editions | 2 |
| Copies | 2 |
| Active Copies | 2 |
| Locations | 2 |
| Loans | 0 |
| Annotations | 0 |
| Editions missing `work_id` | 0 |
| Orphan Editions | 0 |
| Orphan Works | 0 |
| Duplicate Work IDs | 0 |

Migration history 仍为：

- `0001_archive_fields`
- `0002_loans_annotations`
- `0003_works`

Task 006C 没有执行 migration。

## 16. Formal Integrity and Baseline Comparison

最后一次正式库只读验证：

- database target：`FORMAL`
- database file：`D:\方寸数据\data\library.db`
- `valid`：`true`
- `workSchemaState`：`ready`
- `PRAGMA integrity_check`：`ok`
- `PRAGMA quick_check`：`ok`
- foreign-key violations：`0`
- `formalDatabaseMutation`：`false`

与权威正式基线备份
`D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T06-39-36-860Z.db`
的只读比较结果：Works 2、Editions 2、Copies 2、Active Copies 2、Locations 2、Loans 0、Annotations 0；migration history、logical rows 和 schema signature 均匹配。

基线备份 SHA-256 为 `0c2713cfc47afd5ca68b25a56127bef8252870f3ad0088dd8022c926bff45532`。当前 SQLite 文件的二进制 hash 可能因 WAL/checkpoint 表示不同而不同；本次以 logical rows、schema signature、integrity 和 FK 结果作为基线比较依据。

## 17. Runtime Restart Verification

修复 release 已按项目官方本地 promotion 机制激活，随后通过项目自有 `Fangcun Archive Service` 计划任务启动：

- service host PID：`36208`
- Next server PID：`5468`
- host command：`D:\node.exe D:\图书库\runtime\launcher\service-host.js`
- server command：`D:\node.exe D:\图书库\runtime\releases\2026-09-09_IncidentRepair\server.js`
- parent relation：Next PID 5468 的 parent 为 Fangcun host PID 36208
- listener：`127.0.0.1:3000`，由 server PID 5468 持有
- `/api/health`：`status=ok`、`database=ok`
- build ID：`_FfAZIB--lN5O8FdEkJhZ`
- `Fangcun Archive Service`：Running
- `Fangcun Archive Health Recovery`：Ready（Enabled）

进程归属通过完整 command line、parent relation、release path 和端口 owner 交叉确认。除 host/server 外发现的 watchdog 是项目自身的健康监控脚本，不是数据库 writer；没有其他 Fangcun Node writer，也没有触碰无关 Node、Windows service 或其他项目。

## 18. Files and Workspace Changes

本报告新增：

- `docs/upgrade/fangcun-v1-task006c-write-incident-repair.md`

修复 release 由当前工作区已有的 Work-aware source 和测试构建生成并通过官方本地 promotion 激活。工作区中还保留此前 Task 002–006 的源码、migration、adapter、runner、测试和 E2E 改动；这些既有改动未被覆盖或回退。

Task 006C 未创建 commit，未执行 push、PR 或外部 deploy。仅执行了 Task 006C 所需的本地 release promotion 和 runtime 重启。

## 19. Formal Database Changes

正式库在此前 Task 006 Phase B 事故中新增了上述 marker Edition、Copy、Location。Task 006C 清理时仅删除这三行：

- Work：NONE
- Edition：exact marker Edition，1 行
- Copy：exact marker Copy，1 行
- Location：exact marker Location，1 行

清理没有修改真实用户记录，没有修改 Loans、Annotations 或任何其他业务表，没有修改 schema，没有修改 migration history，没有执行 0003。

## 20. Incident Residue

残留检查结果：NONE。

- exact fixture Edition：不存在
- exact fixture Copy：不存在
- exact fixture Location：不存在
- marker Work：不存在且本次未创建
- missing Work ID：0
- orphan Edition：0
- orphan Work：0
- FK violations：0
- stale `service.pid`：无；运行态 pid state 指向当前 verified runtime
- E2E temporary writer：无

## 21. Remaining Risks and Boundaries

- 修复已打包并激活到本机正式 runtime，但尚未执行下一次真实正式写入 smoke；这是有意保留的边界。
- 后续任何正式写入都必须继续通过 Work-aware catalog adapter，不能重新激活 `2026-09-08_223319` 等旧 release。
- Task 006C 没有验证 Location/Contributor/Work merge，也没有做 UI redesign。
- Task 006D 需要新的 marker、新的备份和单独的明确批准；不得复用本次 cleanup 的 exact fixture。

## 22. Recommended Task 006D

推荐下一步：`Task 006D — Controlled Production Write-Smoke Revalidation`。

建议在单独审批后，使用当前 `2026-09-09_IncidentRepair` release 执行一次新的、可审计的正式最小写入 smoke：先创建 fresh incident backup，使用全新的 marker，验证 Work → Edition → Copy → Location 关系及失败回滚，再按单独授权决定是否 cleanup。Task 006C 本身不执行该正式写入。
