# Capability Enhancement Ideas

This note captures candidate improvements for extending Kode Agent's capabilities.

## Status Summary

| Option | Enhancement | Status |
|--------|-------------|--------|
| 1 | First-Class Trace Replay | Implemented |
| 2 | Skill Invocation Unification | Implemented |
| 3 | Trace-Aware Tool Fixtures | Pending |
| 4 | Session Log Integrity Checks | Pending |
| 5 | Capability Registry | Implemented |
| 6 | Better Skill Discovery UX | Pending |
| 7 | Replay-Based Regression Tests | Pending |
| 8 | Permission Explainability | Pending |
| 9 | Agent and Skill Interop | Pending |
| 10 | Golden Protocol Tests | Pending |

## 1. First-Class Trace Replay

Status: Implemented.

Build on session JSONL persistence and sequential trace records with a deterministic replay runner:

```bash
/trace replay <session-id|latest> [--mode messages-only|stub-llm|stub-tools|full] [--json]
```

Potential replay modes:

- `messages-only`: load and validate message order only.
- `stub-llm`: replay saved assistant responses instead of calling the model.
- `stub-tools`: replay saved tool results instead of executing tools.
- `full`: stub both LLM and tools for deterministic regression tests.

This would make real sessions reusable as bug repros and test fixtures.

Implemented pieces:

- deterministic trace replay helper in `src/utils/protocol/kodeAgentTraceReplay.ts`
- interactive `/trace replay` command in `src/commands/trace.ts`
- replay modes: `messages-only`, `stub-llm`, `stub-tools`, `full`
- validation for sequence continuity, parent UUID chain, orphan tool results, unresolved tool uses, and message round trip
- `/trace replay` autocomplete for existing trace IDs and `latest`
- regression coverage in `tests/unit/trace-replay.test.ts`

## 2. Skill Invocation Unification

Status: Implemented.

Skills can be reached through the `Skill` tool and through slash-command expansion. Extract shared helpers so behavior cannot drift:

```ts
resolveSkillCommand(name, commands)
expandPromptCommand(command, args)
applyCommandContextModifier(command)
```

This should centralize handling for `allowedTools`, `model`, `maxThinkingTokens`, prompt expansion, and metadata messages.

Implemented pieces:

- shared helper module in `src/utils/commands/promptCommandInvocation.ts`
- `SkillTool` and `SlashCommandTool` now share command resolution, prompt expansion, context modifier construction, and model alias normalization
- slash command metadata messages remain slash-only
- Skill tool behavior keeps its existing assistant-facing result and compatibility metadata
- implementation notes and examples in `docs/skill-invocation-unification.md`
- parity coverage in `tests/unit/skill-slash-permission-parity.test.ts`

## 3. Trace-Aware Tool Fixtures

Status: Pending.

Add a fixture layer for replaying tool calls from traces. A fixture key could include:

- `toolName`
- normalized input
- `toolUseId`
- trace sequence number

This lets tests replay turns without touching the filesystem, shell, or network unless explicitly requested.

## 4. Session Log Integrity Checks

Status: Pending.

Add a validator command:

```bash
kode messages-debug validate <session-id>
```

Useful checks:

- monotonic `seq`
- valid `parentUuid` chain
- assistant `tool_use` has matching user `tool_result`
- no orphan tool results
- load/replay round trip succeeds

This would make session persistence safer as it becomes a central trace format.

## 5. Capability Registry

Status: Implemented.

Introduce a normalized registry for tools, slash commands, skills, MCP tools, and agents:

```ts
type Capability =
  | { kind: 'tool'; name: string; permissionKey: string; readOnly: boolean }
  | { kind: 'slash-command'; name: string; hidden: boolean }
  | { kind: 'skill'; name: string; filePath?: string; allowedTools?: string[] }
  | { kind: 'mcp-tool'; server: string; name: string }
```

Benefits:

- one source for completion
- one source for ACP available commands
- one source for stream-json init
- easier permission explanations
- better diagnostics

Implemented pieces:

- normalized registry types and builders in `src/utils/capabilities/registry.ts`
- tool, MCP tool, slash command, skill, and agent capability shapes
- slash command completion now reads slash-invocable command/skill capabilities
- ACP available commands now use the same slash-invocable capability source
- stream-json init tool and slash command lists now use capability helpers
- direct registry coverage in `tests/unit/capability-registry.test.ts`

## 6. Better Skill Discovery UX

Status: Pending.

Add explicit skill inspection commands:

```bash
kode skill list
kode skill show <name>
kode skill doctor
```

Useful output:

- source path
- description
- allowed tools
- model override
- whether callable via `/name`
- why a skill was skipped

This would make plugin and skill debugging easier.

## 7. Replay-Based Regression Tests

Status: Pending.

Add a test helper:

```ts
expectTraceReplay('fixtures/traces/file-edit.jsonl').toMatch()
```

Good targets:

- rejected tools
- partial tool JSON
- parallel tool execution
- slash command and skill expansion
- compaction
- session resume

## 8. Permission Explainability

Status: Pending.

Add an explanation API:

```ts
explainPermissionDecision(tool, input, context)
```

Return:

- matched rule
- rule source: project, user, policy, or session
- behavior: allow, ask, or deny
- reason
- suggested rule

This can improve permission prompts, logs, tests, and debugging.

## 9. Agent and Skill Interop

Status: Pending.

Allow agent definitions to declare default skill sets:

```yaml
skills:
  - pdf
  - github:review-pr
```

Then `TaskTool` agents can get scoped skills without exposing every skill in the main conversation.

## 10. Golden Protocol Tests

Status: Pending.

Add golden tests for external-facing protocol surfaces:

- ACP available commands
- stream-json init messages
- session JSONL shape
- tool result protocol
- slash skill expansion

The repo has strict parity constraints, so golden protocol tests would provide useful guardrails.
