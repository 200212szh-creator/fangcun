# Fangcun Task 002 — Work Migration Report

## 0. Task Metadata

- Task：Task 002 — Work Migration Design & Isolated Dry Run。
- 日期：2026-09-09（Asia/Shanghai）。
- 仓库：`200212szh-creator/fangcun`，分支 `main`。
- 审计/实现起点：`3b14fe6c5fafc72a010d383a6e64b65b48a9377a`。
- 本轮迁移 ID：`0003_works`。现有真实迁移顺序为 `0001_archive_fields`、`0002_loans_annotations`，因此 0003 可用（`VERIFIED`）。
- 任务类别：DATA MIGRATION。
- 证据标记：`VERIFIED`=直接读取或执行得到；`INFERRED`=基于已验证证据的结论；`UNVERIFIED`=本轮没有安全执行；`BLOCKED`=因安全边界或配置而停止。
- 规范来源：Task 001 基线报告、仓库 `README.md`，以及 Task 002 指定的 Handbook。任务要求写作 `handbook/04-data/`，附件实际对应目录为 `handbook/05-data/`，其中 6 份数据规范均已读取。
- 数据边界：只在 fresh temporary DB、临时备份副本和测试数据库上执行；没有打开、写入、迁移、回滚或恢复正式运行数据库。

## 1. Executive Summary

本轮已完成最小 Work 层迁移设计、迁移代码、隔离验证、二次执行幂等性验证和隔离回滚验证。

实现遵循保守策略：每个现有 Edition 创建一个独立 Work，不按标题、ISBN、作者、出版社、年份或 normalized title 自动合并；所有现有 Edition 字段、作者/译者 raw 字段、ISBN、Copy、Loan、Annotation 和位置数据均保留。

实际结果：

- Fresh isolated DB：1 Edition → 1 Work，Copy/Loan/Annotation/Location 计数保持不变。
- Representative backup copy：1 Edition → 1 Work，1 Copy、2 Locations 保持不变。
- Second run：迁移状态被识别为已执行，创建 Work 数量为 0。
- Rollback：两个隔离场景均移除 0003 新增层，恢复到无 `works`/无 `work_id` 的状态；legacy metadata 与迁移前快照一致。
- Quality：typecheck、lint、10 项测试、build、隔离 `db:validate` 均通过。

本轮没有把 Work 接入产品写入路径，也没有改动 UI、现有 repository、运行时或正式数据库。正式执行仍需解决 owner scope、Work merge policy 和正式写入边界等 OPEN 决策。

## 2. Verified Starting State

### 2.1 Repository and migration state

`origin` 指向目标 GitHub 仓库，当前分支是 `main`，审计起点为 `3b14fe6...`（`VERIFIED`）。Task 001 开始前已有用户未跟踪文件 `design-system/default/references/fangcun-editorial-home-v2.png`；本轮没有删除、添加、修改或清理它。

数据库代码当前通过 `ensureDatabase()` 建立 0.x 表结构；实际升级前备份副本的 `schema_migrations` 有：

```text
0001_archive_fields
0002_loans_annotations
```

没有 first-class `works` 表，`book_editions` 没有 `work_id`；`research_works` 是论文/研究记录，不是图书 Work（`VERIFIED`）。

### 2.2 Representative backup baseline

备份副本 sidecar 的 integrity 为 `ok`，SHA-256 与文件匹配，SQLite 只读 `integrity_check` 为 `ok`。本轮复制该备份到临时目录后再执行迁移，源备份没有被写入。

代表性备份迁移前计数：

| 表/指标 | 数量 |
|---|---:|
| `book_editions` | 1 |
| `owned_copies` | 1 |
| `loans` | 0 |
| `annotations` | 0 |
| `shelf_locations` | 2 |
| `categories` | 0 |
| `tags` | 0 |
| `copy_tags` | 0 |
| `wishlist_items` | 0 |
| `research_works` | 0 |
| `research_folders` | 0 |
| `concepts` | 0 |
| `works` | 不存在 |
| `book_editions.work_id` | 不存在 |

## 3. Decisions Used

本轮只使用已 LOCKED 或为隔离演练明确限定的决策：

1. 领域层保持 `Work → Edition → Copy`，Copy 仍是产品核心对象。
2. 初始 backfill 严格采用“一条现有 Edition 创建一个独立 Work”。相同标题、作者、语言或 ISBN 不触发合并。
3. Work 使用独立 ID；迁移脚本复用项目现有 `crypto.randomUUID()` ID 规则，不引入新 ID 库。
4. Work 最小字段为 `id,title,original_title,description,created_at,updated_at`。没有机械复制未证明需要的 subjects、language、external IDs 或 canonical metadata。
5. 迁移只新增 `works` 表、可空 `book_editions.work_id` 和索引；不删除或重命名旧字段。
6. 回填只使用本地 `book_editions` 数据，不访问网络，不依赖 AI、模糊匹配或外部书目服务。
7. 迁移脚本必须收到 `FANGCUN_MIGRATION_TARGET=ISOLATED` 和显式绝对路径 `FANGCUN_MIGRATION_DATABASE`，否则在打开数据库前拒绝执行。
8. 0003 不改变现有 repository/API 读取和写入路径；兼容性通过不切断 legacy 路径实现，而不是一次性重写消费者。

## 4. OPEN Decisions Not Resolved

以下事项仍未被本轮自行升级为 LOCKED：

- Work 是 owner-scoped、global/shared 还是 hybrid。当前脚本暂不添加 `owner_id`，只是为了避免在未决的 scope 上形成不可逆承诺；这不是永久模型决定。
- Work merge/dedup 的审核方式、redirect/audit mapping 和首版 UI。
- Work、Edition、Copy 创建的最终 repository/domain adapter 入口，以及是否要把 adapter 作为 0003 后的独立任务。
- Contributor 规范化、作者/译者角色与 raw 字段长期兼容策略。
- 位置层级和 canonical code；本轮没有修改 Location schema。
- 正式迁移批准、正式 rollback 窗口和迁移后观察周期。

这些 OPEN 项不阻塞本轮隔离 dry-run，但阻塞正式数据库执行和新 Work 写入路径切换（`VERIFIED/INFERRED`）。

## 5. Proposed Work Model

### 5.1 Minimal table

```sql
works (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  original_title TEXT,
  description  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
)
```

`book_editions.work_id` 为初始可空关系字段，并建立 `idx_book_editions_work_id`。Work 暂不声明 `owner_id`，因为当前 `book_editions` 没有 owner scope，而 Handbook 没有锁定 Work 的 global/owner/hybrid 选择；将两者强行绑定会把 OPEN 决策伪装成已确定设计。

### 5.2 Relationship

```text
works.id
    ↑
book_editions.work_id
    ↑
owned_copies.edition_id → book_editions.id
```

本轮不向 Copy 添加 `work_id`，不改变 Copy identity，不改变 Loan、Annotation、Tag、Wishlist 或 Research 关系。

## 6. Migration Design

### 6.1 Preconditions

0003 runner 在打开指定隔离数据库后检查：

- `FANGCUN_MIGRATION_TARGET` 必须等于 `ISOLATED`；
- `FANGCUN_MIGRATION_DATABASE` 必须是显式绝对路径；
- `book_editions`、`owned_copies`、`loans`、`annotations`、`shelf_locations`、`schema_migrations` 存在；
- `0001_archive_fields` 和 `0002_loans_annotations` 已记录；
- 若发现部分存在的 Work 层含孤儿 link，则拒绝继续，不自动修复。

### 6.2 Required sequence

本轮实现的迁移顺序是：

```text
ADD
→ BACKFILL
→ COMPATIBILITY / DUAL READ
→ VALIDATE
→ SWITCH WRITE PATH
→ OBSERVE
→ CLEANUP LATER
```

实际只执行了 ADD、BACKFILL、COMPATIBILITY 设计、VALIDATE 和隔离 rollback rehearsal；没有执行正式 SWITCH WRITE PATH、OBSERVE 生产数据或 CLEANUP。

### 6.3 Idempotency

迁移先检查 `schema_migrations` 中的 `0003_works`：

- 已存在时只运行 Work 状态验证，不创建新 Work；
- 不存在时，在一个 SQLite transaction 中创建表、按 `book_editions.id` 排序回填、建立索引、验证并登记 migration row；
- `work_id` 是可空新增列，适配 SQLite 没有通用 `ADD COLUMN IF NOT EXISTS` 的限制；
- SQL draft 是 runner contract，不能脱离 runner 直接当作可重复原地执行脚本。

## 7. Schema Changes

本轮新增的 schema draft：

- `migrations/0003_works.up.sql`
  - `CREATE TABLE IF NOT EXISTS works`；
  - `ALTER TABLE book_editions ADD COLUMN work_id TEXT`；
  - `CREATE INDEX IF NOT EXISTS idx_book_editions_work_id`。
- `migrations/0003_works.down.sql`
  - 删除索引；
  - 删除 `book_editions.work_id`；
  - 删除 `works`。

现有 `lib/db/schema.ts`、`lib/db/index.ts`、`lib/db/repository.ts` 没有被修改。这样做是刻意的：本轮先验证数据层迁移，不让 `ensureDatabase()` 自动预创建 0003 schema，也不让现有产品在未完成 consumer 兼容前依赖新表。

## 8. Backfill Strategy

对每一条 `book_editions`：

1. 读取 `id,title,original_title,description`；
2. 按 `id ASC` 顺序处理；
3. 使用现有 UUID 生成规则创建一个独立 Work；
4. 复制安全的 Work-level title/original title/description；
5. 仅在 `work_id IS NULL` 时设置 `book_editions.work_id`；
6. 在 transaction 内验证 Work 数量、Edition 映射、孤儿、重复 ID 和 FK 检查；
7. 最后记录 `0003_works`。

以下字段没有被覆盖或删除：`authors`、`translators`、publisher、publication data、ISBN、source、external_id、user_override、全部 Copy/Loan/Annotation/Location 数据。没有作者拆分、贡献者合并、标题相似度、ISBN 合并或外部 API 调用。

## 9. Read Compatibility

当前页面/API/repository 仍读取原有 `book_editions` 和 `owned_copies` 字段；本轮没有把 `work_id` 加入现有查询，也没有让任何现有消费者依赖 `works`。因此 0003 在完成后不会切断 0.x 读取路径。

后续 consumer 迁移建议：

```text
existing Edition reads
        ↓
optional WorkEditionCopyView adapter
        ↓
prefer Work relation, fallback to Edition legacy fields
```

在 Work consumer 完成前，`book_editions.title`、作者/译者 raw 值和其它 legacy metadata 继续作为当前显示与导出的兼容来源。任何 dual-read 差异应先记录，不应静默覆盖用户字段。

## 10. Write Boundary

本轮没有切换写入边界。当前写入仍由 `lib/db/repository.ts` 与 API route 组合完成，现有 `/api/catalog/books`、`/api/catalog/books/from-edition` 等消费者没有改变。

为后续任务确定的最小目标是：

```text
one Work/Edition/Copy adapter
        ↓
all new-entry writes
        ↓
Work → Edition → Copy
```

不要让 UI component 直接写数据库，也不要让多个 route 分别实现 Work 创建规则。该 adapter 和 owner 传递属于后续独立任务，不在 0003 dry-run 中大规模重构。

## 11. ensureDatabase / schema_migrations Risk

### Current Behavior

`lib/db/index.ts` 的 `ensureDatabase()` 使用 `CREATE TABLE IF NOT EXISTS` 直接补齐 0.x 当前表结构，但不创建或登记 `schema_migrations`。迁移脚本 `scripts/migrate.ts` 和 `scripts/migrate-v2.ts` 才会创建 migration history 并登记 0001/0002。

### Risk

schema truth 和 migration truth 分裂：一个数据库可能已经有表/列，却没有对应历史记录。若把 Work 表加入 `ensureDatabase()`，0003 可能被静默预创建，随后无法区分“已执行迁移”和“仅被启动代码补齐”。

### Recommended Resolution

本轮对 0003 做了最小必要防护，而不是重写 bootstrap：

- 0003 不使用 `lib/db` 的 `ensureDatabase()`，避免在 target guard 之前打开运行时数据库；
- runner 要求显式 `DATABASE TARGET = ISOLATED` 和显式隔离路径；
- runner 要求 0001/0002 已登记；
- runner 自己只在 transaction 中创建 0003 schema、backfill 和登记 0003；
- 以后应由独立任务统一 schema bootstrap 与 migration detection 的单一真相，但不能借 0003 顺手重写全局启动逻辑。

## 12. Isolated Test Environment

本轮所有 migration script 都拒绝非隔离目标。测试通过 `FANGCUN_MIGRATION_DATABASE` 指定临时绝对路径，并将 `FANGCUN_MIGRATION_TARGET` 设为 `ISOLATED`。

- Scenario A 使用临时 fresh DB，先运行现有 0001/0002，再写入测试用 Edition/Copy/Loan/Annotation/Location。
- Scenario B 从已验证升级前备份复制出临时 representative DB；源备份只读，临时副本可写。
- Scenario C 在每个临时 DB 二次执行 0003，确认 migration row 保护幂等性。
- 回滚脚本同样要求 `ISOLATED`，并拒绝非一 Edition→一 Work 的状态。
- 临时目录在测试完成后清理；没有改动 formal data root、formal DB、源备份或 runtime pointer。

## 13. Dry Run Results

### Scenario A — Fresh isolated DB

| 指标 | 迁移前 | 迁移后 |
|---|---:|---:|
| Editions | 1 | 1 |
| Copies | 1 | 1 |
| Loans | 1 | 1 |
| Annotations | 1 | 1 |
| Locations | 1 | 1 |
| Works | 不存在 | 1 |
| Editions without Work | 不适用 | 0 |

结果：`0003_works` applied，`createdWorkCount=1`；Work 验证中 `orphanWorks=0`、`orphanEditions=0`、`duplicateWorkIds=0`、`unexpectedNullWorkFields=0`、`foreignKeyViolations=0`（`VERIFIED`）。

### Scenario B — Representative existing DB copy

来源为已验证升级前备份的临时拷贝：

| 指标 | 迁移前 | 迁移后 |
|---|---:|---:|
| Editions | 1 | 1 |
| Copies | 1 | 1 |
| Loans | 0 | 0 |
| Annotations | 0 | 0 |
| Locations | 2 | 2 |
| Works | 不存在 | 1 |
| Editions without Work | 不适用 | 0 |

结果：`0003_works` applied，`createdWorkCount=1`，所有 Work link/空值/FK 检查为 0（`VERIFIED`）。选定的 legacy metadata（title、authors、translators、publisher、ISBN、original_title、description）在回滚后与迁移前快照一致；迁移 SQL 仅改变新增 `work_id` 和新增 Work 层。

### Scenario C — Second execution / idempotency

两个场景第二次执行均返回：

```json
{"status":"already_applied","migrationId":"0003_works","createdWorkCount":0}
```

没有重复 Work、没有重复写入、没有新的 migration row（`VERIFIED`）。

## 14. Data Validation

### 14.1 Structural and relationship checks

每次迁移后的验证包含：

- `works` 表存在；
- `book_editions.work_id` 存在；
- `works.count == book_editions.count`；
- `missing work_id = 0`；
- `orphan works = 0`；
- `orphan editions = 0`；
- duplicate Work ID = 0；
- `title/created_at/updated_at` unexpected nulls = 0；
- `PRAGMA foreign_key_check` violations = 0；
- `schema_migrations` 中存在 0003。

注意：现有 DDL 本身没有声明大部分关系 FK，因此 `foreign_key_check=0` 不能证明旧表已获得 FK enforcement；它只证明本次检查没有发现 SQLite 已声明约束的冲突。

### 14.2 Row-count and write-drift checks

fresh 与 representative 两个场景均记录并比较：

```text
book_editions
owned_copies
loans
annotations
shelf_locations
```

所有迁移后计数与迁移前一致。测试还捕获 legacy Edition 字段，在 rollback 后与迁移前快照做精确比较；结果一致。没有外部 API 参与，因此不存在外部元数据覆盖用户数据的问题。

### 14.3 Owner scope

0003 没有新增 owner scope，也没有引入 Auth。原因不是认定 Work 必须 global，而是当前 Edition 本身缺少 owner_id 且 Handbook 的 Work scope 仍 OPEN。正式写入前必须由后续任务决定 owner-scoped/global/hybrid，并设计兼容迁移。

## 15. Rollback Validation

两个隔离场景均执行 `rollback-work-migration.ts`：

- 先要求 Work 数量等于 Edition 数量；
- 要求每个 Edition 有 Work；
- 要求没有孤儿 Work；
- 要求没有一个 Work 被多个 Edition 共享；
- transaction 内清空 `work_id`、删除索引、删除列、删除 `works`、删除 0003 migration row。

回滚后验证结果：

```text
works table: absent
book_editions.work_id: absent
0001_archive_fields: present
0002_loans_annotations: present
0003_works: absent
Edition/Copy/Loan/Annotation/Location counts: unchanged
legacy metadata snapshot: identical
```

这是隔离 rehearsal 的 explicit down path。未来正式数据库的现实 rollback 路径应优先恢复已验证的迁移前备份；不能把 down SQL 当成已经验证过的生产恢复方案。迁移后若发生新 Work 或人工合并，rollback runner 会拒绝执行，避免删除非本次保守 backfill 产生的数据。

## 16. Quality Baseline

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | PASS，exit 0 |
| `npm run lint` | PASS，exit 0 |
| `npm test -- --reporter=verbose` | PASS，3 files / 10 tests |
| `npm run build` | PASS，Next 15.5.25，15 个静态页面生成 |
| `npm run db:validate` | PASS，隔离临时 DB，`valid:true` |
| Playwright | `BLOCKED`；配置复用 localhost:3000，可能触达正式服务，未运行 |

新增测试覆盖：fresh ADD/BACKFILL、代表性备份副本、关键计数、legacy metadata、二次执行幂等性和 rollback。Playwright 没有因为本轮迁移而强行改配置或启动不确定服务。

## 17. Files Changed

本轮新增且仅与 Task 002 直接相关的文件：

- `migrations/0003_works.up.sql`
- `migrations/0003_works.down.sql`
- `scripts/migrate-v3.ts`
- `scripts/validate-work-migration.ts`
- `scripts/rollback-work-migration.ts`
- `tests/work-migration.integration.test.ts`
- `tests/work-migration-env.d.ts`
- `docs/upgrade/fangcun-v1-task002-work-migration-report.md`

本轮没有修改：

- `lib/db/schema.ts`
- `lib/db/index.ts`
- `lib/db/repository.ts`
- 任何 `app/` 页面或 API route
- `globals.css`、`fonts.css`、`font-alias.css`、`app/layout.tsx`
- `package.json`、`package-lock.json`、生产依赖
- Location schema、Contributor 结构、Windows runtime、部署配置

用户原有的 `design-system/default/references/fangcun-editorial-home-v2.png` 保持未跟踪且未修改。

## 18. Formal DB Changes

**NONE**

本轮没有打开或写入正式数据库，没有运行正式 0003，没有执行正式 backup/checkpoint/restore，没有改变正式 runtime pointer，也没有进行 commit、push、PR 或 deploy。

## 19. Risks

1. **schema bootstrap 与 migration history 分裂**（`VERIFIED`）：本轮只对 0003 增加 target guard 和 precondition，未解决全局 `ensureDatabase()`/migration 单一真相问题。
2. **Work owner scope 未决**（`VERIFIED/INFERRED`）：本轮不添加 owner_id 可避免错误承诺，但正式 Work 写入、未来共享和多用户阶段仍需明确边界。
3. **旧表关系约束不足**（`VERIFIED`）：现有 DDL 缺少大部分 FK，孤儿检查目前靠验证脚本而非数据库约束；未来 Work/Edition/Copy adapter 需补充一致的关系校验。
4. **正式 rollback 仍依赖备份恢复**（`VERIFIED`）：隔离 down 已验证，但不应在生产数据已有新写入后强行删除 Work 层。
5. **现有 repository 未消费 Work**（`VERIFIED`）：这是本轮兼容性的安全选择，也意味着正式迁移后还需要独立 consumer/adapter 任务，不能宣称 1.0 Work 架构已经完成。

## 20. Blockers

阻塞正式 0003 或后续写路径切换的 OPEN 项：

- Work 的 owner scope：global、owner-scoped 或 hybrid；
- Work merge/dedup 是否首版提供，以及如何保留 redirect/audit；
- Work/Edition/Copy 的 repository/domain adapter 单一写入口；
- 正式数据库迁移窗口、批准人和 backup/restore acceptance；
- 0003 之后 dual-read DTO 的 API contract。

这些不是本轮隔离 dry-run 的失败项；它们是正式执行前必须完成的决策与审批项。

## 21. Recommended Task 003

推荐 Task 003：**Work compatibility adapter 与 consumer regression**。

建议范围：

1. 在不触碰正式数据库的前提下，为 Work/Edition/Copy 设计最小 domain DTO/adapter。
2. 将当前 repository 的 Edition 读取包装成 dual-read：优先读取 Work relation，缺失时兼容旧 Edition 字段。
3. 选择一个写入口（建议 `from-edition`/add flow）在隔离 DB 上实现 Work → Edition → Copy 写入，不改 UI 视觉。
4. 用现有 representative backup copy 验证 Book Detail、Collection、Add Book、Import/Export 的读取兼容性。
5. 记录 owner scope 决策；如果仍未决，保持单 owner compatibility，不引入 Auth。
6. 完成 adapter regression、schema detection、rollback checkpoint 后，再另行申请正式执行 0003。

Task 003 不应同时开始 Location migration、Contributor normalization、Work merge UI、视觉重构、Auth/cloud 或 runtime/deployment 改造。

## Appendix A — Commands Executed

主要命令与结果：

| 命令/操作 | 结果 |
|---|---|
| `git remote -v`, `git branch --show-current`, `git rev-parse HEAD` | 目标仓库、`main`、起点 commit 已确认 |
| `gh repo view 200212szh-creator/fangcun ...` | 仓库公开、默认分支 `main` |
| 按要求读取 AGENTS、README、NEXT、baseline、治理、数据、架构、runbook、contract、DoD | 完成；无跳过 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --reporter=verbose` | PASS，10 tests |
| `npm run build` | PASS |
| `npm run db:validate`（临时 `DATABASE_URL`） | PASS |
| `tsx scripts/migrate.ts` + `tsx scripts/migrate-v2.ts`（Scenario A 临时 DB） | PASS |
| `tsx scripts/migrate-v3.ts`（Scenario A/B，显式 ISOLATED） | PASS |
| `tsx scripts/validate-work-migration.ts`（Scenario A/B） | PASS |
| `tsx scripts/migrate-v3.ts` 二次执行（Scenario A/B） | PASS，`createdWorkCount=0` |
| `tsx scripts/rollback-work-migration.ts`（Scenario A/B） | PASS |
| backup copy / SHA / SQLite integrity probe | 源备份未写入，副本校验通过 |
| Playwright | 未执行，`BLOCKED`，避免复用正式服务 |
| `git diff` / `git status --short --untracked-files=all` | 改动仅为本轮新增迁移、脚本、测试和报告；用户原有 png 保留 |

## Appendix B — Relevant Evidence

- `lib/db/index.ts`：0.x `ensureDatabase()` 直接创建 legacy schema，不登记 `schema_migrations`。
- `lib/db/schema.ts`：当前没有 `works`，`book_editions` 没有 `work_id`；其余表与 Copy/Location 结构来自 Task 001 实测。
- `lib/db/repository.ts`：当前 Edition/Copy 写入、`local-owner` 和 raw metadata 路径；本轮保持不变。
- `scripts/migrate.ts`、`scripts/migrate-v2.ts`：真实的 0001/0002 migration history。
- `scripts/migrate-v3.ts`：ISOLATED target guard、precondition、ADD/BACKFILL/validation/idempotency。
- `scripts/validate-work-migration.ts`：counts、missing work、orphan、duplicate、unexpected null、FK 和 migration state 检查。
- `scripts/rollback-work-migration.ts`：仅允许隔离的一 Edition→一 Work rehearsal state，并验证 down path。
- `tests/work-migration.integration.test.ts`：fresh、representative backup copy、second run、metadata snapshot 和 rollback 自动化测试。
- `migrations/0003_works.up.sql` / `migrations/0003_works.down.sql`：0003 schema draft。
- `handbook/05-data/01-domain-model.md`、`02-work-edition-copy.md`、`03-location-model.md`、`04-custom-fields-integrity.md`、`06-data-quality.md`：Work/Edition/Copy、raw metadata 保留、位置不猜测和数据质量约束。
- `handbook/00-governance/03-decision-register.md`、`07-migration-governance.md`：LOCKED/Open 决策、additive-first、备份/隔离/验证/回滚顺序。
- `handbook/15-operations/03-v1-data-migration-runbook.md`：0003 建议逻辑、计数/孤儿验证和正式迁移前置条件。
- 升级前备份副本：`<formal-data-root>/backups/pre-upgrade/fangcun-pre-upgrade-2026-09-08T14-41-04-206Z.db`；只读作为 Scenario B 复制源，正式数据库未触碰。
