# Repository Development Handbook

Date: 2026-04-27

## Purpose

This handbook summarizes how to conduct development in this repository. The repo
is a Bun-first TypeScript CLI for `@shareai-lab/kode`. Development runs directly
from source with Bun, while npm distribution builds a Node-compatible runtime and
generated CLI shims.

## Quick Start

Install dependencies:

```bash
bun install
```

For safer installs while auditing, disable install-time native binary download:

```bash
KODE_SKIP_BINARY_DOWNLOAD=1 bun install
```

Run the CLI in development mode:

```bash
bun run dev
```

Common smoke checks:

```bash
bun run dev -- --help
bun run dev -- -p "test prompt"
```

## Required Gates

Before considering work complete, run:

```bash
bun run typecheck
bun run lint
bun test
bun run build:npm
```

If a legacy/reference repo is available, also run:

```bash
KODE_REFERENCE_REPO=/path/to/legacy-kode-cli bun run parity:reference
```

## Important Commands

```bash
# Development
bun run dev

# Build npm runtime distribution
bun run build:npm
bun run build

# Clean generated artifacts
bun run clean

# Tests
bun test
bun test tests/unit
bun test tests/integration
bun test tests/e2e

# Type/lint/format
bun run typecheck
bun run lint
bun run lint:fix
bun run format
bun run format:check
```

## Repository Map

- `src/entrypoints/`: CLI, ACP, and MCP entrypoints.
- `src/entrypoints/cli/runCli.tsx`: main CLI argument parsing and runtime setup.
- `src/app/`: conversation and query orchestration.
- `src/core/`: core abstractions, permissions, tools, config primitives, cost tracking.
- `src/services/`: AI providers, MCP, plugins, auth, telemetry, context, UI services.
- `src/tools/`: agent-callable tools such as Bash, file tools, grep, web, MCP, todo, and task.
- `src/commands/`: slash commands and CLI command helpers.
- `src/ui/`: Ink terminal UI screens, components, and hooks.
- `src/utils/`: shared implementation utilities grouped by domain.
- `tests/`: unit, integration, e2e, and production-gated tests.
- `scripts/`: build, clean, publish, binary, postinstall, and parity scripts.
- `docs/develop/`: developer-oriented documentation. Treat source and tests as authoritative when docs diverge.

## Main Runtime Flow

1. `src/entrypoints/cli.tsx` initializes runtime concerns and calls `runCli()`.
2. `src/entrypoints/cli/runCli.tsx` initializes config/debug logging, parses CLI flags, handles stdin, and sets up plugins, MCP, commands, tools, and session state.
3. Print mode routes through non-interactive execution.
4. Interactive mode routes into the Ink terminal UI.
5. Conversation logic uses `src/app/` and the tool registry.
6. Tools execute through the permission and sandbox layers.

## Tool System

Tools are the primary extension point. The tool interface lives in:

```text
src/core/tools/tool.ts
```

Built-in tools are registered in:

```text
src/tools/index.ts
```

When adding or changing a tool:

1. Add the implementation under the appropriate `src/tools/<domain>/` directory.
2. Define a Zod `inputSchema`.
3. Implement permission behavior with `needsPermissions`, `isReadOnly`, and `isConcurrencySafe`.
4. Implement `call` as an async generator that yields progress/result events.
5. Implement assistant/user-facing render methods.
6. Register the tool in `src/tools/index.ts`.
7. Add focused tests under `tests/unit`.

## Feature Development Guidance

### CLI Flags And Protocols

External behavior is compatibility-sensitive. Be careful when editing:

```text
src/entrypoints/cli/runCli.tsx
src/entrypoints/cli/stdio/
src/acp/
src/utils/protocol/
```

Do not casually change CLI flags, stdout/stderr output, stream-json behavior,
session protocols, ACP, or MCP behavior.

### AI Providers And Models

Start with:

```text
src/services/ai/
src/services/ai/adapters/
src/utils/model/
src/constants/models.ts
src/constants/modelCapabilities.ts
```

Adapter changes need focused tests because regressions commonly appear as request,
streaming, or tool-call protocol mismatches.

### Permissions And Sandbox

Start with:

```text
src/core/permissions/
src/utils/permissions/
src/utils/sandbox/
src/tools/system/BashTool/
```

This area is security-sensitive. Test safe mode, bypass mode, file writes, Bash
rules, destructive command guards, and sandbox behavior.

### Plugins, Skills, Hooks, And MCP

Start with:

```text
src/services/plugins/
src/utils/session/kodeHooks.ts
src/services/mcp/
src/tools/mcp/
```

Treat plugins, hooks, custom commands, and MCP configs as trusted-code boundaries.
Review `repo-security-scan.md` before enabling untrusted extensions.

### UI Work

Start with:

```text
src/ui/screens/
src/ui/components/
src/ui/hooks/
```

The UI is terminal-native React via Ink. Preserve existing keyboard behavior and
message rendering conventions.

## Testing Strategy

Use the narrowest relevant test first, then run the full gate.

Test categories:

- `tests/unit`: fast behavior and regression tests.
- `tests/integration`: CLI and protocol flows.
- `tests/e2e`: terminal/UI smoke paths.
- `tests/integration/production`: real API tests, skipped unless explicitly enabled.

Production API tests rely on environment variables described in `.env.example`.
Do not commit real `.env` files.

Useful test commands:

```bash
bun test tests/unit
bun test tests/unit/some-file.test.ts
bun test tests/integration
bun test tests/e2e
```

## Build And Distribution

The npm build is implemented in:

```text
scripts/build.mjs
```

It bundles the runtime, writes `dist/index.js`, copies `yoga.wasm`, and generates
root CLI wrappers:

```text
cli.js
cli-acp.js
```

Generated artifacts should not be hand-edited unless the source wrapper scripts
are being changed.

## Style And Code Standards

Formatting is controlled by `.prettierrc`:

- No semicolons.
- 2-space indentation.
- Single quotes.
- Print width 80.

TypeScript aliases and compiler settings live in `tsconfig.json`.

Important constraints:

- Do not change external CLI behavior, flags, output, or protocols unless that is the explicit task.
- Keep `src/core/` independent from `src/ui/`.
- Prefer existing path aliases and architecture.
- Add tests for new behavior.
- Do not rely on Bun-only APIs in Node-distributed runtime code unless the usage is isolated and intentional.

## Safe Development Checklist

Before running Kode in a repository, inspect local automation/config files:

```bash
find . -maxdepth 3 \( -name ".mcp.json" -o -name ".mcprc" -o -path "./.kode/*" -o -path "./.claude/*" \) -print
```

Prefer safe mode for normal development:

```bash
kode --safe
```

Treat these as trust boundaries:

- Installed plugins.
- Hook definitions.
- Custom commands.
- MCP server configs.
- Model provider endpoints.
- Project instruction files.

## Local Notes

At the time this handbook was created, `bun.lock` already had an unrelated local
change adding:

```diff
+  "configVersion": 0,
```

This handbook did not modify `bun.lock`.

