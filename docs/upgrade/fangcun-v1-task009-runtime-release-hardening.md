# Fangcun v1 Task 009 — Phase A

## Windows Runtime & Release Hardening Root-Cause Audit

审计时间：2026-09-20T18:27:44+08:00<br>
审计分支：`engineering/task009-runtime-hardening`<br>
审计 worktree：`D:\图书库\.worktrees\task009-runtime-hardening`

本阶段只执行只读审计与目标架构设计。没有停止当前 Fangcun runtime，没有修改正式数据库、迁移、schema、release pointer、计划任务或产品代码。

## 1. 审计基线

| 项目 | 结果 |
|---|---|
| Repository | `200212szh-creator/fangcun` |
| Current main | `5f30520ee2f8f03fa40f428f9b8273803eaa5284` |
| origin/main | `5f30520ee2f8f03fa40f428f9b8273803eaa5284` |
| Main working tree | CLEAN |
| Audit branch base | `5f30520ee2f8f03fa40f428f9b8273803eaa5284` |
| Runtime executable baseline | `b89ca628f332933e873db63266c9b0bc545e5a39` |
| Active release | `2026-09-13_Task008B_PhaseA1_contributor_main_final` |
| Build ID | `WK8jgGgNr-Oya-8B8-6pL` |
| Formal database | `D:\方寸数据\data\library.db` |
| Formal migrations | `0001_archive_fields`, `0002_loans_annotations`, `0003_works`, `0004_location_model`, `0005_contributors` |

`b89ca628...` 之后到当前 main 的三个提交均为报告 checkpoint：

- `aafbf77` — Task 008B Phase A.1 report，docs/report only。
- `90443d8` — Task 008B Phase B report，docs/report only。
- `5f30520` — Task 008C-R report，docs/report only。

差异路径只有：

- `docs/upgrade/fangcun-v1-task008b-contributor-production-migration.md`
- `docs/upgrade/fangcun-v1-task008c-contributor-production-write-smoke.md`

没有发现 runtime executable、migration、schema、API 或 UI 变更。当前 production release 因此继续以 `b89ca628...` 为 executable provenance baseline。

## 2. 当前生产运行态（只读）

### 2.1 进程与端口

审计开始及复核时，唯一 Fangcun writer chain 为：

```text
Task Scheduler / PowerShell watchdog PID 22536
  └─ D:\node.exe runtime\launcher\service-host.js       PID 9568
       └─ D:\node.exe runtime\releases\2026-09-13_Task008B_PhaseA1_contributor_main_final\server.js  PID 6276
```

- `127.0.0.1:3000` 的唯一 listener 是 PID `6276`。
- host 与 server executable 均为 `D:\node.exe`。
- `service.pid` 中的 release、build ID、source commit 与 health response 一致。
- 没有发现 `next dev` 或旧启动入口进程。
- 未执行停止、重启、强制终止或端口清理。

当前 `/api/health` 返回：

```json
{
  "app": "fangcun-archive",
  "status": "ok",
  "database": "ok",
  "release": "2026-09-13_Task008B_PhaseA1_contributor_main_final",
  "buildId": "WK8jgGgNr-Oya-8B8-6pL",
  "sourceCommit": "b89ca628f332933e873db63266c9b0bc545e5a39",
  "dirty": false,
  "provenanceStatus": "ok",
  "currentMigration": "0005_contributors",
  "schemaMigrationState": "ready"
}
```

### 2.2 Formal database只读核验

使用 SQLite readonly connection 检查了固定路径，没有执行 checkpoint、backup、写入或 schema 操作。

- migrations：`0001` 至 `0005_contributors`，顺序正确。
- `works`：2
- `book_editions`：2
- `owned_copies`：2
- `shelf_locations`：2
- `loans`：0
- `annotations`：0
- `contributors`：2
- `edition_contributors`：2
- `PRAGMA integrity_check`：`ok`
- `PRAGMA quick_check`：`ok`
- `PRAGMA foreign_key_check`：空结果，0 violations

现有 structured contributor 数据仍为：

- `Erich Maria Remarque` → `author`
- `芥川龙之介` → `author`

现有 legacy `book_editions` 数据仍为两本真实书，authors/translators 字段未被本审计触碰。

## 3. Runtime authority inventory

### 3.1 已安装计划任务

#### `Fangcun Archive Service`

- State：`Running`
- Enabled：`true`
- Trigger：当前用户 logon，`InteractiveToken`
- Action：
  `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "D:\图书库\runtime\launcher\watchdog.ps1" -ProjectRoot "D:\图书库" -DataRoot "D:\方寸数据"`
- Multiple instances：`IgnoreNew`
- Restart on failure：3 次，间隔 1 分钟
- Last result：`267009`（任务当前运行状态对应的 Windows Task Scheduler result）

#### `Fangcun Archive Health Recovery`

- State：`Ready`
- Enabled：`true`
- Trigger：从 2026-09-08 起每 5 分钟重复
- Action：同一 `powershell.exe` 调用 `watchdog.ps1 -Once -Port 3000`
- Multiple instances：`IgnoreNew`
- Restart on failure：未配置
- Last result：`0`

两个任务均标记为 Hidden，且 PowerShell 参数包含 `-WindowStyle Hidden`；但两个任务仍使用交互式用户 token。Hidden/WindowStyle 是配置意图，不是对所有 Windows 版本、重启时机和错误路径都“绝不出现控制台窗口”的可观测证明。

### 3.2 Startup 与桌面入口

实际 Startup 目录存在：

```text
C:\Users\17625\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\方寸后台恢复.lnk
```

其目标为：

```text
C:\Windows\System32\wscript.exe
"D:\图书库\runtime\launcher\startup-hidden.vbs" "D:\图书库" "D:\方寸数据"
```

`startup-hidden.vbs` 隐藏启动 `startup-recovery.ps1`。该脚本先检查健康状态，再触发 `Fangcun Archive Service`；若任务恢复等待失败，另行以隐藏 PowerShell 启动 watchdog fallback。

开始菜单中的“方寸”快捷方式也指向隐藏 PowerShell，运行 `launch-fangcun.ps1`。该入口在健康时打开浏览器，在不健康时先触发 Service task，失败后直接启动隐藏 PowerShell watchdog。

因此，当前可发起 runtime 的来源至少有：

1. Service task logon trigger。
2. Health Recovery task 的 5 分钟 trigger。
3. Startup `wscript.exe` → `startup-hidden.vbs` → `startup-recovery.ps1`。
4. 桌面/开始菜单 PowerShell launcher。
5. 手工运行 `scripts/install-fangcun.ps1)、maintenance 或 release 脚本。

第 5 类不是正常日常启动 authority，但属于可能创建后台进程或改变任务配置的运维入口，应被 release/installation policy 管理。

### 3.3 Source 与 deployed artifact 的可复现性问题

Git 当前只跟踪：

- `runtime/launcher/service-host.js`
- `runtime/launcher/watchdog.ps1`

但实际安装目录还存在被 `.gitignore` 忽略、未进入当前 main 的：

- `runtime/launcher/launch-fangcun.ps1`
- `runtime/launcher/startup-recovery.ps1`
- `runtime/launcher/startup-hidden.vbs`
- `runtime/launcher/post-reboot-verification.ps1`
- `runtime/launcher/make-icon.js`
- `runtime/launcher/fangcun.ico`
- `runtime/releases/*`

同时，当前 tracked `scripts/install-fangcun.ps1` 依赖这些未跟踪 launcher 文件。也就是说，安装/启动 authority 的完整行为目前不能仅由 current main checkout 重建。这是 release provenance 和 runtime hardening 的明确缺口，不在 Phase A 中直接修复。

## 4. Process chain and source classification

### 4.1 Confirmed

- 正常生产链是 `Task Scheduler → powershell.exe → watchdog.ps1 → Start-Process D:\node.exe → service-host.js → child Node server`。
- Service task 与 Health Recovery task 都能独立调用同一个 watchdog；二者是两个独立的 scheduler authorities。
- Startup shortcut 是第三个自动恢复 authority，会触发 Service task，并具备 fallback PowerShell 启动路径。
- `watchdog.ps1` 的长期循环每 30 秒做一次 health check，并在连续失败后执行带退避的 graceful stop/start。
- `service-host.js` 使用 `windowsHide: true` 启动 release server，并把 server stdout/stderr 写入 rolling service log。
- watchdog 使用 `Local\FangcunArchiveWatchdog` mutex，使并发 watchdog 大多会退出，但 mutex 不能把多个触发源变成一个发布/恢复 authority，也不能消除 PowerShell 进程本身的创建。

### 4.2 Probable flashing sources

没有在可用的 Task Scheduler Operational event history 中找到“窗口已经闪现”的直接事件证据，因此不能把某一次可见窗口归因标为已直接证明。基于调用频率与交互式 token，概率排序为：

1. **Health Recovery task：最高概率。** 每 5 分钟创建一次交互式 `powershell.exe`，即使健康也会启动脚本、读 release、请求 health 后退出。2026-09-20 watchdog log 在约 18:12–18:24 期间记录了多次 `watchdog-start once=True` / `release-check`，说明周期调用确实存在。
2. **Service task：中高概率。** 登录时启动一个长期交互式 PowerShell watchdog；任务配置为 Hidden，但仍属于交互会话。
3. **Startup recovery：中概率。** 登录时由 `wscript.exe` 隐藏启动 PowerShell，再触发主任务或 fallback PowerShell。它是额外 authority，并增加启动窗口/竞态复杂度。
4. **桌面/开始菜单 launcher：仅在用户点击时相关。** 它也使用 PowerShell，且 timeout/retry 路径会再次启动 PowerShell；不是每日无人操作闪现的首要来源。

### 4.3 Not responsible for normal daily flash

- `scripts/build-release.ps1` 的 `npm.cmd run build -NoNewWindow` 是手工构建路径，不是当前日常 runtime path。
- `scripts/e2e-server.cjs` 的 `cmd.exe`/Next dev 进程绑定隔离测试端口 3017，不属于 3000 正式服务链。
- 现有 Node service-host/server 不是首要窗口源：它们均已使用 `windowsHide: true`；不过仍需要由统一 host 管理 stdout/stderr 和 lifecycle。

## 5. Logging and observability findings

当前已有：

- `D:\方寸数据\logs\watchdog\watchdog-YYYY-MM-DD.log`
- `D:\方寸数据\logs\service\service-YYYY-MM-DD.log`
- `D:\方寸数据\logs\launcher\startup-recovery-YYYY-MM-DD.log`
- `D:\方寸数据\state\health-status.json`
- `D:\方寸数据\state\service.pid`
- service-host rolling log，单文件约 5 MB，保留/总量有清理策略。

缺口：

1. watchdog 日志没有稳定的 invocation ID、authority/source 字段，无法直接回答某次启动来自哪一个任务或快捷方式。
2. Task Scheduler 的 action stdout/stderr 没有独立捕获到 Fangcun audit log；任务级失败只能依赖 scheduler result 和脚本最终日志。
3. health state 会覆盖写入最新状态，缺少事件序列和启动 attempt history。
4. release check 处在 health polling 路径中，会制造高频日志噪声。历史日志证据：2026-09-13 有 `3648` 次 `release-check`、`58` 次 `health-timeout`；2026-09-20 当前 watchdog 日志已有 `25` 次 `release-check`。这会淹没真正的启动原因。
5. 没有一个面向运维的“single authority / current attempt / child exit code / recovery reason”结构化事件文件。
6. 部分启动/恢复脚本是 deployed-only ignored files，日志与脚本版本不能由 Git commit 直接关联。

## 6. Architecture options

### Option A — 维持 PowerShell 多入口，收紧现有 watchdog

优点：改动最小、无需新依赖、保留现有任务和恢复习惯。<br>
缺点：仍有多个交互式 PowerShell 创建点，不能从根上消除闪现与 authority 竞态；只能降低概率。

### Option B — 单一 Task Scheduler authority，仍由 PowerShell 管理

只保留一个长期 Service task，Recovery task 改为只读检查或由 Service task 内部完成恢复。<br>
优点：能显著减少重复启动与日志噪声，迁移成本低。<br>
缺点：正常 runtime 仍依赖 PowerShell，隐藏窗口保证仍是平台行为而非进程模型保证。

### Option C — 内置静默 Node supervisor + 单一 authority（推荐）

由一个 Windows 自带 `wscript.exe` hidden shim 启动项目内的 Node supervisor；supervisor 负责：single-instance mutex、release/provenance 校验、健康检查、server child lifecycle、stdout/stderr 重定向、结构化 state/log、graceful shutdown 和受控 backoff。Recovery 逻辑收敛到同一个 supervisor，Task Scheduler 只保留一个 logon authority。

优点：正常运行路径不再使用 PowerShell；不引入第三方依赖；Node child 可明确 `windowsHide` 与 log redirection；authority、release 和 writer chain 可以统一。<br>
缺点：需要 Phase B 实现新的 supervisor、安装模板和回滚演练；必须仔细处理 Windows signal、user session、权限和升级窗口。

### Option D — Windows Service wrapper

将 Node server 放入真正的 Windows Service 生命周期。<br>
优点：后台生命周期和控制台行为最确定。<br>
缺点：涉及管理员安装、服务账户/权限、卸载/升级/数据目录访问和额外 wrapper 依赖；对当前 local-first 单用户版本属于较大运营变化。

## 7. Recommended minimum safe design

推荐 **Option C 的最小版本**，但保持 Windows 内置组件和当前 `D:\node.exe`，不添加第三方 runtime dependency：

1. 将完整 launcher/supervisor source 纳入 Git，并移除对 deployed-only ignored launcher 文件的依赖。
2. 由一个隐藏 `wscript.exe` shim 负责无控制台启动项目内 Node supervisor；Task Scheduler 只保留一个 logon trigger。
3. supervisor 是唯一可以启动/停止生产 `server.js` 的 authority，使用全局 mutex 与 verified PID/path/release checks。
4. recovery loop 在 supervisor 内部完成；不再由独立的 5 分钟 PowerShell task 另起 watchdog。
5. server child 使用 `windowsHide: true`、明确的 file handles/rolling log；不依赖继承 console。
6. 每次启动写入带 `attemptId`、`authority`、`release`、`sourceCommit`、`buildId`、`hostPid`、`serverPid`、`exitCode` 的结构化事件。
7. 正常 runtime path 不调用 PowerShell。PowerShell 只保留给安装、升级、人工维修和显式诊断命令。
8. 发布指针、release metadata、health response、service state 必须互相校验；任何 mismatch 只失败并记录，不回退到旧 release。
9. 保留 127.0.0.1:3000、固定数据目录、正式数据库 schema 和现有业务 API 不变。

## 8. Release pipeline hardening design

当前 `build-release.ps1` 已写入 source commit/build ID/dirty 字段，但它会把 dirty 状态记录下来，而不是在正常 release pipeline 中拒绝 dirty tree；`promote-release.ps1` 已有 pre-upgrade backup 与原子 pointer 写入，但没有把“停止旧 authority、启动新 authority、health/provenance 验证、失败时原子回退”收敛为一个可审计事务。

Phase B 应设计并测试以下阶段：

1. **Prepare**：要求 clean main、记录 exact source commit、禁止 dirty release；构建输出只进入临时 release staging directory。
2. **Verify artifact**：校验 server.js、release.json、build ID、source commit、dirty=false、依赖快照、启动器版本和静态资源完整性。
3. **Preflight**：只读验证正式 DB 路径、migration state、health contract 和当前 single writer；明确 maintenance window。
4. **Promote**：创建带 provenance 的 backup；由唯一 supervisor 进入 graceful maintenance；验证 writer=0 后原子切换 pointer。
5. **Activate**：启动唯一 authority，等待 health 通过并确认 health release/source/build 与 pointer 一致。
6. **Rollback**：保存失败 release 的 forensic state；只在 verified stop + verified writer=0 后原子恢复上一个 pointer，再启动并重新验证；禁止按端口盲杀。
7. **Audit output**：一个 machine-readable activation record 关联 source commit、release、build ID、attempt ID、PIDs、health、DB migration 和 rollback outcome。

## 9. Phase B implementation scope

Phase B 只应在本 engineering branch 实现并验证：

- 项目内静默 supervisor 与 built-in hidden shim。
- 单 authority Task Scheduler definition 与幂等安装/升级脚本。
- authority-aware structured logs、state 和 verified graceful stop。
- source-controlled launcher artifacts，消除 deployed-only ignored entrypoints。
- release builder 对 dirty tree 的 hard gate。
- promotion/activation/rollback 的 isolated rehearsal、process-chain test、window-suppression test 和 provenance test。
- 不改正式数据库、不执行 migration、不做 UI 或 Contributor contract 变化。

## 10. Phase C rollout scope

Phase C 才允许在明确 maintenance window、现有 release 已备份、可恢复 procedure 已验证的前提下：

- 逐步替换当前多 authority tasks。
- 先在 isolated/staging runtime 验证 silent process chain。
- 再执行一次 production read-only health and single-writer validation。
- 只在人工批准后切换生产 authority；保留旧配置的可恢复副本，不让旧 authority 自动复活。
- rollout 后验证窗口、PID、端口、release provenance、日志和正式 DB logical baseline。

本 Phase A 没有执行上述任何生产切换。

## 11. Third-party dependency decision

**NONE.** 推荐设计使用 Windows 内置 `wscript.exe` 与现有 `D:\node.exe`，不引入 NSSM、PM2、WinSW 或来源不明的 service wrapper。若后续选择 Option D，必须另行评估管理员权限、服务账户、升级和依赖 provenance。

## 12. Phase A conclusion

- 当前 runtime 健康，single writer PASS，正式 DB 只读健康检查 PASS。
- 当前最可信的闪现根因不是 Next server，而是多个交互式 PowerShell 启动 authority，首要嫌疑为 5 分钟 Health Recovery task。
- 没有直接的窗口捕获/Task Scheduler event 证据，因此本报告不把单次闪现标为已完成的直接归因。
- 当前 architecture 具有可恢复性基础，但 authority 重复、PowerShell 依赖、deployed-only launcher 和日志相关性不足是硬化优先项。
- 推荐 Phase B 采用不引入第三方依赖的单一静默 Node supervisor 设计。
- Phase A 结束，等待 Task 009 Phase B 明确授权。
