# Task 006 — Production Write Smoke & UI E2E Contract Cleanup

## 0. Metadata

| 项目 | 结果 |
|---|---|
| Repository | `200212szh-creator/fangcun` |
| Branch | `main` |
| Task | Task 006 — Production Write Smoke & UI E2E Contract Cleanup |
| 当前阶段 | **PHASE A** |
| 执行日期 | 2026-09-09（Asia/Shanghai） |
| Phase A 结果 | **COMPLETE** |
| 原始 E2E 起点 | 12/30 passed，18 existing failures（按本 Task 启动记录） |
| 正式数据库 | `D:\方寸数据\data\library.db`（只读复核，未写入） |
| Phase B | 未执行，等待精确授权 |

本报告只记录隔离 E2E contract、隔离 write-smoke 生命周期、测试安全边界和质量门禁。没有执行正式 write smoke，没有执行新的 migration，没有 commit、push、PR 或 deploy。

开始前按 Task 006 要求阅读了仓库说明、Task 001–005A 报告、当前 Playwright/E2E 实现、Add/Edit/Search/Collection/Book Detail、catalog adapter/write boundary、备份/校验工具和相关 handbook 文档。仓库中未找到 `AGENTS.md` 与 `NEXT_CODEX_TASK.md`，这是既有治理文件缺口，未在本 Task 中伪造或补写。

## 1. Starting State

Task 006 开始时，正式状态已经是 Task 005 完成后的状态：

- `schema_migrations`：`0001_archive_fields`、`0002_loans_annotations`、`0003_works`；
- Works = 2，Editions = 2，Copies = 2；
- Loans = 0，Annotations = 0，Locations = 2；
- `missing work_id` = 0，orphan Works = 0，orphan Editions = 0；
- foreign-key violations = 0，`integrity_check` = `ok`，`quick_check` = `ok`；
- 正式 Fangcun runtime 继续运行在 `127.0.0.1:3000`。

原 Playwright 配置使用 `localhost:3000`、`reuseExistingServer: true` 和共享 E2E 数据库路径。这不能证明测试请求一定不会落到正式服务，因此旧 E2E 在本 Task 之前被视为不能安全执行，而不是把潜在写入风险误报成产品失败。

## 2. Existing E2E Failure Inventory

以下表格按相同根因合并桌面/移动端重复失败；合计覆盖 Task 启动记录中的 18 个既有失败，不代表只存在表格中的一条测试断言。

| Test / failure family | Classification | Evidence | Action |
|---|---|---|---|
| Entry checkbox / direct redirect | A — STALE TEST CONTRACT | 入口页已经移除“下次直接进入”选项；点击入口后仍停留在入口页是当前合法行为 | 删除旧 checkbox/自动跳转断言，保留入口和 deep-link 断言 |
| Home statistics selector | D — SELECTOR FRAGILITY | 当前统计数字使用 `.atelier-stat-value`，不再使用旧 `.tabular-nums` | 改用 `region` + 稳定 class |
| Settings “五步开始使用” | A — STALE TEST CONTRACT | 该帮助板块已从当前设置页移除，当前设置页保留语言、数据、入口和本地模式 | 断言当前设置页 heading，不要求旧板块 |
| Book Detail collapsed fields | A — STALE TEST CONTRACT | 版本档案和购藏/副本档案默认由 `<details>` 收起 | 测试先通过 summary 展开，再填写字段 |
| Manage menu on empty data | B — FIXTURE FAILURE | 操作菜单需要可操作的书架/藏书 fixture，空库直接找菜单不是有效前置条件 | 每个测试通过 fixture factory 准备自己的书架和书 |
| Shared localhost:3000 server | C — ISOLATION FAILURE | `reuseExistingServer` 可能把创建书、借阅、批注请求发送到正式服务 | 改为 test-owned server、`127.0.0.1:3017`、`reuseExistingServer:false` |
| Shared mutable DB with parallel workers | C — ISOLATION FAILURE | 原配置允许多 worker 共享可变库，测试之间会产生顺序和数据竞争 | worker=1、fullyParallel=false，每项测试前后 reset |
| CSS path / DOM-order selectors | D — SELECTOR FRAGILITY | 旧断言依赖复杂 CSS、DOM 次序、视觉位置或易变化完整文本 | 优先 role、label、accessible name；仅必要处使用固定属性 |
| Mobile overflow assertions | D — SELECTOR FRAGILITY | 初始失败未证明存在实际横向溢出；测量结果为 `scrollWidth=viewport` 且无越界元素 | 改为测量 document/element 几何边界，不用脆弱截图位置 |
| Search loading timing | D — SELECTOR FRAGILITY | 快速输入与 delayed loading 是时序 contract，旧测试没有等待真实请求启动 | 等待请求后验证 delayed status |
| Keyboard skip-link focus | A — STALE TEST CONTRACT | 当前 route effect 会先聚焦 main；“第一个 Tab 必须出现 skip link”不是当前行为规范 | 显式 focus skip link，再验证 anchor 跳转 |
| Import preview exact text | D — SELECTOR FRAGILITY | 预览行文本包含行号前缀（如 `#2 · ...`），不能 exact-match 书名；受控 textarea 还需要等待水合 | 使用可见书名片段、稳定 textarea selector 和输入重放窗口 |

## 3. Failure Classification

| Classification | 结论 |
|---|---|
| A. STALE TEST CONTRACT | 已处理：入口偏好、统计 class、设置页旧板块、收起档案、skip-link 初始焦点等 |
| B. FIXTURE FAILURE | 已处理：测试不再依赖空库中的操作菜单；fixture 由测试自己创建并由自动 reset 清理 |
| C. ISOLATION FAILURE | 已处理：隔离端口、隔离 SQLite、单 worker、test-owned lifecycle、suite teardown |
| D. SELECTOR FRAGILITY | 已处理：语义选择器、深链接参数、请求等待、精确但不脆弱的文本断言 |
| E. REAL PRODUCT REGRESSION | **0 个已确认**。没有发现需要修改当前产品 UI/业务规范的回归 |
| F. ENVIRONMENT / BLOCKED | **0 个残留**。一次 `npm test` 初始受正式 3000 端口门禁影响，已通过 runner 的目标范围隔离修复并验证 |

## 4. Test Contract Changes

- Playwright base URL 固定为 `http://127.0.0.1:3017`；不再复用 `localhost:3000`。
- `webServer` 改为 `node scripts/e2e-server.cjs`，`reuseExistingServer:false`，并设置 `FANGCUN_E2E=1`、`NODE_ENV=test`。
- `workers: 1`、`fullyParallel:false`，避免可变 fixture 之间发生竞争。
- E2E 测试使用自动 fixture：每项测试开始 reset 一次，结束再 reset 一次；reset 失败直接让测试失败。
- 深链接测试通过 `/search?q=...` 触发真实页面 contract，搜索上游在需要确定结果的测试中由 Playwright route mock 提供确定响应。
- Book Detail 测试按照当前 progressive disclosure contract，先展开对应档案再操作字段。
- Task 004 readiness 测试补齐 Import、Export 和 Runtime Health 的只读验证。
- production migration runner 的端口/writer 检查现在仅对 `FORMAL` target 生效；`ISOLATED` target 明确不复用正式端口和正式 writer。正式目标的停机门禁保持不变。

## 5. Product Regressions Found

**NONE。**

旧失败均可由合法 UI contract 变化、测试 fixture 缺失、隔离不足或 selector/timing 假设解释。没有发现“应创建 Work → Edition → Copy 但只创建 Edition”、写入半完成、真实 location 错乱或其他需要修改产品业务行为的事实。

## 6. Product Fixes Made

没有做视觉 redesign、主题变更、schema migration、真实用户数据修改或产品 UI 规范改写。

本 Task 做了一个最小的测试/运维边界修复：`scripts/migrate-v3-production.ts` 将 3000 端口和 Fangcun writer 扫描限定在 `FORMAL` target。这样隔离测试不再依赖正式服务必须停机，同时正式 migration 仍然要求端口不监听且无 Fangcun writer。该修改不改变 migration SQL、正式目标路径、审批 token 或正式执行流程。

## 7. Fixture Isolation

隔离 server launcher 的行为如下：

1. 创建形如 `%TEMP%\fangcun-playwright-*` 的临时 root；
2. 在临时 root 创建 SQLite 文件；
3. 使用 `npm run db:migrate:isolated` 初始化到 E2E 所需的 `0001`、`0002`、`0003` schema；
4. 设置 `DATABASE_URL`、`FANGCUN_DATA_DIR`、`FANGCUN_MIGRATION_DATABASE`、`FANGCUN_MIGRATION_TARGET=ISOLATED`、`FANGCUN_E2E=1`；
5. 仅监听 `127.0.0.1:3017`；
6. server close、SIGINT、SIGTERM 和 Playwright global teardown 均执行受控清理。

`/api/e2e/reset` 与 `/api/e2e/state` 只在 `FANGCUN_E2E=1` 且 `FANGCUN_MIGRATION_TARGET=ISOLATED` 时可用。reset 的宽范围删除只发生在整套 disposable E2E DB 上，不接收正式数据库路径，也不用于 Phase B cleanup。

最终检查结果：`127.0.0.1:3017` 不再监听，`fangcun-playwright-*` 临时目录没有残留。

## 8. Selector Strategy

选择顺序固定为：

1. `getByRole` + accessible name；
2. `getByLabel`、`getByPlaceholder`、表单 name；
3. 语义化 `main`、`region`、`status` 等稳定结构；
4. 只有不存在稳定语义时才使用固定属性或最小 locator。

已移除对复杂 CSS path、nth-child、屏幕坐标、视觉排序和完整易变句子的依赖。没有为了 E2E 大量向生产 DOM 增加 `data-testid`。

## 9. Final E2E Matrix

完整命令：`npm run test:e2e -- --reporter=list`，串行、单 worker。

| Suite | Chromium | Mobile | 覆盖 |
|---|---:|---:|---|
| `library.spec.ts` | 8/8 | 8/8 | Entry、Home、Collection、Search、ISBN、语言、双副本与详情 |
| `feedback-refinements.spec.ts` | 1/1 | 1/1 | Manage 操作菜单、标题检索、详情位置保存 |
| `motion.spec.ts` | 4/4 | 4/4 | 桌面/移动动效、drawer、reduced motion、搜索 loading |
| `phase7.spec.ts` | 1/1 | 1/1 | 日常流程、书架位置、Loans、Annotations/Traces、QR、移动、Settings |
| `task004-readiness.spec.ts` | 1/1 | 1/1 | Home、Collection、Search、Add/Manual、Edit、Import、Export、Runtime Health |
| `write-smoke.spec.ts` | 1/1 | 1/1 | 隔离 Work → Edition → Copy 完整 write-smoke lifecycle |
| **合计** | **16/16** | **16/16** | **32/32 PASS** |

E2E skipped = 0；E2E blocked = 0；E2E unexplained failures = 0。

最低覆盖项确认：Home、Collection、Book Detail、Search、Add Book/Manual Entry、Edit Book、Loans、Annotations/Traces、Import、Export、Location compatibility（真实位置图/书架坐标）、Settings/Runtime Health 均有稳定检查。

## 10. Isolated Write-Smoke Design

隔离 write smoke 使用唯一 marker：

```text
task006-<crypto.randomUUID()>
```

创建的 shelf、edition、work title 和 source 都带有该 marker 或 `task006-write-smoke`，并通过真实应用写入边界完成创建：

```text
POST /api/catalog/shelves
POST /api/catalog/books/from-edition
```

不会直接 SQL insert Work、Edition 或 Copy。读取、编辑和删除继续走应用 route：

```text
GET   /api/catalog/books/:copyId
PATCH /api/catalog/books/:copyId
DELETE /api/catalog/books/:copyId
```

Search 使用真实 Search 页面和请求 contract，但在隔离 E2E 中 mock 外部 discovery 响应，以避免公共书目服务可用性影响 write-smoke 的数据库断言。

Phase A 的 test-only cleanup 接收本次 fixture 的 exact `marker + workId + editionId + copyId + shelfId`，先验证关系、marker、source、软删除状态和依赖 cardinality，再在一个 transaction 中删除这几个 exact object。没有 `LIKE '%TEST%'` 或无条件的宽范围删除。

## 11. Isolated Write-Smoke Results

隔离 DB 初始 baseline：Works、Editions、Copies、active Copies、Shelves、Loans、Annotations 全为 0；migration history 为 `0001_archive_fields`、`0002_loans_annotations`、`0003_works`。

| Check | Result | Evidence |
|---|---|---|
| A. Create Work → Edition → Copy | PASS | 真实 `from-edition` route 返回 201；读取确认 Edition 与 Work relation |
| B. Transaction atomicity | PASS | 故意省略 authors 触发 NOT NULL 失败；Work/Edition/Copy 计数保持 baseline。日志是受控的预期失败，不是测试失败 |
| C. Read-back | PASS | GET detail 返回对应 edition id、title、work id，且 `edition.workId === work.id` |
| D. Search | PASS | Search 页面读取唯一 marker，并显示 mock result title |
| E. Edit fixture | PASS | PATCH 修改 title、notes、shelf slot；随后 GET 验证三项 |
| F. Delete/Cleanup | PASS | production DELETE 先软删除；active catalog 不再列出；随后 exact-ID cleanup 成功 |
| G. Baseline restored exactly | PASS | cleanup 后所有 isolated counts 与起始值相等 |
| H. No orphan Works | PASS | `orphanWorks = 0` |
| I. No orphan Editions | PASS | `orphanEditions = 0` |
| J. No FK violations | PASS | `foreignKeyViolations = 0` |
| K. integrity_check | PASS | `integrity_check = ok`，`quick_check = ok` |

## 12. Cleanup Validation

cleanup 采用 fail-closed 顺序：

1. 检查 E2E/ISOLATED gate；
2. 检查 marker、source 和 exact IDs；
3. 检查 Work → Edition → Copy → Shelf 关系属于本次 fixture；
4. 检查 Copy 已由应用 route 软删除；
5. 检查没有 Loan、Annotation、Copy Tag、Wishlist 或 external reference 依赖；
6. 只删除 exact IDs；
7. 重新读取 counts、orphan、FK、integrity 和 quick check。

如果 identity 不确定、发现 fixture 与真实数据发生关系或 exact cleanup 失败，cleanup route 会拒绝继续，不会扩大删除范围。当前隔离 smoke 没有残留 fixture。

## 13. Production Fixture Safety Model

未来 Phase B 只允许创建一个独立 disposable fixture，并使用唯一、可审计的 marker，例如：

```text
__FANGCUN_WRITE_SMOKE_<timestamp>_<uuid>__
```

Phase B 必须保存创建响应中的 Work ID、Edition ID、Copy ID 和新建 Location/Shelf ID；所有读取、搜索、编辑、删除都只引用这些 ID。禁止编辑既有两本书、既有 Editions、既有 Works、既有 Locations，禁止给真实 Copy 建 Loan/Annotation，禁止批量 fixture、import roundtrip 或性能测试。

正式 cleanup 必须同时满足 marker、exact ID、关系和无依赖检查。失败时保留 fixture IDs 并停止，状态应为 `CLEANUP REQUIRED`，不得使用宽范围 SQL 清理。

## 14. Phase B Procedure

本节是未来受授权流程，不表示本 Task 已执行：

```text
FORMAL BASELINE READ-ONLY
→ fresh backup + SHA-256 + restore rehearsal
→ CREATE TEST WORK
→ CREATE TEST EDITION
→ CREATE TEST COPY
→ READ BACK
→ SEARCH
→ EDIT TEST FIXTURE
→ VERIFY
→ CLEANUP COPY
→ CLEANUP EDITION
→ CLEANUP WORK
→ FINAL FORMAL VALIDATION
```

只有收到精确消息 `GO — EXECUTE TASK 006 PHASE B` 才允许执行正式 write smoke。Phase B 开始前必须重新确认正式 DB path、migration history、baseline counts、integrity、FK、runtime 稳定和 fresh backup；任何变化都应 STOP。

## 15. Quality

| Command / check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 6 files，18 passed，1 explicitly skipped |
| `npm run build` | PASS — Next.js 15.5.25，15 static pages generated |
| `npm run db:validate` | PASS — read-only `D:\图书库\data\library.db`，`0001`/`0002`，integrity/quick/FK PASS；未指向正式库 |
| `npm run test:e2e -- --reporter=list` | PASS — 32/32，单 worker，Chromium + mobile |
| `git diff --check` | PASS |
| E2E listener/temp residue | PASS — 3017 not listening，no `fangcun-playwright-*` residue |
| Explicit formal read-only verification | PASS — baseline and Task 005 migration state unchanged |

唯一明确 skipped 的 Vitest 用例是代表性备份测试：只有提供 `FANGCUN_REPRESENTATIVE_DB` 时才运行；当前没有把正式备份路径注入测试环境，因此该 skip 是有条件且有解释的，不是未知失败。

正式数据库只做了显式 readonly probe，结果为：

```text
database: D:\方寸数据\data\library.db
migrations: 0001_archive_fields, 0002_loans_annotations, 0003_works
Works = 2, Editions = 2, Copies = 2
Loans = 0, Annotations = 0, Locations = 2
missing work_id = 0
orphanWorks = 0, orphanEditions = 0
foreignKeyViolations = 0
integrity = ok, quickCheck = ok
```

Task 005 备份仍存在且 SHA-256 为：

```text
D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T03-15-18-486Z.db
79ce0681274e234842ef89c9fad378f7bdb151c020757866cd3e837b1b0fe38f
```

## 16. Files Changed

Task 006 相关变更包括：

- `playwright.config.ts`：隔离端口、test-owned server、单 worker、teardown；
- `scripts/e2e-server.cjs`、`tests/e2e/global-teardown.ts`：临时 DB/server 生命周期；
- `tests/e2e/fixtures.ts`：每项测试的 reset 和 fixture factory；
- `app/api/e2e/reset/route.ts`、`app/api/e2e/state/route.ts`、`app/api/e2e/write-smoke/cleanup/route.ts`：仅隔离环境可用的测试支持边界；
- `tests/e2e/write-smoke.spec.ts`：隔离 Work/Edition/Copy write-smoke；
- `tests/e2e/task004-readiness.spec.ts`：Add/Manual、Edit、Import、Export、Runtime Health contract；
- `tests/e2e/library.spec.ts`、`feedback-refinements.spec.ts`、`motion.spec.ts`、`phase7.spec.ts`：selector、fixture、timing 与旧 contract 收敛；
- `scripts/migrate-v3-production.ts`：FORMAL/ISOLATED preflight 目标边界修复；
- 本报告。

工作区还包含 Task 001–005A 遗留的 migration、adapter、runtime、测试和文档变更；本 Task 没有重置、stash、checkout、reset 或删除用户已有变更。

## 17. Formal DB Changes

**NONE**

Task 006 Phase A 没有正式数据库写入，没有添加正式假书，没有执行 0004 或任何新 migration，没有修改正式业务对象。正式库只通过 readonly probe 验证。

## 18. Remaining Risks

1. Phase B 正式 write smoke 尚未执行，因此正式应用运行时的真实 CREATE/READ/SEARCH/EDIT/CLEANUP 仍需独立审批和窗口。
2. 外部公共书目服务的实时质量、延迟和限流没有作为隔离 write-smoke 的通过条件；E2E 使用确定性 mock 验证页面 contract。
3. Windows runtime 正式服务仍由现有 launcher/watchdog 管理；本 Task 没有停止、重启、升级或修改它。
4. 当前 Work 模型仍保留既有 Task 003 的兼容边界与“不自动 merge”规则；本 Task 没有扩大 Work dedup/owner scope。
5. `AGENTS.md` 与 `NEXT_CODEX_TASK.md` 缺失，后续任务仍应补齐治理来源或明确替代权威文档。

上述风险均未阻止 Phase A 的隔离交付；它们是 Phase B 或后续治理任务的明确前置事项。

## 19. Phase B Readiness

**READY — FOR EXPLICIT APPROVAL ONLY**

Phase A 已完成：隔离 E2E 32/32、隔离 write-smoke 全生命周期通过、无未知失败、正式库无变化、报告已生成。这里的 READY 只表示安全设计与隔离验证已经具备，不表示已获得正式写入授权。

本报告到此停止。等待精确授权：

```text
GO — EXECUTE TASK 006 PHASE B
```
