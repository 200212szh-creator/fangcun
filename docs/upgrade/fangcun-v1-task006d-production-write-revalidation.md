# Task 006D — Controlled Production Write-Smoke Revalidation

## 0. Metadata

- 日期：2026-09-09（Asia/Shanghai）
- Repository：200212szh-creator/fangcun
- Task：Task 006D — Controlled Production Write-Smoke Revalidation
- Formal database：D:\方寸数据\data\library.db
- 本轮只执行一次正式 disposable fixture write-smoke，随后 exact-ID cleanup 和 baseline restore。
- 未执行 migration、UI change、额外业务功能、commit、push、PR 或 external deploy。
- 仓库范围内未找到 AGENTS.md；本轮以 Task 006D 说明、Task 006 Phase A 报告、Task 006C 报告、Task 005 报告和当前源码为执行依据。

## 1. Active Release Verification

写入前首先验证 active release：

- Project release pointer：D:\图书库\runtime\releases\2026-09-09_IncidentRepair
- Data release pointer：D:\图书库\runtime\releases\2026-09-09_IncidentRepair
- release.json build ID：_FfAZIB--lN5O8FdEkJhZ
- /api/health build ID：_FfAZIB--lN5O8FdEkJhZ
- service host command：D:\node.exe D:\图书库\runtime\launcher\service-host.js
- Next server command：D:\node.exe D:\图书库\runtime\releases\2026-09-09_IncidentRepair\server.js
- 写入前 host PID：36208
- 写入前 Next PID：5468
- 127.0.0.1:3000：由 Next PID 5468 监听
- /api/health：status=ok
- database health：ok

旧 release 2026-09-08_223319 没有实际运行进程；active runtime、state pointer、server command 和 health build ID 全部指向 repaired release。

## 2. Formal Baseline Before

正式写入前只读 baseline：

| 指标 | Before |
| --- | ---: |
| Works | 2 |
| Editions | 2 |
| Copies | 2 |
| Active Copies | 2 |
| Locations | 2 |
| Loans | 0 |
| Annotations | 0 |

约束检查：

- migration history：0001_archive_fields、0002_loans_annotations、0003_works
- Missing Work ID：0
- Orphan Works：0
- Orphan Editions：0
- Duplicate Work IDs：0
- FK violations：0
- integrity_check：ok
- quick_check：ok
- databaseTarget：FORMAL
- database path：D:\方寸数据\data\library.db

## 3. Fresh Backup

正式 write-smoke 前使用项目已有 database maintenance pre-upgrade 流程创建新备份，未覆盖旧备份：

- 文件：D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-09T09-17-20-814Z.db
- sidecar：同路径追加 .json
- SHA-256：bcba437c92953570a99bf1e75c8e92ff00cbd1e52960a44ab604a5813a3420f3
- 备份时 counts：Works 2、Editions 2、Copies 2、Locations 2、Loans 0、Annotations 0

## 4. Backup Verification

Fresh backup gate 全部 PASS：

- timestamped：PASS
- collision / overwrite：未发现
- sidecar SHA-256：PASS
- backup integrity_check：ok
- backup quick_check：ok
- backup foreign_key_check：0 violations
- migration history：0001、0002、0003
- Work schema：ready
- baseline counts：匹配正式 baseline
- isolated restore rehearsal：PASS

Restore rehearsal 只将备份复制到临时隔离目录进行只读验证，验证后已删除临时副本，未覆盖正式数据库；formalDatabaseMutation=false。

## 5. Fixture Identity

本轮只创建一个带唯一 marker 的 disposable fixture：

- marker：__FANGCUN_TASK006D_WRITE_SMOKE_20260909T092050145Z_7a2666199abd__
- Work ID：a939ff8a-5ca7-4993-8523-348018909fc5
- Edition ID：__FANGCUN_TASK006D_WRITE_SMOKE_20260909T092050145Z_7a2666199abd__-edition
- Copy ID：128ad442-f7d0-46c4-a2fd-b8ebb2ece98f
- Location ID：ebe9a304-b2e4-43be-af73-b237ecaa8ff2
- fixture title：__FANGCUN_TASK006D_WRITE_SMOKE_20260909T092050145Z_7a2666199abd__ | formal production write smoke
- source：task006d-production-write-smoke
- owner：local-owner
- shelf slot：7

没有复用 Task 006 旧 fixture 的任何 ID。

## 6. Production Create Path

正式 create 通过 repaired runtime 的应用 API 完成，没有 raw SQL INSERT、repository bypass 或手工数据库 patch：

1. POST /api/catalog/shelves 创建本轮专用 disposable shelf，HTTP 201。
2. POST /api/catalog/books/from-edition 提交 marker Edition 和 shelfLocationId，HTTP 201。
3. route 调用 repository.createOwnedCopy。
4. repository 委托 lib/db/catalog-adapter.ts 的 Work-aware transaction boundary。
5. adapter 在同一 transaction 内创建 Work、创建带 work_id 的 Edition，再创建 Copy。

create API 返回 Copy ID 128ad442-f7d0-46c4-a2fd-b8ebb2ece98f，duplicateId=null。

## 7. Created Work

正式应用读取 Book Detail 后确认 Work 已创建：

- Work ID：a939ff8a-5ca7-4993-8523-348018909fc5
- Work title：__FANGCUN_TASK006D_WRITE_SMOKE_20260909T092050145Z_7a2666199abd__ | formal production write smoke
- marker：正确
- Work owner scope：本地应用的 local-owner 写入边界

Work 不是通过直接 SQL 创建，而是由当前 active repaired release 的正式 create path 生成。

## 8. Created Edition

- Edition ID：__FANGCUN_TASK006D_WRITE_SMOKE_20260909T092050145Z_7a2666199abd__-edition
- title：__FANGCUN_TASK006D_WRITE_SMOKE_20260909T092050145Z_7a2666199abd__ | formal production write smoke
- authors：Fangcun Task 006D Fixture
- publisher：Fangcun Task 006D
- publication year：2026
- source：task006d-production-write-smoke
- work_id：a939ff8a-5ca7-4993-8523-348018909fc5

Edition.work_id 非空，并且等于本轮新创建的 Work ID。

## 9. Created Copy

- Copy ID：128ad442-f7d0-46c4-a2fd-b8ebb2ece98f
- user_id：local-owner
- edition_id：__FANGCUN_TASK006D_WRITE_SMOKE_20260909T092050145Z_7a2666199abd__-edition
- shelf_location_id：ebe9a304-b2e4-43be-af73-b237ecaa8ff2
- shelf_slot：7
- reading status：unread
- deleted_at：NULL（创建后）

## 10. Relationship Validation

创建后正式数据库暂时变为：

| 指标 | After create |
| --- | ---: |
| Works | 3 |
| Editions | 3 |
| Copies | 3 |
| Active Copies | 3 |
| Locations | 3 |
| Loans | 0 |
| Annotations | 0 |

关系验证 PASS：

- Edition.work_id IS NOT NULL：PASS
- Edition.work_id == new Work ID：PASS
- Copy.edition_id == new Edition ID：PASS
- Work marker：PASS
- Edition marker：PASS
- Copy belongs to fixture：PASS
- missing work_id：0
- orphan editions：0
- orphan works：0
- foreign-key violations：0

## 11. Read-back

所有 read-back 使用正式应用 API：

- GET /api/catalog/books/128ad442-f7d0-46c4-a2fd-b8ebb2ece98f：HTTP 200
- Book Detail 返回 Work 信息：PASS
- Book Detail 返回 Edition 信息：PASS
- Book Detail 返回 Copy 信息：PASS
- detail.work.id：a939ff8a-5ca7-4993-8523-348018909fc5
- detail.edition.workId：a939ff8a-5ca7-4993-8523-348018909fc5
- Collection GET /api/catalog/books：HTTP 200
- Collection fixture matches：1
- Collection 未误命中真实藏书：PASS

## 12. Search

使用正式 Search API 搜索唯一 marker：

- endpoint：GET /api/discovery/search?type=book&q=marker
- create 后结果：1 条
- result source：本地藏书
- result title：正确命中 fixture marker
- 误命中真实藏书：0

fixture edit 后再次搜索仍能命中 marker。cleanup 后首次查询发现旧 fixture 结果仍在当前 Node 进程的内存 Search cache 中；这不是数据库残留。随后使用项目自身计划任务和 Node SIGTERM 完成优雅重启，清空进程内 cache。重启后正式 Search 返回 0 条 fixture marker，Collection 返回 0 条 fixture marker。

## 13. Edit

只编辑本轮 fixture：

- PATCH /api/catalog/books/128ad442-f7d0-46c4-a2fd-b8ebb2ece98f：HTTP 200
- title 改为 marker + formal production write smoke edited
- notes 改为 marker + edit-only note
- shelf slot 从 7 改为 8
- edit 后 read-back：PASS
- Edition.work_id 未改变：PASS
- Work / Edition / Copy relation 保持正确：PASS

没有编辑真实 location、category、tag 或现有用户藏书。

## 14. Reference Audit

cleanup 前的 exact reference audit 全部通过：

- fixture Work、Edition、Copy、Location exact IDs：匹配
- Copy 已由正式 DELETE API 软删除：PASS
- Loans 引用：0
- Annotations 引用：0
- Copy tags：0
- Wishlist edition references：0
- External Copy references：0
- External Edition references：0
- External Work references：0
- fixture shelf 的其他 Copy：0
- fixture Work 的其他 Edition：0
- 非 fixture 用户对象引用：0

## 15. Exact Cleanup

cleanup 顺序和执行结果：

1. 通过正式 DELETE API 软删除 fixture Copy，HTTP 200。
2. 使用 exact Work ID、Edition ID、Copy ID、Location ID 和 owner/relationship/marker guards 做 fail-closed 单事务 cleanup。
3. 删除顺序：Copy → Edition → Work → 专用 Location。
4. 每条 prepared DELETE 必须 changes===1，否则整体 rollback。

结果：

- Copy：删除 1 行
- Edition：删除 1 行
- Work：删除 1 行
- 专用 Location：删除 1 行
- broad delete：未执行
- 原有 2 个 Locations：未删除
- 其他真实对象：未删除

## 16. Formal Baseline After

cleanup 后正式库恢复为：

| 指标 | After cleanup |
| --- | ---: |
| Works | 2 |
| Editions | 2 |
| Copies | 2 |
| Active Copies | 2 |
| Locations | 2 |
| Loans | 0 |
| Annotations | 0 |

同时满足：

- Missing Work ID：0
- Orphan Works：0
- Orphan Editions：0
- Duplicate Work IDs：0
- migration history：0001_archive_fields、0002_loans_annotations、0003_works
- 与 fresh backup 的 18 个 runtime table logical rows：全部一致
- schema signature：一致

## 17. Real User Data Verification

fresh backup 与 cleanup 后正式库中的真实记录做了只读全字段比对：

- owned_copies：match
- book_editions：match
- works：match
- shelf_locations：match

原有真实 Copy：

- 30617184-a7df-4e6f-98db-347275b89be0
- c6a3c0d3-bd12-4fac-bde5-b1ed6486d72e

验证结果：

- ID：未变化
- Edition：未变化
- Work：未变化
- Location：未变化
- metadata：未变化
- delete state：未变化
- Real user records modified：NO

## 18. Integrity / Foreign Keys

最终正式库只读验证：

- databaseTarget：FORMAL
- database path：D:\方寸数据\data\library.db
- valid：true
- workSchemaState：ready
- migration history：0001、0002、0003
- integrity_check：ok
- quick_check：ok
- foreign_key_check：0 violations
- formalDatabaseMutation：false

## 19. Runtime Health

cleanup 和 cache-clearing graceful restart 后最终 runtime：

- release：D:\图书库\runtime\releases\2026-09-09_IncidentRepair
- Build ID：_FfAZIB--lN5O8FdEkJhZ
- service host PID：18560
- Next server PID：22472
- host parent：10028
- Next parent：18560
- 127.0.0.1:3000 listener owner：22472
- host command：D:\node.exe D:\图书库\runtime\launcher\service-host.js
- server command：D:\node.exe D:\图书库\runtime\releases\2026-09-09_IncidentRepair\server.js
- /api/health：status=ok
- database health：ok
- Fangcun Archive Service：Running
- Fangcun Archive Health Recovery：Ready / Enabled
- repaired runtime Node writers：仅上述 host/server 两个

重启过程中使用了项目自身的 scheduled task 和 Node SIGTERM；未使用强制 kill。

## 20. E2E

在隔离数据库和隔离端口上运行：

npm run test:e2e -- --reporter=list

结果：

- passed：32
- failed：0
- unexplained：0
- Chromium：16/16
- mobile Chromium：16/16
- 正式数据库：未被 E2E 使用

日志中的 NOT NULL constraint failed: book_editions.authors 是既有 write-smoke 的故意失败场景，用于验证 transaction rollback；该日志是预期的，不是 E2E failure。

## 21. Quality

- npm run typecheck：PASS
- npm run lint：PASS
- npm test：PASS，6 files，18 passed，1 skipped
- npm run build：PASS，Next.js 15.5.25，15 static pages
- npm run db:validate：PASS，databaseTarget=FORMAL
- backup restore rehearsal：PASS
- fresh backup SHA-256 verification：PASS
- formal baseline compare：PASS

## 22. Incidents

本轮没有再次发生 Work missing、work_id NULL、partial transaction 或 legacy production write path。

记录的操作性事件：

1. 首次 create 编排命令因变量插值冲突在发出 HTTP 前失败；没有创建记录，随后仅执行了一次正式 create。
2. 两次补充只读探针因内联 SQL 引号/参数解析失败；均未打开写事务、未改变数据库，随后使用稳定的只读脚本重跑并通过。
3. cleanup 后旧 marker Search 结果短暂存在于 Node 进程内内存 cache；通过 graceful restart 清除，重启后 Search 和 Collection 均无 fixture。
4. 优雅重启脚本最初把无 owner 的 TCP 过渡连接误判为 listener；实际 host/server 已退出，随后同一项目 Service task 安全恢复并验证健康。

上述事件均没有造成额外 fixture、真实数据变更、schema 变更或未解释的 E2E failure。

## 23. Fixture Residue

NONE。

- exact Work ID：0
- exact Edition ID：0
- exact Copy ID：0
- exact Location ID：0
- marker Work title：0
- marker Edition title：0
- marker Shelf name/room：0
- Collection marker matches：0
- post-restart Search marker matches：0
- Loans / Annotations / Tags / Wishlist / External references：0
- E2E temporary database/server residue：NONE

## 24. Task 006 Final Status

COMPLETE。

完成条件全部满足：

- active repaired release verified：PASS
- fresh backup verified：PASS
- create：PASS
- Work created：PASS
- Edition.work_id valid：PASS
- Copy linked correctly：PASS
- read：PASS
- search：PASS
- edit：PASS
- exact cleanup：PASS
- exact baseline restored：PASS
- real user records unchanged：PASS
- fixture residue：NONE
- integrity：PASS
- FK：PASS
- runtime：PASS
- E2E：32/32 PASS
- quality：PASS

Formal migration executed：NO。本轮没有执行任何 migration；既有 migration history 保持为 0001、0002、0003。

## 25. Recommended Task 007

推荐下一步：Task 007 — Production Write-Path Observation and Release Provenance Hardening。

建议在单独批准后处理：

- 为 active release、build ID、runtime pointer 和 route bundle 建立启动时 provenance/一致性检查；
- 为 Search cache 增加明确的 invalidation/observability contract，避免业务删除后短暂展示已删除的结果；
- 在新的备份和审批窗口下继续观察 Work → Edition → Copy 正式写入链；
- 保持当前 repaired release，不回退到 2026-09-08_223319；
- 不将 Task 007 自动扩展为 migration、Location migration、Contributor normalization、Work merge 或 UI redesign。

Task 006D 到此停止。
