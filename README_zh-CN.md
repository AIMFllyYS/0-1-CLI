# 0-1 CLI

<!-- 徽章 -->
<div align="center">

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/AIMFllyYS/0-1-CLI/blob/master/LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

</div>

---

[English](README.md) | [中文](README_zh-CN.md)

---

> 面向开发者的跨平台 AI CLI 入门工具箱，帮助你从 0 到 1 配置 AI CLI、AI IDE、skills 和自定义 AI Provider。

## ✨ 功能特点

| 功能 | 说明 |
|------|------|
| 📁 **项目路径** - 扫描并显示 `C:\project` 下所有项目 | 自动扫描 `C:\project` 下的所有项目 |
| 🐙 **GitHub 状态** - 查看最新 Issues 和认证命令 | 查看最新 Issues 和账号切换命令 |
| ⚡ **AI CLI 参考** - Claude, Kiro, Codex, Gemini, Cursor 命令 | AI CLI 命令速查参考 |
| 🚀 **应用启动** - 常用应用的快速启动命令 | 常用应用的快速启动器 |
| 🤖 **AI 对话模式** - 与 DeepSeek/智谱 GLM 的交互式 AI 对话 | 与 DeepSeek/智谱 GLM 交互式对话 |
| 🧹 **AI 辅助清理** - 无用进程清理 + C 盘清理 | AI 辅助清理后台进程和 C 盘 |
| 🚀 **项目启动台** - 注册目录和启动命令，一键在新终端拉起 | `hi path` / `hi run` |
| ⚙️ **统一设置** - CLI 与桌面端共用一份配置 | `hi config` |
| 🖥️ **桌面应用** - 对话、批准、diff、设置、启动台 | Electron 桌面端，浅色/深色主题 |

## 🚀 快速开始

### 一行命令安装

在 PowerShell 中运行以下命令，脚本会自动检测并安装 Git / Node.js，随后 clone、构建、注册全局命令，每一步都会请求确认：

**推荐方式（`irm` 编码更稳定）：**
```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/master/scripts/install.ps1 | iex
```

**备选方式（先下载到本地再执行，最可靠）：**
```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/master/scripts/install.ps1 -OutFile "$env:TEMP\install-hi-cli.ps1"; & "$env:TEMP\install-hi-cli.ps1"
```

**macOS / Linux：**
```bash
curl -fsSL https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/master/scripts/install.sh | bash
```

**本地源码安装（clone 后）：**
```bash
npm install
npm run build
npm link
hi --help
```

> 需要通过 winget 自动安装依赖时可能需要管理员权限。如果中文显示乱码，请先执行 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。

### 手动安装

#### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

#### 步骤

```bash
# 克隆仓库
git clone https://github.com/AIMFllyYS/0-1-CLI.git
cd 0-1-CLI

# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 全局链接（可选）
npm link

# 打包成 exe（可选）
npm run pkg
```

### 首次运行

```bash
# 复制并配置环境变量
cp .env.example .env
# 编辑 .env 添加你的 API 密钥

# 运行
hi
```

## 📖 使用指南

### 基本命令

```bash
# 完整输出（所有信息）
hi

# 简短输出
hi --short

# 仅显示特定部分
hi --paths      # 仅项目路径
hi --apps       # 仅应用启动命令
hi --issues     # 仅 GitHub Issues
```

### 项目启动台

把常用项目的目录和启动方式登记一次，之后一条命令就能在新终端里拉起。

```bash
hi path add D:projectsmy-app --start "npm run dev"   # 登记（不带路径或加 -i 会逐项询问，并按目录内容预填启动方式）
hi path list [--json]                                  # 列出已登记的项目
hi run my-app                                          # 在新终端、项目目录下执行启动命令
hi run                                                 # 不带 id：交互选择
hi path rm my-app                                      # 删除登记
```

`--start` 会自动区分「命令」和「脚本」：目录里真实存在的 `.cmd` / `.bat` / `.ps1` 记为脚本，其余当作命令；可用 `--cmd` / `--script` 强制指定。优先使用 Windows Terminal，没有时自动降级到 `cmd`。目前仅支持 Windows。

### 设置

`hi config` 与桌面端共用同一份配置（保存在用户目录的 `.coding-cli.json`）。

```bash
hi config list                                   # 查看全部设置
hi config set github.prefetch off                # 启动状态页时不先读取 GitHub
hi config set startup.cliAutostart on            # 开机时在终端里打开 hi
hi config set ai.defaultMode agent               # 新对话默认进入 agent 模式
hi config reset                                  # 全部恢复默认
```

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| `ai.defaultMode` | `chat` | 新对话的默认模式：`chat` / `agent` / `plan` |
| `ai.defaultModelId` | 空 | 默认模型，留空沿用当前模型 |
| `ai.autoAccept` | `off` | Agent 自动接受工具权限（高危命令仍会拦截） |
| `ai.maxToolRounds` | `8` | 单次最多连续调用工具的轮数（1 到 50） |
| `github.prefetch` | `on` | 启动状态页时先读取 GitHub 账号和 Issues（只读） |
| `startup.cliAutostart` | `off` | 开机时在终端里打开 hi（Windows） |
| `startup.desktopAutostart` | `off` | 登录系统后自动打开桌面应用（仅安装版） |
| `appearance.theme` | `system` | 桌面端主题：`system` / `light` / `dark` |

### 桌面应用

桌面端是一个完整的对话界面：流式回答、工具调用、文件改动 diff，以及每次改文件或执行命令前的批准卡片（`Enter` 允许一次，`Esc` 拒绝）。支持多会话并行、计划模式、浅色/深色主题，并在设置页提供上面全部选项。

模型的接口地址、API Key 和模型 ID 在桌面端「设置」里填写，保存到用户目录；命令行里已有的环境变量或 `.env` 仍然优先。

| 快捷键 | 作用 |
| --- | --- |
| `Enter` / `Shift+Enter` | 发送 / 换行 |
| `Esc` | 停止当前回答（批准卡片上为拒绝） |
| `Shift+Tab` | 切换模式 |
| `Ctrl+N` | 新对话 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+L` | 聚焦输入框 |

### AI CLI 参考

```bash
# 显示所有 AI CLI 自动运行命令
hi --cli all

# 显示特定 CLI 工具命令
hi --cli cc      # Claude Code
hi --cli kiro    # Kiro
hi --cli codex   # Codex
hi --cli gemini  # Gemini
hi --cli cursor  # Cursor

# 带任务描述
hi --cli cc --task "修复登录 bug"
```

### AI 对话模式

```bash
# 启动交互式对话
hi --chat

# 或使用别名
hi --ai

# 指定模型
hi --chat --model deepseek-chat
```

### 清理模式

```bash
# AI 辅助清理无用后台进程
hi --clear -p
hi --clear --process

# AI 辅助 C 盘清理
hi --clear -d
hi --clear --drive

# 同时进行进程和硬盘清理
hi --clear -a
hi --clear --all

# 快捷方式
hi --clear-a
```

> **清理特性**
> - 🤖 AI 分析哪些进程/文件可以安全清理
> - 🛡️ 本地白名单保护系统关键进程
> - ✅ 删除前必须用户确认
> - 📝 详细日志保存到 `scripts/logs/`
> - 🧹 C 盘：保守 / 激进 双模式

> **AI 对话特性**
> - 💬 `/chat` 只读模式：可读文件、搜索、解释代码
> - 🤖 `/agent` 代理模式：可写文件、运行 shell（需权限确认；`--auto-accept` 为本地开发跳过）
> - 📋 `/plan` 计划模式：起草方案并经用户批准后再切换到 agent
> - 🛠️ 本地工具：读/写文件、shell、子 agent、skills 搜索
> - 🧠 多模型支持：DeepSeek、GLM 及自定义 OpenAI 兼容 Provider
> - 🔒 API Key 在展示路径中一律脱敏

## 📋 支持的 AI CLI 工具

| 工具 | CLI 命令 | 自动运行命令 |
|------|---------|-------------|
| **Claude Code** | `claude` | `claude chat --no-interactive --dangerously-skip-permissions "task"` |
| **Kiro** | `kiro-cli` | `kiro-cli chat --no-interactive --trust-all-tools "task"` |
| **Codex** | `codex` | `codex --standalone "task"` |
| **Gemini** | `gemini` | `gemini "task"` |
| **Cursor** | `cursor` | `cursor --no-install "task"` |

## ⚙️ 配置

### 环境变量

根据 `.env.example` 创建 `.env` 文件：

```bash
# DeepSeek API 密钥（AI 对话必需）
DEEPSEEK_API_KEY=your_api_key_here

# 智谱 API 密钥（网络搜索和 GLM 模型必需）
ZHIPU_API_KEY=your_api_key_here

# GitHub Token（可选，用于 GitHub 功能）
# 也可以从 ~/project/1037Solo/StudySolo-Dev/backend/.env 读取
```

### 开机自启动

```powershell
# 自动检测路径
cd scripts
powershell -ExecutionPolicy Bypass -File create_shortcut.ps1

# 手动指定路径
powershell -ExecutionPolicy Bypass -File create_shortcut.ps1 -ExePath "C:\your\path\dist\hi.exe"
```

## 🛠️ 开发

```bash
# 编译
npm run build

# 监听模式（开发）
npm run build -- --watch

# 打包分发
npm run pkg

# 清理构建产物
npm run clean
```

## 📁 项目结构

```
0-1-CLI/
├── src/
│   ├── index.ts              # 入口点和命令解析
│   ├── modules/
│   │   ├── github/           # GitHub 集成
│   │   │   ├── auth.ts       # 账号管理和切换
│   │   │   ├── issues.ts     # Issues 查询
│   │   │   └── index.ts      # 模块导出
│   │   ├── clear/            # AI 辅助清理
│   │   │   ├── process.ts    # 进程清理
│   │   │   ├── drive.ts      # C 盘清理
│   │   │   ├── scan.ts       # 进程扫描
│   │   │   ├── ai-filter.ts  # AI 判断
│   │   │   ├── kill.ts       # 进程终止
│   │   │   ├── logger.ts     # 清理日志
│   │   │   └── index.ts      # 统一入口
│   │   ├── paths.ts          # 项目路径扫描
│   │   ├── cli.ts            # AI CLI 命令参考
│   │   ├── apps.ts           # 应用启动命令
│   │   └── chat/             # AI 对话 (DeepSeek / 智谱)
│   ├── utils/
│   │   ├── config.ts         # 共享配置管理
│   │   └── selector.ts       # 交互式终端选择器
│   └── types/                # TypeScript 类型定义
├── scripts/
│   ├── install.ps1           # 一行命令安装脚本 (Windows)
│   ├── create_shortcut.ps1   # Windows 开机启动快捷方式
│   ├── clean-c-drive.ps1     # C 盘清理 PowerShell 脚本
│   ├── logs/                 # 清理日志 (不追踪 git)
│   └── tmp/                  # 临时文件 (不追踪 git)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) - AI 编程助手
- [DeepSeek](https://www.deepseek.com/) - LLM API 提供商
- [智谱 AI](https://www.zhipu.ai/) - GLM 模型 API 提供商
- [pkg](https://github.com/vercel/pkg) - Node.js 应用打包工具
- 乐事学长 - C 盘清理 PowerShell 脚本源代码

---

<p align="center">
由 <a href="https://github.com/AIMFllyYS">AIMFllyYS</a> 用 ❤️ 打造
</p>
