[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ReleaseDir,
  [string]$DataRoot = "D:\方寸数据"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ReleaseDir = [System.IO.Path]::GetFullPath($ReleaseDir)
$DataRoot = [System.IO.Path]::GetFullPath($DataRoot)
$ReleaseRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot "runtime\releases"))
$Maintenance = Join-Path $ProjectRoot "runtime\maintenance\database-maintenance.js"
$NodePath = if ($env:FANGCUN_NODE -and (Test-Path -LiteralPath $env:FANGCUN_NODE)) { $env:FANGCUN_NODE } elseif (Test-Path -LiteralPath "D:\node.exe") { "D:\node.exe" } else { (Get-Command node -ErrorAction Stop).Source }
$pointerFiles = @((Join-Path $ProjectRoot "runtime\current-release.txt"), (Join-Path $DataRoot "state\current-release.txt"))

if (-not $ReleaseDir.StartsWith($ReleaseRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "发行目录必须位于 runtime\releases 内。" }
if (-not (Test-Path -LiteralPath (Join-Path $ReleaseDir "server.js"))) { throw "发行目录缺少 server.js。" }
if (-not (Test-Path -LiteralPath $DataRoot)) { throw "固定数据目录不存在或当前账户无权访问。" }
$dbFile = Join-Path $DataRoot "data\library.db"
if (-not (Test-Path -LiteralPath $dbFile)) { throw "固定数据目录缺少正式数据库。" }

$env:FANGCUN_DATA_DIR = $DataRoot
$env:DATABASE_URL = $dbFile
$backupResult = & $NodePath $Maintenance "--mode=pre-upgrade" 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw "升级前备份失败，未切换发行版本。" }

foreach ($pointer in $pointerFiles) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $pointer) -Force | Out-Null
  $temporary = "$pointer.tmp-$PID"
  [System.IO.File]::WriteAllText($temporary, "$ReleaseDir`r`n", [System.Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $pointer) {
    $pointerBackup = "$pointer.previous-$PID"
    [System.IO.File]::Replace($temporary, $pointer, $pointerBackup)
    Remove-Item -LiteralPath $pointerBackup -Force -ErrorAction SilentlyContinue
  } else {
    [System.IO.File]::Move($temporary, $pointer)
  }
}
Write-Output $ReleaseDir
