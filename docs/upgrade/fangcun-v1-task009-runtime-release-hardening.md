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
