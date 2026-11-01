# AGENTS.md — My-CLI Project Guide

## Project Identity

**Name:** My-CLI (`coding-cli` / `hi`)
**Version:** 0.8.0
**Purpose:** 0→1 CLI — AI CLI onboarding and development toolbox, inspired by Claude Code but provider-neutral.

## Architecture

```
src/
  index.ts              → CLI command routing (Commander)
  chat/
    index.ts            → Interactive AI loop entry
    session.ts          → Mode, permission, model, plan, skills, subagent state
    commands.ts         → Slash command registry and parsing
    typeahead.ts        → Prompt suggestions
    keybindings.ts      → Keyboard routing
    interrupts.ts       → Ctrl+C / Esc interrupt state machine
    provider.ts         → Provider-neutral OpenAI-compatible chat completion
    config.ts           → Settings persistence (.env)
    models.ts           → Model registry and metadata
    modes.ts            → /chat, /agent, /plan mode logic
    skills.ts           → Skills runtime
    plan-store.ts       → Plan draft persistence
    prompt.ts           → System prompt assembly
    markdown.ts         → Markdown rendering in terminal
    spinner.ts          → Activity spinner
    stream-renderer.ts  → Streaming token renderer
    terminal-ui.ts      → Terminal layout utilities
    suggestions.ts      → Context-aware suggestions
    tools/
      registry.ts       → Tool registration and spec export
      runner.ts         → Tool execution orchestration
      fs-read.ts        → File read tool
      fs-write.ts       → File write tool
      shell.ts          → Shell execution tool
    permissions/
      engine.ts         → Permission state machine
      prompts.ts        → Permission dialog rendering
    agent/
      definitions.ts    → Built-in and local agent definitions
      loop.ts           → Agent message/tool loop
      runner.ts         → Subagent execution runner
      subagents.ts      → Subagent queue and lifecycle
      prompt.ts         → Subagent prompt construction
      types.ts          → Agent type definitions
    ui/
      theme.ts          → Color and style constants
      layout.ts         → Terminal layout components
    skills/             → Skills sub-modules (discovery, search, runtime)
  modules/              → Non-AI CLI modules (install, clear, skills, pay, etc.)
  types/
    index.ts            → Shared type definitions
  utils/
    config.ts           → Config file utilities
    open-url.ts         → URL opener
    selector.ts         → Interactive selector

desktop/
  src/
    main/               → Electron main process
    preload/            → Preload scripts (IPC bridge)
    renderer/           → React renderer (App, action-catalog)
  electron-builder.yml  → Packaging config
  scripts/copy-cli.cjs  → CLI bundle copy for packaging

tests/                  → node:test test files
docs/                   → Planning docs, changelogs
.github/workflows/      → CI/CD workflows
```

## Tech Stack

- **Runtime:** Node.js (ESM-compatible CJS output)
- **Language:** TypeScript (strict)
- **CLI Framework:** Commander.js
- **Styling:** Chalk 4.x (CommonJS-compatible)
- **Testing:** node:test (built-in)
- **Build:** tsc (TypeScript compiler)
- **Desktop:** Electron + Vite + React + electron-builder
- **CI:** GitHub Actions

## Conventions

### Code Style
- TypeScript strict mode
- UTF-8 everywhere; preserve Chinese text in all user-facing strings
- No decorative comments; only explain non-obvious intent
- Prefer explicit imports over barrel re-exports
- Use `node:` prefix for built-in modules

### Testing
- All test files in `tests/` using `node:test`
- Test before implement (TDD when possible)
- Run: `node --test --test-concurrency=1 .\tests\*.test.js`

### Build
- `npm run build` → `tsc`
- Output in `dist/`
- Desktop: `npm run desktop:build`

### Commit Prefixes
- `feat(ai):` — AI runtime features
- `fix(ai):` — AI runtime bug fixes
- `feat(desktop):` — Desktop app features
- `fix(desktop):` — Desktop bug fixes
- `ci(desktop):` — Release workflow
- `chore(ai):` — Audits and cleanup
- `docs(ai):` — Planning docs

## Hard Rules (Non-Negotiable)

### NEVER Port These From Claude Code
- Login, logout, OAuth, account detection, subscription checks
- Telemetry, OpenTelemetry, analytics, usage reporting, Statsig, GrowthBook
- Anthropic employee-only commands, internal agents platform
- Billing, quota, pricing, entitlement, trusted-device flows
- Remote bridge, CCR, Chrome bridge, mobile bridge, cloud teammate services
- Any feature sending local user/project metadata to vendors without direct user request

### Safety
- Desktop IPC: whitelist-only, no arbitrary shell from renderer
- Subagents cannot widen parent permissions
- API keys masked in all display paths
- No push/merge/release without explicit user authorization

### Provider Neutrality
- All AI features use OpenAI-compatible API format
- No Claude-specific SDK dependencies in runtime
- Model IDs are user-configurable strings
- Provider base URL is user-configurable

## Claude Code Source Reference

Location: `D:\project\MCP-Skills\ClaudeCode-Collection\ClaudeCode-Collection\claude-code-source`

Use as a transplant donor:
1. Copy useful architecture patterns
2. Adapt to My-CLI's module boundaries
3. Delete all forbidden categories immediately
4. Keep My-CLI identity (branding, naming)

## Execution Protocol

When executing a round from `docs/plans/claude-code-parity-v2/rounds/`:
1. Read this file + plan README + global spec + verification doc + round file
2. Read referenced Claude Code source files
3. Write/update tests first
4. Implement changes
5. Run verification commands
6. Commit locally
7. Do not push, merge, or release
