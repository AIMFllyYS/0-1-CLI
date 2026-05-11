# My-Windows-CLI

<!-- Badges -->
<div align="center">

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/AIMFllyYS/My-Windows-CLI/blob/master/LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

</div>

---

[English](README.md) | [中文](README_zh-CN.md)

---

> A powerful Windows CLI tool for developers, providing quick access to project paths, GitHub status, AI CLI commands, and interactive AI chat.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📁 **Project Paths** - Scan and display all projects in `C:\project` | Auto-scan all projects under `C:\project` |
| 🐙 **GitHub Status** - View recent issues and auth commands | Check latest Issues and authentication commands |
| ⚡ **AI CLI Reference** - Commands for Claude, Kiro, Codex, Gemini, Cursor | AI CLI commands reference |
| 🚀 **App Launcher** - Quick launch commands for common apps | Quick launcher for common applications |
| 🤖 **AI Chat Mode** - Interactive AI conversation with DeepSeek/GLM | Interactive AI chat with DeepSeek/ZhiPu GLM |
| 🧹 **Clear** - AI-assisted cleanup of useless processes & C drive | AI-assisted cleanup for background processes and C drive |

## 🚀 Quick Start

### One-Line Install

Run the following command in PowerShell. The script will auto-detect and install Git / Node.js, then clone, build, and optionally register the global command. Each step requires confirmation:

**Recommended (`irm` has more stable encoding):**
```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/My-Windows-CLI/master/scripts/install.ps1 | iex
```

**Alternative (download to local first, most reliable):**
```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/My-Windows-CLI/master/scripts/install.ps1 -OutFile "$env:TEMP\install-coding-cli.ps1"; & "$env:TEMP\install-coding-cli.ps1"
```

> Administrator privileges may be required for winget to install dependencies. If Chinese characters appear garbled, run `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` first.

### Manual Installation

#### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

#### Steps

```bash
# Clone the repository
git clone https://github.com/AIMFllyYS/My-Windows-CLI.git
cd My-Windows-CLI

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link globally (optional)
npm link

# Package to exe (optional)
npm run pkg
```

### First Run

```bash
# Copy and configure environment variables
cp .env.example .env
# Edit .env and add your API keys

# Run
coding
```

## 📖 Usage

### Basic Commands

```bash
# Full output (all info)
coding

# Short output
coding --short

# Show only specific sections
coding --paths      # Project paths only
coding --apps       # App launch commands only
coding --issues     # GitHub issues only
```

### AI CLI Reference

```bash
# Show all AI CLI auto commands
coding --cli all

# Show specific CLI tool commands
coding --cli cc      # Claude Code
coding --cli kiro    # Kiro
coding --cli codex   # Codex
coding --cli gemini  # Gemini
coding --cli cursor  # Cursor

# With task description
coding --cli cc --task "Fix the login bug"
```

### AI Chat Mode

```bash
# Start interactive chat
coding --chat

# Or use alias
coding --ai

# Specify model
coding --chat --model deepseek-chat
```

### Clear Mode

```bash
# AI-assisted useless process cleanup
coding --clear -p
coding --clear --process

# AI-assisted C drive cleanup
coding --clear -d
coding --clear --drive

# Both process + drive cleanup
coding --clear -a
coding --clear --all

# Shortcut
coding --clear-a
```

> **Clear Features**
> - 🤖 AI analyzes which processes/files are safe to remove
> - 🛡️ Local whitelist protects system-critical processes
> - ✅ User confirmation before any deletion
> - 📝 Detailed logs saved to `scripts/logs/`
> - 🧹 C drive: Conservative / Aggressive dual modes

> **AI Chat Features**
> - 🔒 Read-only mode - Cannot edit/create/delete files
> - 🛠️ Available tools: `ls`, `dir`, `Read`, `Grep`, `WebSearch`
> - 🔍 Built-in web search with auto AI summarization
> - 🧠 Multiple models: DeepSeek V4, GLM-4.7/4.5/5
> - 💬 Multi-turn conversations
> - 🌐 Uses DeepSeek / ZhiPu API

## 📋 Supported AI CLI Tools

| Tool | CLI Command | Auto Mode Command |
|------|-------------|-------------------|
| **Claude Code** | `claude` | `claude chat --no-interactive --dangerously-skip-permissions "task"` |
| **Kiro** | `kiro-cli` | `kiro-cli chat --no-interactive --trust-all-tools "task"` |
| **Codex** | `codex` | `codex --standalone "task"` |
| **Gemini** | `gemini` | `gemini "task"` |
| **Cursor** | `cursor` | `cursor --no-install "task"` |

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# DeepSeek API Key (required for AI chat)
DEEPSEEK_API_KEY=your_api_key_here

# ZhiPu API Key (required for web search and GLM models)
ZHIPU_API_KEY=your_api_key_here

# GitHub Token (optional, for GitHub features)
GITHUB_TOKEN=your_github_token_here
```

### Windows Startup

```powershell
# Auto-detect path
cd scripts
powershell -ExecutionPolicy Bypass -File create_shortcut.ps1

# Manually specify path
powershell -ExecutionPolicy Bypass -File create_shortcut.ps1 -ExePath "C:\your\path\dist\coding.exe"
```

## 🛠️ Development

```bash
# Build
npm run build

# Watch mode (development)
npm run build -- --watch

# Package for distribution
npm run pkg

# Clean build artifacts
npm run clean
```

## 📁 Project Structure

```
My-Windows-CLI/
├── src/
│   ├── index.ts              # Entry point & command parsing
│   ├── modules/
│   │   ├── github/           # GitHub integration
│   │   │   ├── auth.ts       # Account management & switching
│   │   │   ├── issues.ts     # Issues fetching
│   │   │   └── index.ts      # Module exports
│   │   ├── clear/            # AI-assisted cleanup (process + drive)
│   │   │   ├── process.ts    # Process cleanup
│   │   │   ├── drive.ts      # C drive cleanup
│   │   │   ├── scan.ts       # Process scanning
│   │   │   ├── ai-filter.ts  # AI judgment
│   │   │   ├── kill.ts       # Process termination
│   │   │   ├── logger.ts     # Cleanup logs
│   │   │   └── index.ts      # Unified entry
│   │   ├── paths.ts          # Project path scanning
│   │   ├── cli.ts            # AI CLI commands reference
│   │   ├── apps.ts           # App launch commands
│   │   └── chat/             # AI chat (DeepSeek / ZhiPu)
│   ├── utils/
│   │   ├── config.ts         # Shared config management
│   │   └── selector.ts       # Interactive terminal selector
│   └── types/                # TypeScript type definitions
├── scripts/
│   ├── install.ps1           # One-line install script (Windows)
│   ├── create_shortcut.ps1   # Windows startup shortcut
│   ├── clean-c-drive.ps1     # C drive cleanup PowerShell script
│   ├── logs/                 # Cleanup logs (git-ignored)
│   └── tmp/                  # Temporary files (git-ignored)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) - AI coding assistant
- [DeepSeek](https://www.deepseek.com/) - LLM API provider
- [ZhiPu AI](https://www.zhipu.ai/) - GLM model API provider
- [pkg](https://github.com/vercel/pkg) - Package Node.js apps
- 乐事学长 - C drive cleanup PowerShell script source

---

<p align="center">
Made with ❤️ by <a href="https://github.com/AIMFllyYS">AIMFllyYS</a>
</p>
