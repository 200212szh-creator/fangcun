[CmdletBinding()]
param(
  [string]$ProjectRoot = "",
  [string]$DataRoot = "D:\方寸数据",
  [int]$Port = 3000,
  [int]$HealthWaitSeconds = 60,
  [switch]$Once,
  [switch]$SkipDailyBackup
)

$ErrorActionPreference = "Stop"
if (-not $ProjectRoot) { $ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$DataRoot = [System.IO.Path]::GetFullPath($DataRoot)
$RuntimeRoot = Join-Path $ProjectRoot "runtime"
$StateDir = Join-Path $DataRoot "state"
$WatchdogLogDir = Join-Path $DataRoot "logs\watchdog"
$ServiceLogDir = Join-Path $DataRoot "logs\service"
$DatabaseFile = Join-Path $DataRoot "data\library.db"
$NodePath = if ($env:FANGCUN_NODE -and (Test-Path -LiteralPath $env:FANGCUN_NODE)) { $env:FANGCUN_NODE } elseif (Test-Path -LiteralPath "D:\node.exe") { "D:\node.exe" } else { (Get-Command node -ErrorAction Stop).Source }
$ServiceHost = Join-Path $ProjectRoot "runtime\launcher\service-host.js"
$Maintenance = Join-Path $ProjectRoot "runtime\maintenance\database-maintenance.js"
$ReleasePointer = Join-Path $RuntimeRoot "current-release.txt"
$ServiceState = Join-Path $StateDir "service.pid"
$HealthState = Join-Path $StateDir "health-status.json"
$LogFile = Join-Path $WatchdogLogDir ("watchdog-{0}.log" -f ([DateTime]::Now.ToString("yyyy-MM-dd")))
$Mutex = $null

function Write-Log([string]$Message) {
  New-Item -ItemType Directory -Path $WatchdogLogDir -Force | Out-Null
  $line = "{0} {1}" -f ([DateTime]::Now.ToString("o")), $Message
  if (Test-Path -LiteralPath $LogFile) {
    if ((Get-Item -LiteralPath $LogFile).Length -gt 5MB) { Move-Item -LiteralPath $LogFile -Destination "$LogFile.$([DateTime]::Now.ToString('HHmmss'))" -Force }
  }
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Write-HealthState([hashtable]$State) {
  New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
  $payload = $State | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($HealthState, $payload, [System.Text.UTF8Encoding]::new($false))
}

function Read-Utf8Text([string]$Path) {
  return [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
}

function Get-ReleaseDirectory {
  if (-not (Test-Path -LiteralPath $ReleasePointer)) { throw "当前发行指针缺失，拒绝回退到旧发行版本。" }
  $value = (Read-Utf8Text $ReleasePointer).Trim()
  if (-not $value) { throw "当前发行指针为空，拒绝启动。" }
  $candidate = if ([System.IO.Path]::IsPathRooted($value)) { $value } else { Join-Path $ProjectRoot $value }
  $release = [System.IO.Path]::GetFullPath($candidate)
  Write-Log "release-check pointer=$ReleasePointer release=$release serverExists=$(Test-Path -LiteralPath (Join-Path $release 'server.js'))"
  if (-not (Test-Path -LiteralPath (Join-Path $release "server.js"))) { throw "当前发行指针指向的 release 缺少 server.js，拒绝启动。" }
  $metadataFile = Join-Path $release "release.json"
  if (-not (Test-Path -LiteralPath $metadataFile)) { throw "当前 release 缺少 provenance，拒绝启动。" }
  try { $metadata = Read-Utf8Text $metadataFile | ConvertFrom-Json } catch { throw "当前 release provenance 无法读取，拒绝启动。" }
  $releaseName = Split-Path -Leaf $release
  if ($metadata.release -ne $releaseName -or $metadata.version -ne $releaseName -or [string]$metadata.buildId -eq "unknown" -or [string]$metadata.sourceCommit -notmatch '^[0-9a-fA-F]{40}$' -or [string]$metadata.buildTimestamp -eq "" -or $null -eq $metadata.dirty) { throw "当前 release provenance 不完整或与目录不匹配，拒绝启动。" }
  return $release
}

function Get-VerifiedState {
  if (-not (Test-Path -LiteralPath $ServiceState)) { return $null }
  try { $state = Read-Utf8Text $ServiceState | ConvertFrom-Json } catch { return $null }
  if (-not $state.hostPid -or -not $state.serverPid -or -not $state.serverFile -or -not $state.releaseDir) { return $null }
  $hostInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.hostPid)" -ErrorAction SilentlyContinue
  $serverInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.serverPid)" -ErrorAction SilentlyContinue
  if (-not $hostInfo -or -not $serverInfo) { return $null }
  if ($hostInfo.ExecutablePath -ne $NodePath -or $serverInfo.ExecutablePath -ne $NodePath) { return $null }
  if ($hostInfo.CommandLine -notlike "*service-host.js*" -or $serverInfo.CommandLine -notlike "*$($state.serverFile)*") { return $null }
  try { if ([System.IO.Path]::GetFullPath([string]$state.releaseDir) -ne (Get-ReleaseDirectory)) { return $null } } catch { return $null }
  return $state
}

function Get-Health {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    $body = $response.Content | ConvertFrom-Json
    $expectedRelease = Get-ReleaseDirectory
    if ($response.StatusCode -eq 200 -and $body.app -eq "fangcun-archive" -and $body.status -eq "ok" -and $body.database -eq "ok" -and $body.provenanceStatus -eq "ok" -and [System.IO.Path]::GetFullPath([string]$body.releaseDir) -eq $expectedRelease) { return @{ ok = $true; reason = "healthy" } }
    return @{ ok = $false; reason = "端口响应不是健康的方寸服务" }
  } catch { return @{ ok = $false; reason = "健康检查无响应" } }
}

function Stop-VerifiedService {
  $state = Get-VerifiedState
  if (-not $state) { return $false }
  $hostPid = [int]$state.hostPid
  $serverPid = [int]$state.serverPid
  try {
    & $NodePath -e "process.kill($hostPid, 'SIGTERM')"
    if ($LASTEXITCODE -ne 0) { Write-Log "graceful-stop-signal-failed hostPid=$hostPid"; return $false }
  } catch {
    Write-Log "graceful-stop-signal-error hostPid=$hostPid reason=$($_.Exception.Message)"
    return $false
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 500
    $hostAlive = [bool](Get-CimInstance Win32_Process -Filter "Handle='$hostPid'" -ErrorAction SilentlyContinue)
    $serverAlive = [bool](Get-CimInstance Win32_Process -Filter "Handle='$serverPid'" -ErrorAction SilentlyContinue)
  } while (($hostAlive -or $serverAlive) -and [DateTime]::UtcNow -lt $deadline)
  if ($hostAlive -or $serverAlive) {
    Write-Log "graceful-stop-timeout hostPid=$hostPid serverPid=$serverPid"
    return $false
  }
  if (Test-Path -LiteralPath $ServiceState) { Remove-Item -LiteralPath $ServiceState -Force -ErrorAction SilentlyContinue }
  Write-Log "verified-service-stopped-gracefully hostPid=$hostPid serverPid=$serverPid"
  return $true
}

function Invoke-DailyBackup {
  if ($SkipDailyBackup) { return }
  if (-not (Test-Path -LiteralPath $DatabaseFile)) { throw "正式数据库不存在，已停止启动。" }
  $env:FANGCUN_DATA_DIR = $DataRoot
  $env:DATABASE_URL = $DatabaseFile
  $result = & $NodePath $Maintenance "--mode=daily" 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { Write-Log "daily-backup-failed"; throw "每日备份或完整性检查失败，已停止正式启动。" }
  Write-Log "daily-backup-checked"
}

function Start-VerifiedService {
  $release = Get-ReleaseDirectory
  Invoke-DailyBackup
  New-Item -ItemType Directory -Path $StateDir,$ServiceLogDir -Force | Out-Null
  $env:FANGCUN_DATA_DIR = $DataRoot
  $env:DATABASE_URL = $DatabaseFile
  $env:FANGCUN_RELEASE_DIR = $release
  $env:FANGCUN_RELEASE_POINTER = $ReleasePointer
  $env:FANGCUN_RELEASE_NAME = Split-Path -Leaf $release
  $env:FANGCUN_STATE_DIR = $StateDir
  $env:FANGCUN_SERVICE_LOG_DIR = $ServiceLogDir
  $env:FANGCUN_PORT = [string]$Port
  $env:FANGCUN_BUILD_ID = if (Test-Path -LiteralPath (Join-Path $release "build-id.txt")) { (Read-Utf8Text (Join-Path $release "build-id.txt")).Trim() } else { "unknown" }
  $process = Start-Process -FilePath $NodePath -ArgumentList @($ServiceHost) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
  Write-Log "verified-service-started hostPid=$($process.Id) release=$release port=$Port"
  return $process
}

function Wait-Healthy([int]$Seconds = 60) {
  for ($index = 0; $index -lt $Seconds; $index++) {
    $result = Get-Health
    if ($result.ok) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

try {
  New-Item -ItemType Directory -Path $StateDir,$WatchdogLogDir,$ServiceLogDir -Force | Out-Null
  $created = $false
  $Mutex = New-Object System.Threading.Mutex($false, "Local\FangcunArchiveWatchdog")
  $created = $Mutex.WaitOne(0)
  if (-not $created) { exit 0 }
  Write-Log "watchdog-start once=$Once port=$Port"

  $health = Get-Health
  if (-not $health.ok) {
    $verified = Get-VerifiedState
    if (-not $verified) { Start-VerifiedService | Out-Null }
    if (-not (Wait-Healthy $HealthWaitSeconds)) {
      Write-HealthState @{ status = "failed"; reason = $health.reason; updatedAt = [DateTime]::Now.ToString("o"); port = $Port }
      Write-Log "health-timeout reason=$($health.reason)"
      if ($Once) { exit 1 }
    }
  }
  if ($Once) { Write-HealthState @{ status = "ok"; reason = "healthy"; updatedAt = [DateTime]::Now.ToString("o"); port = $Port }; exit 0 }

  $failures = 0
  $restartTimes = New-Object System.Collections.Generic.List[DateTime]
  $backoff = @(2, 5, 15, 30, 300)
  while ($true) {
    $health = Get-Health
    if ($health.ok) {
      $failures = 0
      Write-HealthState @{ status = "ok"; reason = "healthy"; updatedAt = [DateTime]::Now.ToString("o"); port = $Port }
    } else {
      $failures++
      Write-HealthState @{ status = "degraded"; reason = $health.reason; failures = $failures; updatedAt = [DateTime]::Now.ToString("o"); port = $Port }
      if ($failures -ge 3) {
        $cutoff = [DateTime]::Now.AddHours(-1)
        while ($restartTimes.Count -gt 0 -and $restartTimes[0] -lt $cutoff) { $restartTimes.RemoveAt(0) }
        if ($restartTimes.Count -ge 6) {
          Write-Log "restart-storm-protection activated"
          Write-HealthState @{ status = "failed"; reason = "连续重启次数过多，已停止自动重启"; updatedAt = [DateTime]::Now.ToString("o"); port = $Port }
          break
        }
        $delay = $backoff[[Math]::Min($restartTimes.Count, $backoff.Count - 1)]
        Write-Log "health-failed count=$failures restarting-after=${delay}s reason=$($health.reason)"
        Start-Sleep -Seconds $delay
        if (-not (Stop-VerifiedService)) { throw "Fangcun 服务未能优雅停止，拒绝启动第二个实例。" }
        Start-VerifiedService | Out-Null
        $restartTimes.Add([DateTime]::Now)
        $failures = 0
      } elseif (-not (Get-VerifiedState)) {
        try { Start-VerifiedService | Out-Null } catch { Write-Log "service-start-failed" }
      }
    }
    Start-Sleep -Seconds 30
  }
} catch {
  Write-Log "watchdog-error reason=$($_.Exception.Message)"
  Write-HealthState @{ status = "failed"; reason = "方寸启动检查失败"; updatedAt = [DateTime]::Now.ToString("o"); port = $Port }
  if ($Once) { exit 1 }
} finally {
  if ($Mutex) { $Mutex.Dispose() }
}
