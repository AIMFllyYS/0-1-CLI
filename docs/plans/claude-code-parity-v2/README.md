# Claude Code Parity V2 Planning Pack

> For agentic workers: REQUIRED SUB-SKILL: use `superpowers:using-superpowers` first, then use `superpowers:subagent-driven-development` or `superpowers:executing-plans` when executing implementation rounds. This folder is the single source of truth for the next My-CLI AI/desktop upgrade push.

**Goal:** Turn the existing `hi --ai` and desktop shell into a Claude Code-inspired, provider-neutral local assistant by systematically porting useful Claude Code source shapes, deleting account/telemetry/provider-lock behavior, and validating every round.

**Architecture:** Keep the existing My-CLI runtime boundaries. `src/chat/**` owns CLI AI behavior, `src/chat/agent/**` owns local subagents, `src/chat/permissions/**` owns tool approval, `src/chat/ui/**` owns terminal rendering, and `desktop/**` owns the Electron shell. Claude Code source is a reference and transplant donor, not a dependency.

**Tech Stack:** Node.js, TypeScript, Commander, Chalk, readline, node:test, Electron, Vite, React, electron-builder, GitHub Actions.

---

## Documents

- `00-global-spec.md`: product contract, non-goals, invariants, and source-to-target architecture.
- `01-current-state-and-gap-audit.md`: current branch status, implemented capabilities, known gaps, and risk register.
- `02-claude-source-transplant-map.md`: Claude Code source areas, My-CLI target modules, copy/adapt/delete rules.
- `03-execution-rounds.md`: the ordered implementation rounds for Cursor Claude Opus 4.6 thinking Max or future Codex sessions.
- `04-verification-and-handoff.md`: global verification matrix, per-round prompt template, commit rules, and handoff protocol.
- `rounds/`: one self-contained handoff `.md` per round, designed for direct Cursor/Opus execution.

## Execution Rule

Execute exactly one round handoff file at a time from `rounds/`. A round is not complete until:

1. Its targeted tests exist and pass.
2. `npm run build` passes.
3. `git diff --check` is clean or only reports pre-existing line-ending warnings.
4. The forbidden-port scan is reviewed.
5. The round is committed locally.

Do not push, merge, or publish releases unless the user explicitly asks for that action in the active session.

## Status

Round 0–18 completed locally on branch `codex/ai-cli-claude-port` (2026-06-14).

- Final audit commit: `7a328e5` — `chore(ai): complete claude parity v2 audit`
- Package version at completion: `0.6.15`
- Untracked at audit time: `AGENTS.md`, `tmp_input.txt` (do not commit temp files)
