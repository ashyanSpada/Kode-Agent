# Reproduction Plan

This plan captures the minimum work needed to reproduce this repository in a clean environment while preserving behavior.

## Reproduction Identity

- Reproduction repo name: `oh-my-agent`
- Shortcut runtime command: `oma`
- Canonical compatibility command: `kode`

## Goal

Recreate the repo so that the same CLI commands, persisted session behavior, trace replay, skill invocation, permission checks, and diagnostics work the same way, while presenting the reproduction as `oh-my-agent` and exposing `oma` as the shortcut entrypoint.

## Phase 1: Baseline Setup

1. Clone or copy the repository into a fresh workspace.
2. Install dependencies with `bun install`.
3. Confirm the supported toolchain matches the repo requirements.
4. Run the current verification gates once before changing anything:
   - `bun run typecheck`
   - `bun run lint`
   - `bun test`
   - `bun run build:npm`

## Phase 2: Core CLI Surface

1. Recreate the command registry and internal command wiring.
2. Keep the existing external CLI behavior unchanged.
3. Preserve built-in command handling, slash command expansion, and custom command loading.
4. Make sure the CLI entrypoints still resolve through the same shims and build output.

## Phase 3: Persistence and Replay

1. Recreate session JSONL persistence.
2. Preserve sequential message logging for user, assistant, and tool output.
3. Recreate trace replay support with validation and deterministic replay modes.
4. Keep replay and session resume behavior covered by tests.

## Phase 4: Skills and Slash Commands

1. Recreate skill discovery from the user, project, and plugin locations.
2. Preserve slash-command-as-skill invocation.
3. Recreate `/skill` inspection commands:
   - `list`
   - `show <name>`
   - `doctor`
4. Preserve autocomplete for slash commands, skills, and trace replay identifiers.

## Phase 5: Capability and Permission Plumbing

1. Recreate the normalized capability registry for tools, slash commands, skills, MCP tools, and agents.
2. Recreate permission explanation helpers.
3. Keep permission rule matching consistent for:
   - Bash
   - file tools
   - WebFetch/WebSearch
   - Skill and slash commands
   - MCP tool names

## Phase 6: Diagnostics and Context Tools

1. Recreate `ctx-viz` as a stable context breakdown command.
2. Preserve `skill doctor` and other inspection utilities.
3. Keep the command output readable in both direct CLI use and tests.

## Phase 7: Verification

Run the full gates after each major step and again at the end:

```bash
bun run typecheck
bun run lint
bun test
bun run build:npm
```

## Files That Define The Reproduction Surface

- [src/entrypoints/cli/runCli.tsx](/Users/ashyan/Study/Kode-Agent/src/entrypoints/cli/runCli.tsx) - CLI command registration and top-level behavior
- [src/commands/index.ts](/Users/ashyan/Study/Kode-Agent/src/commands/index.ts) - built-in command registry
- [src/app/query.ts](/Users/ashyan/Study/Kode-Agent/src/app/query.ts) - message flow and session persistence
- [src/utils/protocol/kodeAgentTraceReplay.ts](/Users/ashyan/Study/Kode-Agent/src/utils/protocol/kodeAgentTraceReplay.ts) - trace replay logic
- [src/utils/capabilities/registry.ts](/Users/ashyan/Study/Kode-Agent/src/utils/capabilities/registry.ts) - normalized capability source
- [src/core/permissions/engine/index.ts](/Users/ashyan/Study/Kode-Agent/src/core/permissions/engine/index.ts) - permission evaluation
- [src/commands/skill.ts](/Users/ashyan/Study/Kode-Agent/src/commands/skill.ts) - skill inspection command
- [src/commands/ctx-viz.ts](/Users/ashyan/Study/Kode-Agent/src/commands/ctx-viz.ts) - context visualization command
