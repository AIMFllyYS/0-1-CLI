param(
    [string]$ExePath = "",
    [string]$WorkingDir = ""
)

# 自动检测路径：如果脚本在 scripts/ 目录下，则向上查找 dist/coding.exe
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ExePath) -and $scriptDir) {
    $candidate = Resolve-Path (Join-Path $scriptDir "..\dist\coding.exe") -ErrorAction SilentlyContinue
    if ($candidate -and (Test-Path $candidate)) {
        $ExePath = $candidate
    }
}

# 默认回退路径
if ([string]::IsNullOrWhiteSpace($ExePath)) {
    $ExePath = "C:\project\coding-cli\dist\coding.exe"
}

if ([string]::IsNullOrWhiteSpace($WorkingDir)) {
    $WorkingDir = Split-Path -Parent $ExePath
    if ([string]::IsNullOrWhiteSpace($WorkingDir)) {
        $WorkingDir = "C:\project\coding-cli"
    }
}

if (-not (Test-Path $ExePath)) {
    Write-Error "未找到可执行文件: $ExePath"
    Write-Host "请先运行 'npm run pkg' 打包后再创建自启动快捷方式。" -ForegroundColor Yellow
    exit 1
}

$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
if (-not (Test-Path $startupDir)) {
    New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$startupDir\coding-cli.lnk")
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.Description = "Coding CLI"
$Shortcut.Save()

Write-Host "开机自启动快捷方式已创建!" -ForegroundColor Green
Write-Host "  路径: $startupDir\coding-cli.lnk" -ForegroundColor Gray
Write-Host "  目标: $ExePath" -ForegroundColor Gray
