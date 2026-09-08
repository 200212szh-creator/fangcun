[CmdletBinding()]
param(
  [string]$Version = "",
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$NodePath = if ($env:FANGCUN_NODE -and (Test-Path -LiteralPath $env:FANGCUN_NODE)) { $env:FANGCUN_NODE } elseif (Test-Path -LiteralPath "D:\node.exe") { "D:\node.exe" } else { (Get-Command node -ErrorAction Stop).Source }
$Version = if ($Version) { $Version } else { [DateTime]::Now.ToString("yyyy-MM-dd_HHmmss") }
$ReleaseRoot = Join-Path $ProjectRoot "runtime\releases"
$ReleaseDir = Join-Path $ReleaseRoot $Version
$BuildDir = Join-Path $ProjectRoot ".next"

if (Test-Path -LiteralPath $ReleaseDir) { throw "发行目录已存在，拒绝覆盖：$ReleaseDir" }
New-Item -ItemType Directory -Path $ReleaseRoot -Force | Out-Null
if (-not $NoBuild) {
  Push-Location $ProjectRoot
  try {
    $buildProcess = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "build") -WorkingDirectory $ProjectRoot -Wait -PassThru -NoNewWindow
    if ($buildProcess.ExitCode -ne 0) { throw "生产构建失败，未创建发行版本。" }
  } finally { Pop-Location }
}

$standalone = Join-Path $BuildDir "standalone"
if (-not (Test-Path -LiteralPath (Join-Path $standalone "server.js"))) { throw "standalone/server.js 不存在，发行未完成。" }
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null
Copy-Item -Path (Join-Path $standalone "*") -Destination $ReleaseDir -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $ReleaseDir ".next\static") -Force | Out-Null
Copy-Item -Path (Join-Path $BuildDir "static\*") -Destination (Join-Path $ReleaseDir ".next\static") -Recurse -Force
if (Test-Path -LiteralPath (Join-Path $ProjectRoot "public")) {
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "public") -Destination $ReleaseDir -Recurse -Force
}
$buildId = if (Test-Path -LiteralPath (Join-Path $BuildDir "BUILD_ID")) { (Get-Content -LiteralPath (Join-Path $BuildDir "BUILD_ID") -Raw).Trim() } else { "unknown" }
$buildId | Set-Content -LiteralPath (Join-Path $ReleaseDir "build-id.txt") -Encoding UTF8
@{ version = $Version; buildId = $buildId; createdAt = [DateTime]::Now.ToString("o"); projectRoot = $ProjectRoot } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ReleaseDir "release.json") -Encoding UTF8
Write-Output $ReleaseDir