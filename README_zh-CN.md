# My-Windows-CLI

<!-- 徽章 -->
<div align="center">

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/AIMFllyYS/My-Windows-CLI/blob/master/LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

</div>

---

[English](README.md) | [中文](README_zh-CN.md)

---

> 为开发者打造的强大 Windows CLI 工具，可快速获取项目路径、GitHub 状态、AI CLI 命令和交互式 AI 对话。

## ✨ 功能特点

| 功能 | 说明 |
|------|------|
| 📁 **项目路径** - 扫描并显示 `C:\project` 下所有项目 | 自动扫描 `C:\project` 下的所有项目 |
| 🐙 **GitHub 状态** - 查看最新 Issues 和认证命令 | 查看最新 Issues 和账号切换命令 |
| ⚡ **AI CLI 参考** - Claude, Kiro, Codex, Gemini, Cursor 命令 | AI CLI 命令速查参考 |
| 🚀 **应用启动** - 常用应用的快速启动命令 | 常用应用的快速启动器 |
| 🤖 **AI 对话模式** - 与 DeepSeek/智谱 GLM 的交互式 AI 对话 | 与 DeepSeek/智谱 GLM 交互式对话 |
| 🧹 **AI 辅助清理** - 无用进程清理 + C 盘清理 | AI 辅助清理后台进程和 C 盘 |

## 🚀 快速开始

### 一行命令安装

在 PowerShell 中运行以下命令，脚本会自动检测并安装 Git / Node.js，随后 clone、构建、注册全局命令，每一步都会请求确认：

**推荐方式（`irm` 编码更稳定）：**
```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/My-Windows-CLI/master/scripts/install.ps1 | iex
```

**备选方式（先下载到本地再执行，最可靠）：**
```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/My-Windows-CLI/master/scripts/install.ps1 -OutFile "$env:TEMP\install-coding-cli.ps1"; & "$env:TEMP\install-coding-cli.ps1"
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
git clone https://github.com/AIMFllyYS/My-Windows-CLI.git
cd My-Windows-CLI

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
coding
```

## 📖 使用指南

### 基本命令

```bash
# 完整输出（所有信息）
coding

# 简短输出
coding --short

# 仅显示特定部分
coding --paths      # 仅项目路径
coding --apps       # 仅应用启动命令
coding --issues     # 仅 GitHub Issues
```

### AI CLI 参考

```bash
# 显示所有 AI CLI 自动运行命令
coding --cli all

# 显示特定 CLI 工具命令
coding --cli cc      # Claude Code
coding --cli kiro    # Kiro
coding --cli codex   # Codex
coding --cli gemini  # Gemini
coding --cli cursor  # Cursor

# 带任务描述
coding --cli cc --task "修复登录 bug"
```

### AI 对话模式

```bash
# 启动交互式对话
coding --chat

# 或使用别名
coding --ai

# 指定模型
coding --chat --model deepseek-chat
```

### 清理模式

```bash
# AI 辅助清理无用后台进程
coding --clear -p
coding --clear --process

# AI 辅助 C 盘清理
coding --clear -d
coding --clear --drive

# 同时进行进程和硬盘清理
coding --clear -a
coding --clear --all

# 快捷方式
coding --clear-a
```

> **清理特性**
> - 🤖 AI 分析哪些进程/文件可以安全清理
> - 🛡️ 本地白名单保护系统关键进程
> - ✅ 删除前必须用户确认
> - 📝 详细日志保存到 `scripts/logs/`
> - 🧹 C 盘：保守 / 激进 双模式

> **AI 对话特性**
> - 🔒 只读模式 - 无法编辑/创建/删除文件
> - 🛠️ 可用工具：`ls`、`dir`、`Read`、`Grep`、`WebSearch`
> - 🔍 内置网络搜索 + AI 自动总结
> - 🧠 多模型支持：DeepSeek V4、GLM-4.7/4.5/5
> - 💬 多轮对话
> - 🌐 使用 DeepSeek / 智谱 API

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
GITHUB_TOKEN=your_github_token_here
```

### 开机自启动

```powershell
# 自动检测路径
cd scripts
powershell -ExecutionPolicy Bypass -File create_shortcut.ps1

# 手动指定路径
powershell -ExecutionPolicy Bypass -File create_shortcut.ps1 -ExePath "C:\your\path\dist\coding.exe"
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
My-Windows-CLI/
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
