# Fangcun Task 003 — Work Compatibility Adapter & Consumer Regression

## 0. Task Metadata

- Task：Task 003 — Work Compatibility Adapter & Consumer Regression。
- 日期：2026-09-09（Asia/Shanghai）。
- 仓库：200212szh-creator/fangcun，分支 main。
- 起始提交：3b14fe6c5fafc72a010d383a6e64b65b48a9377a。
- 任务类别：FEATURE / DATA COMPATIBILITY（以 repository/domain adapter 为主）。
- 数据边界：所有新增测试使用临时数据库；Task 002 representative 场景使用已验证升级前备份的可写临时副本。正式运行数据库没有打开、迁移、回滚、checkpoint、覆盖或切换。
- 证据标记：VERIFIED=本轮直接读取或执行；INFERRED=由已验证事实推导；PRESENT BUT UNVERIFIED=代码存在但本轮没有安全执行完整流程；BLOCKED=因数据或服务隔离边界停止。

## 1. Executive Summary

Task 003 已完成。

本轮新增一个集中式 compatibility adapter，并将现有 repository 的核心 Edition / Copy 读写接入该边界：

    UI / route / discovery
            ↓
    lib/db/repository.ts
            ↓
    lib/db/catalog-adapter.ts
            ↓
    SQLite

实现结果：

- legacy schema 继续读取 book_editions 与 owned_copies，不要求 0003 已执行；
- 完整 Work schema 只在 works、book_editions.work_id 和 schema_migrations.0003_works 同时存在时启用；
- Work-aware read 返回可选的 OwnedCopy.work 与 BookEdition.workId，同时保留 Edition 的原始 title、authors、translators、ISBN 等字段；
- 新建 Copy 在 Work schema 下统一执行 Work → Edition → Copy，放在一个 SQLite transaction 内；
- Wishlist 新建 Edition 也经过同一 Work-aware Edition creation boundary；
- Book Detail 的 Edition + Copy 联合更新通过一个 repository 入口和一个 transaction 完成；
- 现有 createOwnedCopy、getOwnedCopy、listOwnedCopies、updateBookEdition、updateOwnedCopy 等 legacy method 保留；
- Work relation 缺失、schema 只完成一半或 migration history 未登记时，不静默返回错误数据，而是抛出明确的 CatalogCompatibilityError；
- Collection、Book Detail、Add/Create、Search 本地 fallback、Loans、Annotations、Import、Export、Wishlist 均完成隔离 regression；
- 未做 Work merge、Contributor normalization、Location migration、UI 重构或正式数据库迁移。

## 2. Verified Starting State

Task 001/002 已确认：

- 现有物理模型是 book_editions → owned_copies，没有图书 first-class works；
- book_editions.authors 和 translators 仍是 legacy JSON string，必须保留；
- 0003 的隔离 migration 已证明一 Edition → 一 Work、幂等和 rollback rehearsal；
- ensureDatabase() 与 schema_migrations 存在 schema truth / migration truth 分裂风险；
- USER_ID = local-owner 是当前 single-owner 约定；
- research_works 是论文/研究域，不复用为图书 Work；
- 现有 routes 通过 lib/db/repository.ts 访问藏书数据，tags 和 health 仍有直接 DB access；
- 本轮工作区开始时已有 Task 001/002 交付物以及用户已有的未跟踪设计 PNG，本轮均未删除或修改。

本轮未将 0003 加入 ensureDatabase()，也未改变正式数据库。Work-aware code 的启用以 migration history 为 guard，而不是仅以表是否存在为依据。

## 3. Consumer Inventory

以下 inventory 基于真实仓库的 route、component、repository、discovery 和 runtime 代码。

| Consumer | 当前直接读取/写入 | 当前调用边界 | 是否直接 DB | Edition legacy 依赖 | Work-aware 处理 |
|---|---|---|---|---|---|
| Home | owned_copies JOIN book_editions 的统计/最近入藏 | /api/catalog/books、repository | 否 | title、authors、reading status | 通过 listOwnedCopies() 兼容；本轮未执行完整 UI 流 |
| Collection / Library | Copy + Edition 列表 | /api/catalog/books → listOwnedCopies() | 否 | title、authors、ISBN、publisher | 通过 adapter 附加可选 Work，保留旧字段 |
| Book Detail | 指定 Copy + Edition | /api/catalog/books/[copyId] → getOwnedCopy() | 否 | Edition 全部编辑字段、raw contributors | GET 返回 Work + Edition + Copy；PATCH 进入联合写入口 |
| Quick Edit | Edition 与 Copy 分开提交的旧 payload | Book Detail PATCH | 否 | title、authors、publisher、location 等 | route 仍兼容旧 payload，repository 内 transaction 收口 |
| Add Book / manual | 新 Edition + Copy | /api/catalog/books → createOwnedCopy() | 否 | title、authors、ISBN、metadata | Work schema 下 new Work → Edition → Copy |
| Add from edition | 外部候选 Edition + Copy | /api/catalog/books/from-edition → createOwnedCopy() | 否 | 外部候选转 BookEdition | 复用同一创建 boundary；不按标题/ISBN猜测 Work |
| Search | 外部 providers + 本地 Copy/Edition fallback | lib/discovery/providers.ts → listOwnedCopies() | 否 | title、authors、ISBN | 本地 fallback 继续工作；Work 不替代 Edition 搜索字段 |
| Loans | loans.copy_id 与 Copy 存在性 | repository / catalog loan routes | 否 | 通过 Copy 读取 Edition | Copy lookup 经 adapter，loan schema 未改 |
| Annotations | annotations.copy_id 与 Copy 存在性 | repository / annotation routes | 否 | 通过 Copy 读取 Edition | Copy lookup 经 adapter，annotation schema 未改 |
| Import | Import row 转新 Edition + Copy | /api/import/books/commit → createOwnedCopy() | 否 | title、authors、ISBN、publisher | 复用单一创建 boundary |
| Export | Copy + Edition 兼容 JSON/CSV | /api/export → exportData() | 否 | title、authors、publisher、ISBN、location | 旧 JSON/CSV 字段保留；Work 为可选内部扩展 |
| Wishlist | Wishlist Edition 的创建/读取 | addWishlist() / listWishlist() | 否 | title、authors、publisher、ISBN | 新 Edition 通过 Work-aware Edition boundary；输出 shape 保留 |
| Location | shelf_locations + Copy location fields | repository / shelf routes | 否 | Copy edition link | 本轮不迁移 Location；现有 Task 001/002 regression 保留 |
| Research | research_works、folders、relations | research routes / repository | 否 | 不依赖图书 Edition | 与图书 Work 明确隔离，本轮不改 |
| API routes | catalog/import/export/discovery | repository 或 provider | tags/health 有直接 DB | 旧 response shape | 只切换核心 catalog read/write，不做 breaking API change |
| Server actions | 未发现 | — | — | — | 不存在 |
| Background/runtime | Windows launcher、watchdog、maintenance | standalone server / raw runtime scripts | 是（runtime maintenance） | 不消费 Work | 本轮不改、不触发正式服务 |
| Windows runtime | formal data root、runtime pointer、backup | PowerShell/Node maintenance | 是 | 不消费 Work schema | PRESENT BUT UNVERIFIED；完整验证会触碰正式服务 |

## 4. Existing Data Access Boundaries

当前真实结构仍是：

    Page / Component
        ↓ HTTP
    Next.js API route
        ↓
    lib/db/repository.ts
        ↓
    Drizzle SQL wrapper / better-sqlite3
        ↓
    SQLite

发现的边界事实：

1. lib/db/repository.ts 是当前藏书核心读写集中点，适合承担本轮兼容入口。
2. lib/discovery/providers.ts 的本地 fallback 通过 listOwnedCopies()，因此不需要在 Search route 中散落 Work SQL。
3. app/api/catalog/books/[copyId]/route.ts 以前分别调用 updateBookEdition() 和 updateOwnedCopy()；本轮改为调用 updateCatalogBook()。
4. app/api/catalog/tags/route.ts 和 app/api/health/route.ts 仍有直接 DB access，但不消费图书 Work/Edition/Copy 结果，本轮没有扩大改动面。
5. ensureDatabase() 仍负责 legacy bootstrap，不负责登记 schema_migrations；本轮没有重写 bootstrap。

## 5. Compatibility Adapter Design

主模块：

    lib/db/catalog-adapter.ts

该模块提供：

- getCatalogSchemaMode()
- loadWorksForEditions()
- assertEditionWorkRelation()
- createCatalogEdition()
- createCatalogOwnedCopy()
- CatalogCompatibilityError

Schema detection：

    legacy:
      works absent + book_editions.work_id absent

    work:
      works present
      + book_editions.work_id present
      + schema_migrations contains 0003_works

    explicit failure:
      only one of works / work_id exists
      OR Work schema exists without recorded 0003

该策略有两个目的：

- 尚未执行 0003 的旧数据库继续可读写，避免因添加 adapter 造成 outage；
- 已出现 Work 表或 Work 列但没有迁移记录时，不把不受 migration 管理的结构当成正常 schema。

Work-aware read 不改写 legacy Edition metadata。它先读取 Edition/Copy 当前字段，再按 Edition id 加载 Work；Work 关系异常时抛出明确错误，而不是把 Work title 静默当成 Edition title。

## 6. Work / Edition / Copy Domain Boundary

本轮采用最小领域形状：

    Work
    - id
    - title
    - originalTitle?
    - description?
    - createdAt
    - updatedAt

    Edition
    - existing BookEdition fields
    - workId?

    Copy
    - existing OwnedCopy fields
    - work?       // compatibility view, not a new Copy identity

Work 不以 ISBN 为主键。Copy 仍以 owned_copies.id 为实体身份，Edition 仍以 edition_id 关联 Copy。

本轮没有：

- 给 Copy 增加 work_id；
- 修改 Loan、Annotation、Tag、Category、Location、Research 关系；
- 自动按 title、author、ISBN、publisher 或年份复用/合并 Work；
- 规范化 Contributor；
- 删除或覆盖 authors、translators 等 raw 字段。

## 7. Read Compatibility

读路径为：

    SELECT current Copy + Edition fields
            ↓
    legacy mode: return existing shape
    work mode: load Edition → Work relation
            ↓
    return existing Edition fields + optional Work view

兼容保证：

- book_editions.title 仍然是 Edition title 的来源；
- book_editions.authors / translators 继续按原 JSON 解析；
- publisher、publication year、edition statement、ISBN、cover、source、external id 等旧字段继续返回；
- Work title 不覆盖用户编辑过的 Edition title；
- 旧消费者只使用 title、authors、publisher、isbn 时无需迁移到新 API；
- 已迁移 schema 的 Copy 详情额外可取得 work，不会删除旧 response key。

异常行为：

- 完整 Work schema 下 Edition 没有 work_id 或目标 Work 不存在：WORK_RELATION_MISSING；
- Work 表和 work_id 只出现一边：INCOMPLETE_WORK_SCHEMA；
- Work schema 存在但 0003_works 未登记：WORK_MIGRATION_UNRECORDED。

## 8. Write Boundary

### 8.1 New Edition + Copy

现有所有藏书新建入口仍调用 legacy-compatible method：

    createOwnedCopy(input)
            ↓
    createCatalogOwnedCopy(input)

在 legacy schema：

    Edition → Copy

在 Work schema：

    new Work
        ↓
    new Edition(work_id)
        ↓
    new Copy(edition_id)

如果 Edition id 已存在：

- legacy schema 继续复用现有 Edition；
- Work schema 要求该 Edition 已有合法 Work relation，然后复用该 relation；
- 不按标题、作者或 ISBN自动寻找/合并其它 Work；
- 如果 relation 缺失，明确失败。

### 8.2 Wishlist Edition

addWishlist() 的新 Edition 创建改为调用 createCatalogEdition()，因此迁移后新 wishlist Edition 不会留下无 Work 的 Edition。Wishlist row 的 API response shape 保留；查询使用明确的 wishlist id / edition id aliases 并附加可选 workId。

### 8.3 Existing Edition + Copy / Update

updateCatalogBook() 是 Detail 联合更新入口：

    optional Edition update
            +
    optional Copy update
            ↓
    one SQLite transaction

旧 updateBookEdition() 和 updateOwnedCopy() 仍保留，以避免强制一次性迁移尚未升级的内部消费者。

## 9. Transaction Strategy

### Create

createCatalogOwnedCopy() 用 better-sqlite3 transaction 包住：

1. 检查已有 Edition；
2. 必要时创建 Work；
3. 必要时创建 Edition，并写入 work_id；
4. 创建 Copy；
5. 返回旧 API 所需的 { id, duplicateId }。

任何步骤抛错时，Work、Edition、Copy 一起回滚。回归测试使用在 Work 已创建后让 Edition 的 NOT NULL 写入失败的 fixture，确认三者没有半完成记录。

### Update

updateCatalogBook() 在一个 transaction 中调用现有 Edition/Copy update methods。成功提交后再重新读取兼容结果；失败时不会只提交其中一半。

### Non-goals

本轮没有把 Wishlist row、Loan、Annotation、Location 等不属于 Work/Edition/Copy 联合创建的操作强行合并进同一事务，也没有改写全局 transaction infrastructure。

## 10. Legacy Metadata Compatibility

本轮把 legacy contributor strings 当作合法数据源：

- authors 原始 JSON 不删除、不拆解、不排序、不覆盖；
- translators 原始 JSON 不删除、不拆解、不排序、不覆盖；
- Work 没有 contributor 字段，不会逼迫当前 consumer 改用新 Contributor API；
- Work title/description 只在新建 Work 时从输入复制一份，不反向覆盖 Edition；
- 外部 provider 仍只是候选数据，不会因为 adapter 而覆盖用户已编辑 Edition 字段。

验证覆盖：

- 迁移后 legacy Edition 的 title、authors、translators、ISBN 在 Collection/Detail 读取中保持；
- Import/Export 继续通过现有字段；
- Task 002 已验证 migration/rollback 不改变 legacy metadata snapshot。

## 11. Search Compatibility

当前 Search 有两部分：

1. Google Books / Open Library / Crossref 外部 discovery；
2. 外部服务无结果时，localBookCandidates() 使用 listOwnedCopies()，把 Edition title、authors、ISBN 组成搜索 haystack。

本轮策略：

- 不把 Search SQL 改成只读 Work title；
- 不删除 Edition title/author/ISBN 依赖；
- 通过 adapter 让 local fallback 得到同样的 legacy Edition shape；
- Work 信息作为可选附加字段，不影响现有 candidate mapper。

Regression 中把外部 fetch 替换为 503，验证本地 fallback 仍能按更新后的 Edition title 命中。真实外部 API 延迟、公共书目结果质量和网络可用性仍不在本轮安全自动化范围内。

## 12. Import / Export Compatibility

Import：

- /api/import/books/commit 仍将 row 映射为现有 BookEdition 输入；
- 仍调用 createOwnedCopy()，因此迁移后自动按 Work → Edition → Copy 写入；
- 没有新增 import schema，也没有重复创建同一个 Work 的标题匹配规则。

Export：

- exportData() 仍以 books: OwnedCopy[] 作为兼容结果；
- JSON/CSV 继续读取 Edition title、authors、publisher、year、ISBN、Copy location/status/notes；
- Work 是可选内部扩展，不删除或改名现有导出字段；
- 隔离 probe 实际调用 export route，并确认导入数据可被导出。

结论：Import / Export compatibility 为 PASS。完整用户文件跨版本恢复 rehearsal 仍属于独立运行/运维任务，不在本轮伪造为完成。

## 13. ensureDatabase / schema_migrations Guard

已实现最小 guard，未重写 bootstrap：

- ensureDatabase() 继续只建立 legacy 表；
- adapter 不把 Work 表加入 ensureDatabase()；
- adapter 检查 works 与 book_editions.work_id 是否成对存在；
- adapter 检查 schema_migrations 是否存在 0003_works；
- 若 Work schema 未登记，不静默降级为 legacy，也不静默生成 Work；
- 完整 Work schema 下每次 Work-aware read/write 都通过同一检测。

Guard regression：

    manually create works + book_editions.work_id
    without schema_migrations.0003_works
            ↓
    WORK_MIGRATION_UNRECORDED

状态：PASS（范围是 0003 consumer guard；全局 schema bootstrap 单一真相仍是后续任务）。

## 14. Regression Test Matrix

| Consumer | Before | After | Compatibility | Test |
|---|---|---|---|---|
| Collection | Edition direct | listOwnedCopies() + optional Work | PASS | isolated probe invokes catalog GET and checks title/authors/ISBN/Work |
| Book Detail | getOwnedCopy() + two update calls | same legacy read + updateCatalogBook() | PASS | isolated probe invokes GET/PATCH; checks Work + Edition + Copy |
| Quick Edit | route coordinates Edition/Copy separately | route uses one repository transaction | PASS | Detail PATCH regression |
| Add / Create | createOwnedCopy() creates Edition + Copy | same method creates Work first when schema supports it | PASS | catalog POST regression; Work count/link checked |
| Add from edition | same create method | same adapter boundary | PASS by shared path | route remains unchanged and shares create method |
| Search | local fallback reads Edition fields | dual-compatible Edition read, optional Work | PASS | upstream mocked unavailable; local title fallback hits |
| Loans | Copy lookup + loans table | Copy lookup through adapter; loans unchanged | PASS | create/list loan in isolated probe |
| Annotations | Copy lookup + annotations table | Copy lookup through adapter; annotations unchanged | PASS | create/list annotation in isolated probe |
| Import | rows call createOwnedCopy() | rows call same Work-aware boundary | PASS | import commit route regression |
| Export | OwnedCopy[] with Edition fields | same fields plus optional internal Work | PASS | export route regression |
| Wishlist | Edition-only creation | new Edition uses Work-aware creation; old output shape retained | PASS | add/list wishlist regression |
| Location | shelf tree and Copy fields | unchanged | PASS by prior baseline | Task 001/002 repository regression; no migration here |
| Home | shared books API and statistics | shared adapter result | PASS by shared read path / UI unverified | no safe browser E2E |
| Windows runtime | runtime reads formal service database | unchanged | PRESENT BUT UNVERIFIED | intentionally not started |

## 15. Test Results

### Task 003 compatibility regression

Command：

    npm test -- --run tests/work-compatibility.integration.test.ts --reporter=verbose

Result：2 tests passed。

Covered：

- migrated legacy Edition read through Collection/Detail；
- Work + Edition + Copy response；
- Detail PATCH transaction boundary；
- manual Add route；
- Wishlist Edition creation；
- Import commit route；
- Loans and Annotations；
- Search local fallback with unavailable upstream；
- Export route；
- missing Work relation explicit error；
- Work/Edition/Copy create rollback on transaction failure。

### Full isolated suite

With the already verified representative backup path supplied only as a source for a temporary copy：

    npm test -- --reporter=verbose

Result：

    4 test files passed
    12 tests passed
    0 failed

Included unit tests、legacy repository integration、0003 fresh migration/idempotency/rollback、0003 representative backup-copy migration and Task 003 compatibility regression。

## 16. Quality Baseline

| Check | Result | Evidence |
|---|---|---|
| npm run typecheck | PASS | exit 0 |
| npm run lint | PASS | exit 0 |
| npm test | PASS | 4 files / 12 tests passed with representative backup-copy case enabled |
| npm run build | PASS | Next 15.5.25；15 static pages generated |
| npm run db:validate | PASS | unique temporary database；valid: true，editions/copies/shelves all 0 |
| E2E / Playwright | BLOCKED | existing config may reuse localhost:3000；cannot prove isolation from formal service |
| git diff --check | PASS | no whitespace errors |

No production dependency、lockfile、deploy configuration、global CSS、font file or layout file was changed。

## 17. Files Changed

### Task 003 active changes

- lib/db/catalog-adapter.ts
  - new Work schema detection、Work-aware read hydration、explicit compatibility errors and Work/Edition/Copy creation transaction。
- lib/db/repository.ts
  - routes core Copy/Edition reads through adapter；
  - delegates new Copy creation to adapter；
  - adds updateCatalogBook()；
  - sends Wishlist Edition creation through adapter；
  - preserves existing public repository methods。
- lib/db/schema.ts
  - adds typed works table mapping and optional bookEditions.workId mapping；
  - does not create the table at bootstrap。
- lib/types.ts
  - adds minimal Work type and optional compatibility fields。
- app/api/catalog/books/[copyId]/route.ts
  - uses updateCatalogBook() for Edition + Copy PATCH。
- tests/work-compatibility-probe.ts
  - isolated route/repository regression probe。
- tests/work-compatibility.integration.test.ts
  - isolated child-process test harness and schema guard regression。
- docs/upgrade/fangcun-v1-task003-work-compatibility-report.md
  - this report。

### Preserved prior/user files

The following existing untracked files were not modified、deleted、added or staged by Task 003：

- design-system/default/references/fangcun-editorial-home-v2.png — user-provided file。
- Task 002 migration scripts/tests/report。
- Task 001 baseline report。

## 18. Formal Database Changes

**NONE**

No formal runtime database was opened for writing。No formal 0003 was executed。No formal backup/checkpoint/restore、release promotion、service restart or runtime pointer change was performed。

The migration and compatibility tests used explicit isolated database paths。The representative source was copied to temporary storage before any write operation。

## 19. Breaking Changes

**NONE**

Details：

- Existing repository methods remain available。
- Existing Edition fields and raw contributor strings remain available。
- Existing Add、Import、Export and Search field dependencies remain valid。
- API response keys are not renamed or removed。Work data is optional and additive on compatibility results。
- The only new failure modes occur for invalid/partial Work schema states，where the previous code had no Work-aware behavior；these are explicit data-integrity failures rather than silent fallback。

## 20. Risks

1. Schema truth remains split（VERIFIED）：ensureDatabase() still creates legacy tables independently of migration history。Task 003 adds a Work-specific guard but does not unify global bootstrap。
2. Work scope remains single-owner/Open for future sharing（VERIFIED/INFERRED）：no owner_id was added to Work because the Handbook decision is not locked；formal multi-user/cloud work remains out of scope。
3. Existing DDL relation enforcement is limited（VERIFIED）：most Copy/Loan/Annotation relations still rely on application checks rather than declared foreign keys。
4. External Search quality is not fully verified（VERIFIED）：regression proves local fallback and legacy field compatibility，not public provider latency or result quality。
5. Wishlist Edition and Wishlist row are separate transactions（VERIFIED）：Work/Edition creation is atomic；the broader wishlist operation was not expanded into a global transaction because it is outside the required Work/Edition/Copy joint boundary。
6. Home and Windows runtime UI/operational flows remain unverified（VERIFIED）：safe E2E isolation is not available in the current configured server reuse mode。

## 21. Blockers

No blocker remains for the isolated Task 003 completion boundary。

The following remain blockers for formal 0003 execution or broader Work rollout：

- formal database migration approval and migration window；
- verified formal restore acceptance after migration；
- Work owner scope：global、owner-scoped or hybrid；
- Work merge/dedup policy、redirect/audit model and review flow；
- final Work/Edition/Copy API DTO contract；
- global ensureDatabase() / schema_migrations single-source bootstrap decision；
- safe isolated E2E/runtime service configuration。

## 22. OPEN Decisions

Task 003 intentionally does not promote these to LOCKED：

- Work owner scope and future sharing semantics；
- automatic Work reuse/merge policy；
- Contributor normalization and role/order semantics；
- Location typed hierarchy and canonical code；
- formal migration approval、rollback window and observation period；
- whether and when to expand richer Work data into public API response DTOs；
- Search provider quality/latency acceptance thresholds。

## 23. Recommended Task 004

Recommended next task：

Task 004 — Formal migration readiness and schema truth convergence design

Scope recommendation：

1. Decide the Work owner scope and final compatibility DTO contract。
2. Reconcile ensureDatabase() with schema_migrations in a separate、explicitly approved bootstrap task。
3. Define formal migration preflight、restore acceptance、approval、execution and observation evidence。
4. Add a safe isolated E2E server mode with an explicit database boundary before claiming browser/runtime verification。
5. Keep Work merge、Location migration、Contributor normalization and UI redesign as separate tasks。

Do not start formal database migration、Location migration、Contributor migration or UI refactor as an implicit continuation of Task 003。
