#Requires -Version 5.1

<#
.SYNOPSIS
    Coding CLI 一键安装脚本

.DESCRIPTION
    自动完成 Git、Node.js 检查与安装，clone 仓库，npm install/build，
    可选全局注册、打包 exe、开机自启动。每一步都会请求用户确认。

.EXAMPLE
    iwr -useb https://raw.githubusercontent.com/AIMFllyYS/My-Windows-CLI/master/scripts/install.ps1 | iex
#>

param(
    [string]$InstallDir = "",
    [switch]$SkipConfirm = $false
)

if ($Host.Version.Major -le 5) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
}

$RepoUrl      = "https://github.com/AIMFllyYS/My-Windows-CLI.git"
$DefaultDir   = "$env:USERPROFILE\coding-cli"
$MinNodeMajor = 18

# ──────────────── 工具函数 ────────────────

function Confirm-Step([string]$Message) {
    if ($SkipConfirm) { return $true }
    $response = Read-Host "$Message [Y/n]"
    return ($response -eq "" -or $response -eq "Y" -or $response -eq "y")
}

function Write-Header([string]$Text) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Success([string]$Text) {
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Warn([string]$Text) {
    Write-Host "[!] $Text" -ForegroundColor Yellow
}

function Write-Fail([string]$Text) {
    Write-Host "[X] $Text" -ForegroundColor Red
}

function Test-Command([string]$Cmd) {
    return [bool](Get-Command $Cmd -ErrorAction SilentlyContinue)
}

function Get-NodeMajor() {
    try {
        $ver = node --version 2>$null
        if ($ver -match '^v(\d+)') { return [int]$Matches[1] }
    } catch {}
    return 0
}

function Install-WithWinget([string]$Id, [string]$Name) {
    if (-not (Test-Command winget)) {
        Write-Fail "winget 不可用，无法自动安装 $Name。"
        Write-Host "请手动安装后重试：`n  https://aka.ms/winget`n  https://nodejs.org/ (Node.js)`n  https://git-scm.com/download/win (Git)" -ForegroundColor Yellow
        return $false
    }
    Write-Host "正在通过 winget 安装 $Name (需要管理员权限)..."
    winget install --id $Id -e --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "$Name 安装失败 (winget 返回码 $LASTEXITCODE)。"
        return $false
    }
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
    return $true
}

function New-StartupShortcut([string]$ExePath, [string]$WorkingDir) {
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
    Write-Success "开机自启动快捷方式已创建: $startupDir\coding-cli.lnk"
}

# ──────────────── 检测是否已在仓库内 ────────────────

$isInRepo = $false
$repoRoot = ""

# 情况1: 本地执行 scripts/install.ps1
$scriptPath = $MyInvocation.MyCommand.Path
if ($scriptPath) {
    $candidate = Resolve-Path (Join-Path (Split-Path $scriptPath) "..") -ErrorAction SilentlyContinue
    if ($candidate -and (Test-Path "$candidate\package.json")) {
        try {
            $pkg = Get-Content "$candidate\package.json" -Raw | ConvertFrom-Json
            if ($pkg.name -eq "coding-cli") {
                $isInRepo = $true
                $repoRoot = $candidate
            }
        } catch {}
    }
}

# 情况2: 当前目录就是仓库根目录
if (-not $isInRepo -and (Test-Path ".\package.json")) {
    try {
        $pkg = Get-Content ".\package.json" -Raw | ConvertFrom-Json
        if ($pkg.name -eq "coding-cli") {
            $isInRepo = $true
            $repoRoot = (Get-Location).Path
        }
    } catch {}
}

# ──────────────── 欢迎 ────────────────

# 动态读取版本号
$displayVersion = "0.6.4"
if ($isInRepo -and (Test-Path "$repoRoot\package.json")) {
    try {
        $pkgVer = Get-Content "$repoRoot\package.json" -Raw | ConvertFrom-Json
        $displayVersion = $pkgVer.version
    } catch {}
}

Write-Header "Coding CLI 一键安装脚本"
Write-Host "版本: v$displayVersion"
Write-Host "仓库: $RepoUrl"
Write-Host "`n本脚本将引导你完成以下步骤，每一步都会请求确认:`n"

$stepNum = 1
Write-Host "  $stepNum. 检查并安装 Git"; $stepNum++
Write-Host "  $stepNum. 检查并安装 Node.js (>= $MinNodeMajor)"; $stepNum++
if (-not $isInRepo) {
    Write-Host "  $stepNum. 克隆仓库到本地"; $stepNum++
} else {
    Write-Host "  $stepNum. 检测本地仓库"; $stepNum++
}
Write-Host "  $stepNum. npm install   (安装依赖)"; $stepNum++
Write-Host "  $stepNum. npm run build (编译 TypeScript)"; $stepNum++
Write-Host "  $stepNum. npm link      (全局注册 coding 命令)"; $stepNum++
Write-Host "  $stepNum. npm run pkg   (打包为 dist\coding.exe)"; $stepNum++
Write-Host "  $stepNum. 设置开机自启动`n"

if (-not (Confirm-Step "是否开始安装?")) {
    Write-Host "安装已取消。" -ForegroundColor Yellow
    exit 0
}

$script:stepNum = 1

# ──────────────── 步骤 1: Git ────────────────

Write-Header "步骤 $($script:stepNum): 检查 Git"
$script:stepNum++
if (Test-Command git) {
    $gitVer = git --version
    Write-Success "Git 已安装: $gitVer"
} else {
    Write-Warn "Git 未安装。"
    if (Confirm-Step "是否通过 winget 自动安装 Git?") {
        if (-not (Install-WithWinget "Git.Git" "Git")) {
            exit 1
        }
        if (Test-Command git) {
            Write-Success "Git 安装成功: $(git --version)"
        } else {
            Write-Fail "Git 安装后仍不可用，请重启终端后重试。"
            exit 1
        }
    } else {
        Write-Fail "Git 是必需依赖，安装已取消。"
        exit 1
    }
}

# ──────────────── 步骤 2: Node.js ────────────────

Write-Header "步骤 $($script:stepNum): 检查 Node.js"
$script:stepNum++
$nodeMajor = Get-NodeMajor
if ($nodeMajor -ge $MinNodeMajor) {
    Write-Success "Node.js 已安装: $(node --version)"
} elseif ($nodeMajor -gt 0) {
    Write-Warn "Node.js 版本过低 (v$nodeMajor)，需要 >= $MinNodeMajor。"
    if (Confirm-Step "是否通过 winget 升级到 Node.js LTS?") {
        if (-not (Install-WithWinget "OpenJS.NodeJS" "Node.js")) { exit 1 }
        $nodeMajor = Get-NodeMajor
        if ($nodeMajor -ge $MinNodeMajor) {
            Write-Success "Node.js 升级成功: $(node --version)"
        } else {
            Write-Fail "Node.js 升级后仍不可用，请重启终端后重试。"
            exit 1
        }
    } else {
        Write-Fail "Node.js >= $MinNodeMajor 是必需依赖，安装已取消。"
        exit 1
    }
} else {
    Write-Warn "Node.js 未安装。"
    if (Confirm-Step "是否通过 winget 自动安装 Node.js LTS?") {
        if (-not (Install-WithWinget "OpenJS.NodeJS" "Node.js")) { exit 1 }
        $nodeMajor = Get-NodeMajor
        if ($nodeMajor -ge $MinNodeMajor) {
            Write-Success "Node.js 安装成功: $(node --version)"
        } else {
            Write-Fail "Node.js 安装后仍不可用，请重启终端后重试。"
            exit 1
        }
    } else {
        Write-Fail "Node.js 是必需依赖，安装已取消。"
        exit 1
    }
}

# 顺便检查 npm
if (-not (Test-Command npm)) {
    Write-Fail "npm 未找到，请确保 Node.js 安装完整。"
    exit 1
}

# ──────────────── 步骤 3: Clone 仓库 ────────────────

if ($isInRepo) {
    Write-Header "步骤 $($script:stepNum): 仓库检测"
    $script:stepNum++
    Write-Success "检测到当前已位于仓库目录: $repoRoot"
    Set-Location $repoRoot
} else {
    Write-Header "步骤 $($script:stepNum): 克隆仓库"
    $script:stepNum++
    $targetDir = $InstallDir
    if ([string]::IsNullOrWhiteSpace($targetDir)) {
        $targetDir = Read-Host "请输入安装目录 [默认: $DefaultDir]"
        if ([string]::IsNullOrWhiteSpace($targetDir)) { $targetDir = $DefaultDir }
    }

    if (Test-Path $targetDir) {
        Write-Warn "目录已存在: $targetDir"
        if (Confirm-Step "是否删除该目录并重新 clone?") {
            Remove-Item -Recurse -Force $targetDir
        } else {
            Write-Fail "安装已取消。"
            exit 1
        }
    }

    if (Confirm-Step "确认 clone 仓库到 $targetDir ?") {
        git clone $RepoUrl $targetDir
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Clone 失败，请检查网络连接。"
            exit 1
        }
        Write-Success "仓库已克隆到 $targetDir"
        Set-Location $targetDir
        $repoRoot = $targetDir
    } else {
        Write-Fail "安装已取消。"
        exit 1
    }
}

# ──────────────── 步骤 4: npm install ────────────────

Write-Header "步骤 $($script:stepNum): 安装 Node 依赖 (npm install)"
$script:stepNum++
if (Confirm-Step "是否执行 npm install?") {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install 失败。"
        exit 1
    }
    Write-Success "依赖安装完成"
} else {
    Write-Warn "跳过 npm install"
}

# ──────────────── 步骤 5: npm run build ────────────────

Write-Header "步骤 $($script:stepNum): 编译 TypeScript (npm run build)"
$script:stepNum++
if (Confirm-Step "是否执行 npm run build?") {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm run build 失败。"
        exit 1
    }
    Write-Success "编译完成"
} else {
    Write-Warn "跳过 npm run build"
}

# ──────────────── 步骤 6: npm link ────────────────

Write-Header "步骤 $($script:stepNum): 全局注册 coding 命令 (npm link)"
$script:stepNum++
if (Confirm-Step "是否执行 npm link 以全局注册 'coding' 命令?") {
    npm link
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm link 失败 (可能需要管理员权限)。"
    } else {
        Write-Success "全局命令已注册，可直接使用 'coding'"
    }
} else {
    Write-Warn "跳过 npm link。如需全局使用，可稍后手动执行: npm link"
}

# ──────────────── 步骤 7: npm run pkg ────────────────

Write-Header "步骤 $($script:stepNum): 打包为独立 exe (npm run pkg)"
$script:stepNum++
$exePath = Join-Path $repoRoot "dist\coding.exe"
if (Confirm-Step "是否执行 npm run pkg 打包为 dist\coding.exe?") {
    npm run pkg
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm run pkg 失败。"
    } else {
        Write-Success "已打包到 $exePath"
    }
} else {
    Write-Warn "跳过 npm run pkg"
}

# ──────────────── 步骤 8: 开机自启动 ────────────────

Write-Header "步骤 $($script:stepNum): 设置开机自启动"
$script:stepNum++
if (Confirm-Step "是否设置开机自启动 (创建启动文件夹快捷方式)?") {
    if (Test-Path $exePath) {
        New-StartupShortcut -ExePath $exePath -WorkingDir $repoRoot
    } else {
        Write-Warn "未找到 $exePath，需要先执行 npm run pkg。"
        if (Confirm-Step "是否立即执行 npm run pkg 后再创建自启动?") {
            npm run pkg
            if ((Test-Path $exePath) -and ($LASTEXITCODE -eq 0)) {
                New-StartupShortcut -ExePath $exePath -WorkingDir $repoRoot
            } else {
                Write-Fail "pkg 打包失败，无法创建自启动快捷方式。"
            }
        } else {
            Write-Warn "跳过开机自启动设置"
        }
    }
} else {
    Write-Warn "跳过开机自启动设置"
}

# ──────────────── 完成 ────────────────

Write-Header "安装完成"
Write-Host "安装目录: $repoRoot" -ForegroundColor Green

# 尝试检测 coding 命令是否可用
$codingAvailable = $false
if (Test-Command coding) {
    $codingAvailable = $true
} elseif (Test-Path $exePath) {
    # 至少 exe 可用
}

Write-Host "`n可用方式:" -ForegroundColor Cyan
if ($codingAvailable) {
    Write-Host "  coding --help        查看 CLI 帮助"
    Write-Host "  coding --chat        启动 AI 对话模式"
    Write-Host "  coding --paths       扫描项目路径"
}
if (Test-Path $exePath) {
    Write-Host "  $exePath  直接运行 exe"
}

Write-Host "`n配置文件: $repoRoot\.env"
Write-Host "如需配置 API Key，请复制 .env.example 为 .env 并填写。" -ForegroundColor Yellow

Write-Host "`n感谢安装 Coding CLI!" -ForegroundColor Cyan
