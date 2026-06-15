# 0-1 CLI

0-1 CLI 是给新人准备的 AI 编程入门工具箱。它把 Claude Code、Codex、Kimi、Kiro、AI IDE、skills、API 平台、支付/虚拟卡、代理环境这些零散步骤收进一个 `hi` 命令里，帮助你从 0 到 1 搭好本地 AI 编程环境。

这个项目的重点不是炫技，而是让第一次接触 CLI 的人也能知道下一步该做什么。

## 你可以用它做什么

| 命令 | 作用 |
| --- | --- |
| `hi` | 默认打开新手讲解模式，从 Claude Code、CLI、代理和 skills 开始入门 |
| `hi --state` | 打开旧版状态页，查看 GitHub、项目路径、CLI 指令和常用 App |
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
irm https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/v0.6.15/scripts/install.ps1 | iex
```

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/v0.6.15/scripts/install.sh | bash
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
npm run test:onboarding
npm run test:resources
npm run test:install-registry
npm run test:skills
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