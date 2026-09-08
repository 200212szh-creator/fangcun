[CmdletBinding()]
param(
  [string]$ProjectRoot = "",
  [string]$DataRoot = "D:\方寸数据",
  [switch]$SkipTask
)

$ErrorActionPreference = "Stop"
if (-not $ProjectRoot) { $ProjectRoot = Split-Path -Parent $PSScriptRoot }
$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$DataRoot = [System.IO.Path]::GetFullPath($DataRoot)
$Launcher = Join-Path $ProjectRoot "runtime\launcher\launch-fangcun.ps1"
$Watchdog = Join-Path $ProjectRoot "runtime\launcher\watchdog.ps1"
$StartupRecovery = Join-Path $ProjectRoot "runtime\launcher\startup-recovery.ps1"
$StartupHidden = Join-Path $ProjectRoot "runtime\launcher\startup-hidden.vbs"
$Icon = Join-Path $ProjectRoot "runtime\launcher\fangcun.ico"
$NodePath = if ($env:FANGCUN_NODE -and (Test-Path -LiteralPath $env:FANGCUN_NODE)) { $env:FANGCUN_NODE } elseif (Test-Path -LiteralPath "D:\node.exe") { "D:\node.exe" } else { (Get-Command node -ErrorAction Stop).Source }
$IconSource = Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "artifacts\phase7-audit\after") -Filter "fangcun-*.png" -File -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not (Test-Path -LiteralPath $Launcher)) { throw "启动器文件不存在。" }
if (-not (Test-Path -LiteralPath $Watchdog)) { throw "看门进程脚本不存在。" }
if (-not (Test-Path -LiteralPath $StartupRecovery)) { throw "登录恢复脚本不存在。" }
if (-not (Test-Path -LiteralPath $StartupHidden)) { throw "隐藏启动脚本不存在。" }
if (-not (Test-Path -LiteralPath $Icon) -and $IconSource) { & $NodePath (Join-Path $ProjectRoot "runtime\launcher\make-icon.js") $IconSource.FullName $Icon | Out-Null }

$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$watchdogArguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Watchdog`" -ProjectRoot `"$ProjectRoot`" -DataRoot `"$DataRoot`""
if (-not $SkipTask) {
  $action = New-ScheduledTaskAction -Execute $powershell -Argument $watchdogArguments -WorkingDirectory $ProjectRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME -RandomDelay (New-TimeSpan -Seconds 15)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName "Fangcun Archive Service" -Action $action -Trigger $trigger -Settings $settings -User $env:USERNAME -RunLevel Limited -Force | Out-Null

  $healthArguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Watchdog`" -ProjectRoot `"$ProjectRoot`" -DataRoot `"$DataRoot`" -Port 3000 -Once"
  $healthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
  $healthAction = New-ScheduledTaskAction -Execute $powershell -Argument $healthArguments -WorkingDirectory $ProjectRoot
  $healthSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName "Fangcun Archive Health Recovery" -Action $healthAction -Trigger $healthTrigger -Settings $healthSettings -User $env:USERNAME -RunLevel Limited -Force | Out-Null
}

$shell = New-Object -ComObject WScript.Shell
$shortcutArguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Launcher`" -ProjectRoot `"$ProjectRoot`" -DataRoot `"$DataRoot`""
$locations = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "方寸.lnk"),
  (Join-Path (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs") "方寸.lnk")
)
foreach ($location in $locations) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $location) -Force | Out-Null
  $link = $shell.CreateShortcut($location)
  $link.TargetPath = $powershell
  $link.Arguments = $shortcutArguments
  $link.WorkingDirectory = $ProjectRoot
  $link.WindowStyle = 7
  if (Test-Path -LiteralPath $Icon) { $link.IconLocation = "$Icon,0" }
  $link.Description = "启动方寸本地藏书"
  $link.Save()
}

$startupLocation = Join-Path ([Environment]::GetFolderPath("Startup")) "方寸后台恢复.lnk"
$startupShell = New-Object -ComObject WScript.Shell
$startupLink = $startupShell.CreateShortcut($startupLocation)
$startupLink.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
$startupLink.Arguments = "`"$StartupHidden`" `"$ProjectRoot`" `"$DataRoot`""
$startupLink.WorkingDirectory = $ProjectRoot
$startupLink.WindowStyle = 7
$startupLink.Description = "方寸登录后台恢复"
$startupLink.Save()

Write-Output "方寸启动器、登录恢复和健康恢复任务已安装。"
