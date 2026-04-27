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
| 📁 **项目路径** - 扫描并显示 `C:\project` 下所有项目 | 项目路径扫描 |
| 🐙 **GitHub 状态** - 查看最新 Issues 和认证命令 | GitHub 集成 |
| ⚡ **AI CLI 参考** - Claude, Kiro, Codex, Gemini, Cursor 命令 | AI CLI 参考 |
| 🚀 **应用启动** - 常用应用的快速启动命令 | 应用启动器 |
| 🤖 **AI 对话模式** - 与 DeepSeek 的交互式 AI 对话 | AI 聊天 |

## 🚀 快速开始

### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### 安装

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

> **AI 对话特性**
> - 🔒 只读模式 - 无法编辑/创建/删除文件
> - 🛠️ 可用工具：`ls`、`dir`、`Read`、`Grep`、`WebSearch`
> - 💬 多轮对话
> - 🌐 使用 DeepSeek API

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

# GitHub Token（可选，用于 GitHub 功能）
# 也可以从 ~/project/1037Solo/StudySolo-Dev/backend/.env 读取
```

### 开机自启动

```powershell
# 运行快捷方式创建脚本
powershell -ExecutionPolicy Bypass -File create_shortcut.ps1
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
│   ├── index.ts      # 入口点和命令解析
│   ├── github.ts     # GitHub API 集成
│   ├── paths.ts      # 项目路径扫描
│   ├── cli.ts        # AI CLI 命令参考
│   ├── apps.ts       # 应用启动命令
│   └── chat.ts       # AI 对话实现
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
- [pkg](https://github.com/vercel/pkg) - Node.js 应用打包工具

---

<p align="center">
由 <a href="https://github.com/AIMFllyYS">AIMFllyYS</a> 用 ❤️ 打造
</p>
