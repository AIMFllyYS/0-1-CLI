# 0-1 CLI

0-1 CLI 是给新人准备的 AI 编程入门工具箱。它把 Claude Code、Codex、Kimi、Kiro、AI IDE、skills、API 平台、支付/虚拟卡、代理环境这些零散步骤收进一个 `hi` 命令里，帮助你从 0 到 1 搭好本地 AI 编程环境。

这个项目的重点不是炫技，而是让第一次接触 CLI 的人也能知道下一步该做什么。

## v0.8.0 — 桌面端重做、项目启动台、统一设置

- **桌面端从零重做**：修复了让整个桌面端失效的 preload 加载错误；Agent 现在可以在应用内运行，每次改文件或执行命令前出现批准卡片（含 diff），支持流式回答、多会话并行、计划模式、浅色/深色主题。
- **项目启动台**：`hi path add/list/rm` 登记项目目录和启动方式，`hi run <id>` 在新终端里一键拉起（优先 Windows Terminal，缺失时降级到 cmd）。
- **统一设置**：`hi config` 与桌面端共用一份配置，包含开机自启动、AI 默认值、是否启动时先读取 GitHub、主题。
- 完整变更见 [更新日志](docs/updates/CHANGELOG.md)。

## v0.7.0 — Claude Code 级别 UX 升级

- **全面 Markdown 渲染**：所有 CLI 命令（`--state`、`--api`、`--pay`、`--install`、`--skills`、默认讲解、`--cli`、`--paths`、`--apps`）均使用基于 `marked` + `string-width` 的终端渲染引擎，支持表格、代码块、嵌套列表、引用块、中日韩字符宽度自动适配。
- **`--ai` 模式深度对标 Claude Code**：增长星号动画（`·✢✳✶✻✽`）、品牌橙 `#d77757` + 蓝紫辅色 `#b1b9f9`；上下键历史回溯修复（不再触发全屏乱行）；`tool_call` 工具配对正确性修复（兼容真实 OpenAI-compatible 提供商）。
- **桌面端 Claude Code 1:1 复刻**：完整 Claude 调色盘（CSS 自定义属性）、左侧「0-1 CLI」命令面板（点击按钮 GUI 式运行 `--install` 等经典指令）、实时 Agent 编排时间轴（工具行、子 Agent 泳道、权限/计划行）、文件变更差异卡片、真实流式 Markdown 消息。

## 你可以用它做什么

| 命令 | 作用 |
| --- | --- |
| `hi` | 默认打开新手讲解模式，从 Claude Code、CLI、代理和 skills 开始入门 |
| `hi --state` | 打开状态页，查看 GitHub、项目路径、CLI 指令和常用 App |
| `hi --install` | 进入安装菜单，安装 AI CLI、AI IDE 和魔法环境工具 |
| `hi --skills` | 打开 skills 市场，安装 Superpowers 或 agent-onboarding-skill |
| `hi --api` | 选择 GLM、Kimi、DeepSeek、OpenAI、Claude 等 API 平台并跳转 |
| `hi --pay` | 查看 Supay、代充平台和 API 中转平台入口 |
| `hi --ai` / `hi --chat` | 进入内置 AI 对话模式（支持 `/chat`、`/agent`、`/plan` 模式） |
| `hi --clear` | 清理后台进程或 C 盘空间，执行前会让你确认 |

## 一键安装最新版

### Windows PowerShell

推荐使用 `irm`，编码更稳定：

```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/master/scripts/install.ps1 | iex
```

如果你的终端中文显示异常，先执行：

```powershell
[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
```

更稳的本地下载方式：

```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/master/scripts/install.ps1 -OutFile "$env:TEMP\install-hi-cli.ps1"; & "$env:TEMP\install-hi-cli.ps1"
```

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/master/scripts/install.sh | bash
```

## 安装指定版本

如果你想固定安装某个发布版本，把链接里的 `master` 换成对应 tag，例如：

```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/v0.8.0/scripts/install.ps1 | iex
```

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/v0.8.0/scripts/install.sh | bash
```

如果还没有发布 tag，就继续使用 `master` 安装最新主分支版本。

## 本地开发安装

```bash
git clone https://github.com/AIMFllyYS/0-1-CLI.git
cd 0-1-CLI
npm install
npm run build
npm link
hi --help
```

## 新人推荐路线

1. 先运行 `hi`，看默认讲解模式。
2. 用 `hi --install cc` 安装 Claude Code。
3. 用 `hi --install cc-switch` 安装 CC Switch，学习在 Claude Code 中接入其他 API。
4. 用 `hi --install proxy` 打开 Sibker 代理入口。
5. 用 `hi --install clash-verge` 下载 Windows 版 Clash Verge。
6. macOS Intel 用 `hi --install clash-verge-mac-intel`。
7. macOS Apple Silicon/M 芯片用 `hi --install clash-verge-mac-arm`。
8. 用 `hi --skills` 安装 `agent-onboarding-skill`，跟着真实任务练习。
9. 用 `hi --api` 找开发者平台，用 `hi --pay` 找支付和中转入口。

## 常用安装目标

```bash
hi --install cc
hi --install codex
hi --install kimi
hi --install cursor
hi --install cc-switch
hi --install proxy
hi --install clash-verge
hi --install clash-verge-mac-intel
hi --install clash-verge-mac-arm
hi --skills
```

## 开发命令

```bash
npm install
npm run build
node --test --test-concurrency=1 tests/*.test.js
npm run desktop:build
```

## 编码注意事项

本项目包含大量中文说明。提交前请确保文件以 UTF-8 保存，PowerShell 输出建议使用 UTF-8：

```powershell
[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
```

如果旧终端仍然乱码，可以临时执行：

```powershell
chcp 65001
```

## License

MIT
