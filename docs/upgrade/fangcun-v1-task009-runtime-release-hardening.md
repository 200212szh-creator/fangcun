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

# Fangcun v1 Task 009 — Phase B

## Silent Runtime Supervisor Implementation & Isolated Verification

实施日期：2026-09-20<br>
实施分支：`engineering/task009-runtime-hardening`<br>
Phase B 基线：`9d9a80c1e7a664d506d9b1226610fd7186acb4ef`<br>
生产 main：`5f30520ee2f8f03fa40f428f9b8273803eaa5284`（未修改）

本阶段在独立 engineering worktree 完成实现和验证。没有停止或重启生产 Fangcun，没有修改正式数据库、migration、schema、API、UI、计划任务、生产 release pointer 或 production release artifact。所有运行时验证使用临时目录、临时 SQLite 数据库和端口 `3317`；隔离 E2E 使用项目既有临时数据库和端口 `3017`。

## 13. Phase B outcome

Phase B 实现结果：**COMPLETE — ISOLATED ONLY**。

生产切换状态：**NOT PERFORMED**。Phase C 仍需人工 maintenance window 批准后，才可处理 Task Scheduler authority consolidation、安装/卸载和生产 runtime 切换。

第三方 runtime dependency：**NONE**。实现只使用 Node.js built-ins 与 Windows 内置 `wscript.exe`；没有引入 NSSM、PM2、WinSW 或其他 service wrapper。

## 14. Implemented artifacts

### 14.1 Node supervisor

新增 `runtime/launcher/fangcun-supervisor.js`，作为唯一 runtime lifecycle authority 的实现原型：

- 只接受并验证项目 root、runtime release root、data root、state、log、database 和 port 的边界路径。
- 通过 `runtime/releases/<release>/server.js`、`release.json`、`build-id.txt` 和 current-release pointer 做严格 provenance gate。
- 要求 release basename、metadata release/version、build ID、source commit、`dirty=false` 全部一致；拒绝缺文件、脏 release、pointer mismatch、expected build/source mismatch。
- 启动 exact verified release 的 Node child，`windowsHide=true`，stdout/stderr 进入结构化日志，不通过 PowerShell 或 `cmd.exe` 启动业务 runtime。
- 启动 grace、health polling、连续失败阈值、recovery cooldown、restart window 和 restart-loop protection 均为 supervisor 内部策略。
- 默认策略：startup grace 60 秒、poll 30 秒、health timeout 3 秒、连续失败 3 次、recovery cooldown 2 秒、1 小时最多 6 次 recovery、graceful shutdown 15 秒。
- health 必须同时确认 `app/status/database/provenanceStatus/release/build/source`，不接受只看 HTTP 200 的假健康。
- 运行时 state 写入 `supervisor-state.json`，包括 runtime instance、supervisor PID、server PID、release/build/source 和状态。

### 14.2 Deterministic ownership lock

supervisor 使用 `state/supervisor.lock/owner.json` 作为目录创建型 ownership lock，并把 runtime instance ID 写入 owner。启动时对“lock 目录已经创建但 owner 尚未写入”的极短竞态进行 bounded retry；因此两个同时启动请求不会在 owner 写入窗口内都获得 authority。

已有 owner 的进程仍存活时，新 supervisor 只记录 `SUPERVISOR_ALREADY_RUNNING` 并退出；owner 进程已死亡时，才按 stale-state 规则恢复。不会按端口盲杀未知进程，也不会把 PID 单独当作 ownership 证明。

### 14.3 Graceful shutdown and control path

新增 `runtime/launcher/fangcun-supervisor-control.js`。shutdown 请求只读取 exact state，生成带 `runtimeInstanceId` 的 `supervisor-control.json`，由对应 supervisor 自己执行 graceful shutdown。监督器向 tracked child 发送 `SIGTERM`，等待 bounded timeout，并确认端口释放；超时或端口未释放时记录 `SHUTDOWN_FAILED` 与 `force_kill_not_attempted`，明确不执行 force kill。

这条 control-file path 是 Windows 下比直接从外部向 child 发 signal 更可靠的受控入口，同时避免任意 PID kill。测试也验证了“graceful failure 不自动 force-kill”。

### 14.4 Structured logs and rotation

supervisor JSONL 日志默认写入 data root 下的 `logs/supervisor`，每条记录包含 timestamp、runtime instance、supervisor/server PID、release、build、source 和 event。默认 rotation/retention：单文件 5 MB、最长 14 天、总量 100 MB。输出字段对 token、secret、authorization、password、borrower contact、annotation/body/notes 做基本 redaction；业务 runtime stdout/stderr 也通过同一日志边界捕获。

覆盖的主要事件包括：`SUPERVISOR_START`、`RELEASE_VERIFY`、`RELEASE_REJECT`、`SERVER_START`、`SERVER_HEALTHY`、`HEALTH_FAILURE`、`SERVER_EXIT`、`RECOVERY_ATTEMPT`、`RECOVERY_SUCCESS`、`SHUTDOWN_REQUEST`、`SHUTDOWN_SUCCESS`、`SHUTDOWN_FAILED` 和 `SUPERVISOR_EXIT`。

### 14.5 Release provenance and pointer manager

新增 `runtime/launcher/release-manager.js`，提供 isolated `verify/promote/rollback` 命令和可复用模块接口：

- promote/rollback 之前都重新验证 release artifact；
- pointer 只允许位于项目 runtime root；
- pointer 通过 temporary file + rename 原子更新，Windows rename 冲突路径保留短暂 previous backup；
- promotion failure 不改变 active pointer；
- isolated tests 验证 A/B release promotion 与 rollback 可逆。

Phase B 没有修改生产 pointer，也没有调用 promotion/rollback 指向生产 release。

### 14.6 Silent adapter and manual launcher

新增：

- `runtime/launcher/silent-launch.vbs`：只做 `wscript.exe` hidden shim，把 Node supervisor 命令以 window style `0` 启动；不包含业务、recovery、release 或数据库逻辑。
- `runtime/launcher/fangcun-manual-launcher.js`：先请求 health；已健康时不再创建第二个 supervisor；不健康时 detached、hidden 启动 supervisor，等待 health 通过后才打开浏览器。测试通过 `--no-open` 验证了不重复启动。

`.gitignore` 仅增加了上述 source-controlled launcher 文件的 narrow exceptions；没有放宽整个 runtime 或忽略规则范围。

## 15. Adapter A/B evaluation

| 项目 | Adapter A：direct Node | Adapter B：wscript hidden shim |
|---|---|---|
| 日常 runtime 是否需要 PowerShell | 否 | 否 |
| 业务/recovery 逻辑位置 | Node supervisor | Node supervisor |
| 启动层 | Node detached/hidden | Windows 内置 wscript → Node detached/hidden |
| 可测试性 | 高 | 高 |
| Task Scheduler 直接启动时的 console 可见性 | 依赖 task action / Windows console-subsystem 行为，不能单靠 Node 参数证明 | `WScript.Shell.Run(..., 0, False)` 明确请求隐藏窗口 |
| 额外第三方依赖 | 无 | 无 |
| Phase B 结论 | 保留为 manual/test/direct adapter | 选为 Phase C automatic authority 的目标 adapter |

选择 B 不是把隐藏参数当作唯一证据：Phase B 还对 exact supervisor/server PID 查询了 `MainWindowHandle` 与 `MainWindowTitle`，两个进程均无可见窗口句柄。该查询发生在隔离 test harness 中，PowerShell 只作为观察工具，不在 supervisor 的 normal runtime path 中启动。Phase C 仍需在目标用户会话和真实登录/重启条件下进行一次人工可见性观察；不能把 isolated exact-PID 结果等同于所有 Windows session 的绝对保证。

## 16. One automatic authority design

Phase C 的目标 authority 定义已固定为：

```text
one Task Scheduler logon authority
  → wscript.exe silent-launch.vbs
    → node fangcun-supervisor.js
      → exact verified release server.js
```

supervisor 内部承担 health、recovery、writer protection、release verification、structured state/log 和 graceful shutdown。Health Recovery task 不再作为第二个周期性启动 authority；manual launcher 只请求现有 health 或启动同一个 supervisor，不创建第二条 server chain。Phase B 没有修改现有生产 tasks；本图是 isolated implementation target，不是 production rollout confirmation。

## 17. Manual launcher semantics

manual launcher 的状态机如下：

1. health 已通过：返回成功，不启动 supervisor，不打开第二个 server。
2. health 未通过：detached/hidden 启动 supervisor，等待 bounded health success。
3. health 超时或 release/provenance 不通过：返回失败并保持 fail-closed，不使用旧 release 猜测、不盲杀端口占用者。
4. health 通过后：默认打开 `http://127.0.0.1:<port>/`；测试/诊断可使用 `--no-open`。

## 18. Isolated failure matrix

`tests/runtime-supervisor.test.cjs` 使用 temp directory、临时 SQLite、端口 `3317` 和 fake release server，最终结果为 **20 tests passed, 0 failed**：

| 场景 | 结果 |
|---|---|
| 正常 start / health / graceful shutdown | PASS |
| 第二 supervisor ownership refusal | PASS |
| 未被 Fangcun ownership 声明的端口占用 | PASS，拒绝启动，不杀未知 listener |
| invalid/missing release provenance | PASS，fail closed |
| unhealthy startup | PASS，不启动 parallel server |
| unexpected server crash | PASS，恢复 exact verified release |
| repeated health failure / restart loop | PASS，触发保护 |
| graceful shutdown | PASS |
| graceful shutdown failure | PASS，无 force-kill fallback |
| stale PID/lock recovery | PASS |
| stale pointer | PASS |
| promotion failure | PASS，active pointer 保持 |
| isolated promotion / rollback | PASS |
| manual launcher | PASS，不创建第二 server |
| repeated startup | PASS，收敛到一个 supervisor |
| wscript silent adapter | PASS |
| exact supervisor/server PID window-handle check | PASS，无 visible window handle |
| direct Node adapter | PASS，无 PowerShell/CMD runtime event |
| isolated port/database boundary | PASS |

没有测试项停止、重启或写入正式生产 runtime；没有测试项使用正式端口 `3000` 或正式数据库。

## 19. Quality gates

| Gate | Result | Evidence / note |
|---|---|---|
| `node --check` new JS | PASS | supervisor, control, manual launcher, release manager |
| `npm run lint` | PASS | final isolated worktree |
| `npm run typecheck` | PASS | final isolated worktree |
| `npm run build` | PASS | Next production build；仅有 multiple lockfiles workspace-root warning |
| native repository Vitest | PASS | 11 files；30 passed，1 expected skipped |
| Task 009 supervisor matrix | PASS | 20/20 |
| isolated E2E | PASS | `test:e2e:isolated`，32/32，临时 DB / port 3017 |

Vitest 初次运行暴露的是 isolated worktree 未带 `tsx` package path，不是产品或 supervisor failure。验证中只把已存在的 `D:\图书库\node_modules\tsx` 链接到 isolated worktree 的 ignored `node_modules` 路径，未修改 package、lockfile 或 tracked source；之后完整 Vitest 30/30（另 1 skip）通过。

## 20. Security and boundary review

- 正常 runtime path 不调用 PowerShell，不调用 `cmd.exe`，不使用 shell command concatenation 启动业务 server。
- 只启动 release manager 验证通过的 exact `server.js`；release path、pointer path、state/log/database path 都有边界限制。
- ownership lock 是 instance-scoped；control action 必须匹配当前 runtime instance；不提供任意 PID kill API。
- occupied port 不会被 supervisor 盲杀；unknown listener 只导致 fail-closed。
- shutdown timeout 不降级为 force kill；失败时保留状态和日志，等待人工处置。
- 日志有 retention/rotation 和敏感字段 redaction；没有把业务数据库内容复制到 supervisor log。
- Phase B 没有修改正式 DB，没有执行 migration，没有新增 hard-delete、repair 或 production cleanup endpoint。

## 21. Phase C promotion and rollback procedure

Phase C 在人工批准前不得执行 production switch。批准后应严格按以下顺序：

1. 记录 main/release/source/build/dirty、现有 tasks、Startup shortcuts、host/server PIDs、port 和 formal DB logical baseline。
2. 先创建并验证可恢复的生产 runtime/config backup；保留旧 task XML、旧 launcher 和旧 pointer 的审计副本。
3. 建立 exclusive maintenance window；gracefully stop 当前 authority，证明 active formal DB writers = 0，确认 `127.0.0.1:3000` 已释放。
4. 安装/启用一个且仅一个新的 automatic authority；不要同时保留旧 recovery task、旧 Startup fallback 或旧 PowerShell authority 的可执行状态。
5. 用 silent adapter 启动 exact verified release，验证 health、pointer、source/build/dirty、single writer、window classification 和 structured logs。
6. 观察足够长的 health/recovery window，再标记 rollout successful；旧配置只作为离线 rollback artifact，不自动复活。
7. rollback 时同样先 graceful stop 新 authority、证明 writer=0，再恢复旧 pointer/旧 task 配置，重新启动并验证 health/provenance；禁止按端口强杀，禁止 force push 或直接修改正式 DB。

Phase B 只完成上述 procedure 的 isolated implementation/rehearsal；没有执行第 1–7 步中的 production mutation。

## 22. Phase B final status

| 项目 | 状态 |
|---|---|
| Phase A baseline | `9d9a80c1e7a664d506d9b1226610fd7186acb4ef` |
| Production main/origin | `5f30520ee2f8f03fa40f428f9b8273803eaa5284`，未修改 |
| Production release | `2026-09-13_Task008B_PhaseA1_contributor_main_final`，未切换 |
| Formal DB | `D:\方寸数据\data\library.db`，未触碰 |
| Formal migrations | `0001`–`0005_contributors`，未改变 |
| Product/UI/schema/API change | NONE |
| Production stop/restart | NOT PERFORMED |
| Scheduled task change | NOT PERFORMED |
| Force termination | NO |
| Isolated implementation | COMPLETE |
| Isolated verification | PASS |
| Phase C production readiness | READY FOR EXPLICIT HUMAN APPROVAL |

等待下一步：`GO — EXECUTE TASK 009 PHASE C`。本报告 checkpoint 只记录 Phase B；不自动进入生产切换。

## 23. Phase C1.1 — E2E Gate Recovery

恢复日期：2026-09-21<br>
恢复任务：`Task 009 — Phase C1.1-R`<br>
恢复结论：**BLOCKED — isolated E2E execution environment instability**

### 23.1 Recovery baseline and boundary

- 前一会话的执行 blocker 为 `helper_unknown_error: apply deny-read ACLs`，并伴随 isolated E2E 权限审批额度耗尽。本次 session 能够恢复创建 PowerShell/Node/Playwright 进程，但 helper ACL 错误仍会间歇性复现；后续只使用显式批准的只读检查和测试执行。
- 恢复前 `HEAD = 04568329961524a586e011687f04f08fe87e93bc`，`origin/main = 04568329961524a586e011687f04f08fe87e93bc`。
- 初始工作区为 **TEST-ONLY DIRTY**：仅有 `tests/e2e/motion.spec.ts` 的既有 reduced-motion readiness 修复，暂存区为空；未发现 UI/product、runtime、API、schema、migration 或 formal data 修改。
- 生产仍运行 `2026-09-13_Task008B_PhaseA1_contributor_main_final\server.js`，PID `6276`，监听 `127.0.0.1:3000`。本阶段没有重启、修改或切换 production。

### 23.2 Isolated process audit

- 初次审计确认 `3017`/`3317` 没有稳定 listener；之后发现一条精确属于本任务的残留链：`npm → Playwright → cmd → scripts/e2e-server.cjs → Next dev → start-server.js`，其中 `3017` listener 为 isolated Next 进程，非 production 链。
- 仅向已证明属于该链的 `e2e-server.cjs` PID 发送 graceful `SIGTERM`，随后清理 Playwright runner parent chain；没有按 `node.exe` 批量终止，没有触碰 PID `6276` 或端口 `3000`。
- 最终审计：`3017 = FREE`，`3317 = FREE`，无残留 Playwright/isolated server chain；`3000` 仍由原 production release 监听。

### 23.3 Test-only changes and root-cause investigation

保留并核验了原有 `tests/e2e/motion.spec.ts` reduced-motion readiness 改动：等待 network idle、确认菜单按钮 visible/enabled，并断言 reduced-motion media query；没有增大 timeout、retry-until-pass、skip/fixme 或削弱 assertion。

恢复执行发现 fast-input 测试原有的固定 `380ms` 等待会在页面 hydration/debounce 较慢时于首个请求发出前切换输入，导致 `addQueries` 只有 `第二查询`。失败 trace/error context 的页面 snapshot 显示输入状态回到空值、按钮仍 disabled；分类为 **TEST_HARNESS_TIMING**，不是 product defect。

在同一 test-only 文件中采用了两个最小确定性修复：

- add 页面等待 network idle，并确认标题输入框 visible/enabled；
- 用首个和第二个精确 request event 同步输入切换，移除固定 `380ms` sleep；没有修改产品 UI/runtime。

### 23.4 Targeted evidence

| Gate | Result | Evidence |
|---|---|---|
| Previous reduced-motion evidence | PASS | 20/20 from the preceding C1.1 attempt |
| Resumed reduced-motion check | PASS | 20/20, four batches of 5, all `retry=0`; isolated cleanup passed after every batch |
| `motion.spec.ts` pre-final timing patch | PASS | 8/8 across chromium/mobile before the final fast-input-only readiness patch |
| Fast-input targeted stability | **BLOCKED** | After the final patch, run 1/10 and 2/10 passed; run 3 stopped at `page.goto ERR_CONNECTION_RESET`, followed by isolated `3017` disconnect. No 10/10 claim is made. |
| Retry-dependent passes | 0 | All targeted runs used `--retries=0`; no Playwright retry was used to mask a failure |

The earlier 10-case experiment before the final readiness patch also reproduced the same class of isolated-server interruption: 1 pass followed by `ECONNREFUSED`, and a reduced-motion long run ended with 13 passes followed by 7 reset failures. These were not counted as product failures or used to offset later failures.

### 23.5 Isolated server disconnect classification

The resumed failures occurred only on the disposable `3017` Next/E2E chain. They presented as transient `ERR_CONNECTION_RESET`/`ECONNREFUSED` with no Fangcun application stack trace, no matching Windows Application/System crash event, and no effect on the stable production listener at `3000`. The exact OS-level termination reason was not observable from the recovered session; the evidence supports **EXECUTION_ENVIRONMENT / isolated process-lifecycle instability**, not `FANGCUN_RUNTIME`.

Per the recovery gate, counting stopped at the first failure and the three-run full E2E gate was not started. Required `3 × 32/32` first-attempt evidence is therefore **NOT ACHIEVED**.

### 23.6 Quality gates completed before stop

| Gate | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| repository Vitest | PASS — 30 passed, 1 expected skipped |
| Task009 supervisor matrix | PASS — 20/20 |
| `npm run build` | PASS |
| full isolated E2E run 1 | NOT RUN in this resumed gate |
| full isolated E2E run 2 | NOT RUN in this resumed gate |
| full isolated E2E run 3 | NOT RUN in this resumed gate |

No production runtime was modified, no production restart occurred, no Scheduled Task or startup recovery configuration was changed, and the formal database was not touched. No test/harness commit or report commit was created because the required full E2E gate is incomplete.

### 23.7 Phase C1.1-R status

| 项目 | 状态 |
|---|---|
| Execution environment | RECOVERED for short commands; **BLOCKED for stable repeated isolated E2E** |
| Product/UI code changed | NO |
| Runtime code changed | NO |
| Formal DB touched | NO |
| Production runtime modified | NO |
| Isolated 3017 | CLEAN at final audit |
| Isolated 3317 | CLEAN at final audit |
| Production 3000 touched | NO |
| Phase C1 quality gate recovered | NO |
| Ready to resume Task009 Phase C1 | NO |

STOP. Do not build a production candidate, export or modify production runtime config, or perform any production switch until a stable execution environment can complete the missing fast-input 10/10 and three consecutive 32/32 first-attempt full E2E runs.

## 24. Phase C1.2 — Stable Isolated E2E Runner Recovery and Final Gate

### 24.1 Scope and commits

Task009 Phase C1.2 was completed on recovery branch `engineering/task009-c1-e2e-stability`.

- `55d9de3` — test-only motion readiness/request synchronization.
- `b409ff0` — test-only stable isolated E2E runner and Playwright config.
- The recovery branch was pushed normally to `origin/engineering/task009-c1-e2e-stability`; no force push was used.
- The Task009 report was not included in either recovery-branch commit or push.
- No production runtime, formal database, Scheduled Task, Startup recovery, production candidate, or Phase C2 path was changed.

### 24.2 Execution-environment diagnosis

Primary classification: **CODEX_EXECUTION_PROCESS_REAP**. The first long full-gate attempts ended with session exit `-1` around test 14/32 or 15/32, without a Playwright assertion failure, `SERVER_EXIT` record, or application crash event. The short gates completed normally. A contributing condition was **PLAYWRIGHT_WEBSERVER_LIFECYCLE**: older `npm run test:e2e:isolated` chains from another worktree remained as `Playwright → e2e-server → Next`, repeatedly competing for disposable port `3017`. Those exact stale chains were identified and gracefully terminated; production PID `6276` on port `3000` was never targeted.

The stable runner now owns migration, server, Playwright, lifecycle metadata, stdout/stderr capture, server-death handling, bounded graceful shutdown, and isolated-root cleanup under one parent. It stops Playwright immediately when the owned server exits unexpectedly and records the failure instead of cascading connection-refused noise. The runner accepts `E2E_STABLE_PORT`; the final long runs used dedicated disposable port `3317` to eliminate the stale `3017` race.

### 24.3 Final E2E evidence

All gates used `--retries=0` and an isolated database whose `/api/e2e/state` reported `databaseTarget=ISOLATED`, `integrity=ok`, `quickCheck=ok`, and zero foreign-key violations.

| Gate | Result | PASS artifact |
|---|---|---|
| fast-input | 10/10 | `artifacts/e2e-stable/2026-09-21T03-51-05-167Z-31576/summary.json` |
| reduced-motion | 5/5 | `artifacts/e2e-stable/2026-09-21T03-50-32-229Z-26096/summary.json` |
| `motion.spec.ts` | 8/8 | `artifacts/e2e-stable/2026-09-21T03-22-16-922Z-9596/summary.json` |
| full E2E run 1 | 32/32 | `artifacts/e2e-stable/2026-09-21T03-35-08-661Z-30484/summary.json` |
| full E2E run 2 | 32/32 | `artifacts/e2e-stable/2026-09-21T03-39-56-249Z-7456/summary.json` |
| full E2E run 3 | 32/32 | `artifacts/e2e-stable/2026-09-21T03-43-34-902Z-17428/summary.json` |

Each full run ended with `status=PASS`; its lifecycle record ended with `state=stopped`, and port `3317` was released. Full-run server logs include a negative-path `SQLITE_CONSTRAINT_NOTNULL` request followed by successful test continuation; this did not terminate the server or fail the corresponding test run.

### 24.4 Final quality gates

| Gate | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| Vitest | PASS — 30 passed, 1 skipped |
| Task009 runtime supervisor tests | PASS — 20/20 |
| `npm run build` | PASS |
| stable runner syntax and `git diff --check` | PASS |

### 24.5 Integration and boundary status

| 项目 | 状态 |
|---|---|
| Recovery branch | `b409ff0` == `origin/engineering/task009-c1-e2e-stability` |
| Local main integration | YES — fast-forwarded to `b409ff0` after all gates passed |
| `origin/main` | Intentionally unchanged at `0456832`; no remote main push was performed because the task explicitly restricted push to the recovery branch |
| Production port `3000` | PID `6276`, unchanged |
| Disposable ports `3017` / `3317` | FREE at final audit |
| Working-tree Task009 report | Still uncommitted and kept separate from code commits |
| Production candidate / Phase C2 | NOT ENTERED |

## 25. Phase C1 — Task009 production candidate build and isolated E2E gate

本节记录 C1.2 完成后的 candidate build 与隔离验证，不重复 24.3 的 E2E 矩阵。代码集成状态为：main 已包含 b409ff0，docs-only checkpoint 为 9a9e73c；local main = origin/main = 9a9e73c71216cc8816f9957c8af0ee1cade19423。recovery branch 仍保持 b409ff0，没有 force push 或历史改写。

### 25.1 Candidate provenance and contents

从 clean main 9a9e73c 构建：

- Candidate：2026-09-21_Task009_runtime_hardening_rc
- Built release：D:\图书库\runtime\releases\2026-09-21_Task009_runtime_hardening_rc
- Inactive self-contained verification bundle：D:\图书库\runtime\candidates\2026-09-21_Task009_runtime_hardening_rc
- sourceCommit：9a9e73c71216cc8816f9957c8af0ee1cade19423
- buildId：tU4Ne6VtZwEuDnEyo5mG3
- dirty：false
- Next production build：PASS；静态页面 15/15
- Candidate manifest：2,209 files，SHA-256 hash mismatches 0

Candidate bundle 包含 built Next standalone release、Node supervisor、manual launcher、supervisor control、release manager 和 silent-launch.vbs。candidate-local rollback probe 与最终 pointer 均已恢复到正式 candidate release。未注册的 authority action audit artifact 明确记录：一个 Task Scheduler authority → wscript.exe → silent-launch.vbs → Node supervisor；normal runtime recurring PowerShell 0。没有注册或修改该 task。

### 25.2 Isolated candidate validation

验证使用系统 temporary directory 中的 disposable database C:\Users\17625\AppData\Local\Temp\fangcun-task009-candidate-20260921\data\library.db、state/log 目录和 127.0.0.1:3318。migration 0001–0005 全部以 databaseTarget=ISOLATED 完成，integrity/quick-check/foreign-key check 全部通过；正式数据库路径没有作为候选运行目标。

结果：

- normal supervisor start、/api/health、release/build/source/dirty provenance：PASS；health 为 status=ok、database=ok、provenanceStatus=ok
- 第二 supervisor ownership：PASS；记录 SUPERVISOR_ALREADY_RUNNING，没有第二个 server/writer
- deliberate isolated server crash recovery：PASS；exact candidate server PID 被替换，health 恢复，记录 RECOVERY_ATTEMPT / RECOVERY_SUCCESS
- restart-loop protection：PASS；maxRestarts=2 后记录 RESTART_LOOP_PROTECTION，supervisor 退出且候选 server 进程为 0
- graceful shutdown：PASS；记录 SHUTDOWN_SUCCESS，无 force-kill fallback
- manual launcher：PASS；首次启动成功，重复调用不创建第二条 server chain
- silent adapter：PASS；wscript.exe 仅瞬时存在，随后为 0
- window/process gate：PASS；candidate supervisor/server 的 MainWindowHandle=0、标题为空；候选进程树中 PowerShell/CMD=0
- structured logs：PASS；102 条 JSONL 记录，非法 JSON=0，缺少必需上下文=0；rotation/retention 源码策略核对通过
- candidate-local promote/rollback：PASS；probe promote、pointer verify、rollback、pointer verify 全部成功，最终 pointer 指回正式 candidate release

隔离验证完成后，port 3318、candidate supervisor/server、candidate PowerShell/CMD 均为 0；没有残留候选进程。

### 25.3 Production read-only boundary check

production 只读检查结果：

- active release 仍为 2026-09-13_Task008B_PhaseA1_contributor_main_final
- build ID 仍为 WK8jgGgNr-Oya-8B8-6pL
- 127.0.0.1:3000 health=ok，唯一 listener PID=6276
- project/data active pointer 都仍指向上述旧 release
- D:\方寸数据\data\library.db 以 readonly 打开；integrity=ok、quick-check=ok、foreign-key violations=0，migration history 仍为 0001–0005
- production runtime、formal DB、Scheduled Tasks、Startup recovery 均未修改；没有 production stop/restart 或 pointer switch

Rollback configuration export 已保存到 D:\图书库\artifacts\task009-rollback-bundle-20260921：包含 2 个 Fangcun Scheduled Task XML、13 个 launcher/runtime 文件、2 个 Startup shortcut 副本、active pointers、active release metadata、startup registry read-only export 和 SHA-256 manifest；export inventory 记录 productionMutations=0。

### 25.4 C2 target and stop boundary

Phase C2 的精确目标仍是：在明确 maintenance window 内，先保存并验证 rollback bundle，证明 formal DB writer=0 与 port 3000 已释放；再仅启用一个 Task Scheduler authority，使其通过 wscript.exe silent shim 启动 Node supervisor；验证 exact release provenance、single writer、health/recovery、structured logs、window classification，并保留人工登录/重启后的可见性观察 gate。rollback 必须 graceful stop 新 authority、恢复旧 pointer/旧 task 配置并重新验证 health/provenance。

本次只完成 candidate build、candidate-local isolated validation 和 production read-only audit；没有执行 C2、没有注册/启用新 Scheduled Task、没有修改 Startup recovery、没有切换 production、没有修改 formal DB，也没有构建 production candidate 之外的 production deployment artifact。

### 25.5 C1 final status

| 项目 | 状态 |
|---|---|
| Candidate build from clean main 9a9e73c | PASS |
| Candidate provenance / content manifest | PASS |
| Isolated lifecycle / health / provenance | PASS |
| Crash recovery / restart-loop protection | PASS |
| Manual launcher / silent adapter / window gate | PASS |
| Candidate-local promote / rollback | PASS |
| Production read-only baseline | PASS；未修改 |
| Scheduled Task / Startup recovery / formal DB | UNCHANGED |
| Production switch | NOT PERFORMED |
| Phase C2 | NOT ENTERED |

STOP at the C1 boundary. Do not execute Phase C2 without a separate explicit human approval and the required maintenance-window observation gate.

 
## 26. Phase C2 — Controlled Production Rollout Attempt and Safe Rollback
 
本节记录 2026-09-21 maintenance window 内、在明确授权下执行的 Phase C2 rollout attempt。最终状态为 `ROLLED BACK`：候选 release 的 isolated 验证在 C1 已通过，但 production 唯一 Task Scheduler authority 无法由当前 Windows Medium-integrity 会话注册，因而没有继续启动或切换到 candidate。
 
### 26.1 Authoritative candidate and rollback bundle
 
- Candidate release：`2026-09-21_Task009_runtime_hardening_rc_final`
- Release path：`D:\图书库\runtime\releases\2026-09-21_Task009_runtime_hardening_rc_final`
- Build ID：`bDOetjIdcMiPG-Kmu4dOA`
- Candidate sourceCommit：`5fc4a07e7fe3f037c6ee8f9ca5cafc982905bc78`
- dirty：`false`
- candidate provenance：`PASS`
- Rollback bundle：`D:\图书库\artifacts\task009-rollback-bundle-20260921-final`
- Rollback bundle manifest / required files / hashes：`PASS`
- C2 execution evidence：`D:\图书库\artifacts\task009-c2-rollout-20260921`
 
Rollback bundle 在切换前重新核验，包含两个旧 Scheduled Task XML、Startup recovery shortcut、startup-hidden.vbs、startup-recovery.ps1、watchdog.ps1、active release pointers、launcher/runtime configuration、startup registry export 及 hash manifest。
 
### 26.2 Controlled transition and failure gate
 
Maintenance window 开始时间：`2026-09-21T09:56:22.3062789Z`。用户确认没有正在进行的 Fangcun 写操作。
 
已执行且可审计的安全步骤：
 
- 旧 `Fangcun Archive Service` task：先 disable；未删除。
- 旧 `Fangcun Archive Health Recovery` task：先 disable；未删除。
- 旧 Startup recovery shortcut：改名为 `方寸后台恢复.lnk.disabled-Task009-C2`，并保留原文件副本到 rollback bundle。
- 旧 runtime：对精确旧 host PID 发送 graceful `SIGTERM`；未使用 force kill。旧 server/host 退出，port 3000 释放。
- active project/data pointers：短暂切换到 exact final candidate，并完成 pointer/provenance precheck。
 
随后尝试安装唯一目标 authority：
 
`ONE Task Scheduler authority → wscript.exe → silent-launch.vbs → Node supervisor`
 
系统对当前会话的 Task Scheduler 注册返回 `Access is denied`；管理员组在当前 token 中为 deny-only，UAC elevation attempt 没有产生已注册 task。新 task 不存在、没有新 supervisor/server 启动、没有新的 writer 进入正式 DB。由于 `new authority cannot reliably start`，按 C2 rollback condition 立即停止 rollout。
 
### 26.3 Rollback result
 
Rollback 顺序为：恢复 old pointers → 恢复原 Startup recovery shortcut → enable old tasks → `Start-ScheduledTask` old service → bounded health/read-only verification。
 
最终恢复状态：
 
| 项目 | 结果 |
|---|---|
| Active release | `2026-09-13_Task008B_PhaseA1_contributor_main_final` |
| Old Build ID | `WK8jgGgNr-Oya-8B8-6pL` |
| Old sourceCommit | `b89ca628f332933e873db63266c9b0bc545e5a39` |
| Old Service task | `Running` / enabled |
| Old Health Recovery task | `Ready` / enabled |
| Old Startup recovery | 原名 `方寸后台恢复.lnk` 已恢复 |
| Production health | `PASS`；database `ok`；provenance `ok` |
| Production host/server | host PID `11584`，server PID `15500`，唯一旧 runtime chain |
| Port 3000 | listener PID `15500` |
| Candidate task | 未注册 |
| Candidate supervisor/server | 未启动 |
| Old release resurrection | `NO`；rollback 后仅恢复旧 verified runtime |
 
### 26.4 Formal DB read-only verification after rollback
 
使用现有 `scripts/validate-migration.ts` 以 `D:\方寸数据\data\library.db` 和 `PRODUCTION_READ_ONLY_ROLLBACK` target 执行只读核验：
 
- migrations：`0001_archive_fields`、`0002_loans_annotations`、`0003_works`、`0004_location_model`、`0005_contributors`，unchanged
- integrity：`ok`
- quick-check：`ok`
- foreign-key violations：`0`
- editions/copies/shelves：`2 / 2 / 2`
- API books：`2`；contributor-aware and location-aware read paths returned expected existing records
- business counts baseline：Works `0`、Editions `2`、Copies `2`、Locations `2`、Contributors `2`、Edition Contributors `2`、Loans `0`、Annotations `0`
- formalDatabaseMutation：`false`
 
没有执行 migration、raw SQL、业务写入或 schema 修改。production transition 产生的 pointer/task/startup 临时状态已恢复；最终 active production 状态与旧 verified baseline 一致。
 
### 26.5 C2 acceptance status
 
| 项目 | 状态 |
|---|---|
| Candidate isolated validation | PASS（C1 evidence） |
| Rollback bundle | PASS |
| Old authority disable / graceful stop | PASS |
| New Task Scheduler authority registration | BLOCKED — Windows access denied |
| Exact candidate production activation | NOT COMPLETED |
| Candidate production health / recovery / structured log gate | NOT ENTERED |
| Candidate manual launcher / production window gate | NOT ENTERED |
| Formal DB touched | NO |
| Formal DB read-only rollback validation | PASS |
| Final production state | Old verified runtime restored |
| Phase C2 | ROLLED BACK |
 
本次阻塞需要用户在真实管理员权限的 Windows maintenance session 中重新授权并执行 Task Scheduler registration；不能在当前会话中用 Startup shortcut 替代既定 authority，也不应继续进入 Phase C2 后续 production gates。Task009 Phase C2 到此 STOP。

