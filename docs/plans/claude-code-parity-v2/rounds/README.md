# Per-Round Cursor Handoff Index

Each file in this folder is a self-contained handoff for Cursor Claude Opus 4.6 thinking Max or another agentic worker.

Use exactly one file per AI interaction. Do not ask the worker to execute multiple round files unless the user explicitly approves batching.

## Status

All round handoffs 00–18 are complete on branch `codex/ai-cli-claude-port` (2026-06-14). Final audit commit: `7a328e5`.

## Common Rule

Every round must:

- Read `AGENTS.md`.
- Read `docs/plans/claude-code-parity-v2/README.md`.
- Read `docs/plans/claude-code-parity-v2/00-global-spec.md`.
- Read `docs/plans/claude-code-parity-v2/01-current-state-and-gap-audit.md`.
- Read `docs/plans/claude-code-parity-v2/02-claude-source-transplant-map.md`.
- Read this round's handoff file.
- Read the Claude Code source files listed in the round.
- Preserve UTF-8 Chinese text.
- Avoid login, telemetry, account, billing, entitlement, remote bridge, and Anthropic internal code.
- Write or update focused tests before implementation.
- Run the round verification commands.
- Commit locally at the end of the round.

## Round Files

- `round-00-planning-pack-checkpoint.md`
- `round-01-slash-command-registry-and-menu-parity.md`
- `round-02-path-completion-and-unified-suggestions.md`
- `round-03-utf8-and-terminal-glyph-repair.md`
- `round-04-permission-dialog-deep-port.md`
- `round-05-file-diff-and-edit-permission-ux.md`
- `round-06-shell-and-powershell-safety-port.md`
- `round-07-interrupt-and-exit-parity.md`
- `round-08-query-engine-and-tool-pairing-discipline.md`
- `round-09-plan-mode-approval-lifecycle.md`
- `round-10-skills-runtime-split-and-search.md`
- `round-11-agent-definitions-and-memory-snapshot.md`
- `round-12-subagent-activity-timeline-and-scheduling.md`
- `round-13-model-settings-metadata.md`
- `round-14-terminal-ui-visual-parity.md`
- `round-15-desktop-command-dashboard-hardening.md`
- `round-16-desktop-visual-parity-and-ai-bridge.md`
- `round-17-github-release-workflow-and-asset-verification.md`
- `round-18-final-forbidden-port-audit-and-release-readiness.md`
