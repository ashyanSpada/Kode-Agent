# Repository Capabilities Summary

Date: 2026-04-27

This repository provides an AI-powered terminal coding assistant CLI named
`kode`.

## User-Facing Capabilities

- Interactive terminal assistant built with React/Ink.
- Non-interactive print mode via `kode -p`.
- Codebase-aware chat using project context, git state, instruction files, and conversation history.
- File read/write/edit tools.
- Notebook read/edit tools.
- Grep, glob, and LSP-assisted search tools.
- Bash command execution with permission modes, sandbox support, destructive-command guards, and background task output.
- Multi-provider AI model support through Anthropic and OpenAI-compatible adapters.
- Responses API and Chat Completions adapter paths.
- Slash commands for config, login/logout, model selection, MCP, plugins, agents, todos, review, resume, statusline, and related workflows.
- Agent/task delegation tools.
- Expert-model consultation tools.
- MCP client integration for stdio, SSE, HTTP, and WebSocket MCP servers.
- ACP server mode via `kode-acp` or `kode --acp`.
- Plugin, skill, custom command, hook, and output-style extension systems.
- Project instruction discovery through `AGENTS.md`, `AGENTS.override.md`, and legacy `CLAUDE.md`.
- Session persistence, resume, continue, and fork-session support.
- Stream JSON and structured stdio protocol support for automation.
- Model configuration import/export and model selector UI.
- Web search and web fetch tools.
- Todo/task tracking inside agent sessions.
- Build and publish tooling for npm runtime and native binary distribution.

## Developer Capabilities

- Bun-first development workflow.
- Node-compatible npm build output.
- Unit, integration, e2e, and production-gated API tests.
- Reference parity checking via `KODE_REFERENCE_REPO`.
- CI/release workflows for npm publishing and native binary release artifacts.
- TypeScript path aliases and domain-grouped source layout.
- Custom build scripts for npm runtime, standalone binaries, cleanup, publish checks, and startup benchmarking.

## Main Extension Points

- Tools: `src/tools/` and `src/core/tools/tool.ts`.
- Slash commands: `src/commands/`.
- AI providers/adapters: `src/services/ai/`.
- MCP integration: `src/services/mcp/` and `src/tools/mcp/`.
- Plugins and skills: `src/services/plugins/`.
- Hooks: `src/utils/session/kodeHooks.ts`.
- UI: `src/ui/`.
- Configuration: `src/utils/config/` and `src/core/config/`.

