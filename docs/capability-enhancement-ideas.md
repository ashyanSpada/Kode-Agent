# Capability Enhancement Ideas

This note captures candidate improvements for extending Kode Agent's capabilities. These are not implementation commitments; they are reviewable ideas to apply later.

## 1. First-Class Trace Replay

Build on session JSONL persistence and sequential trace records with a deterministic replay runner:

```bash
kode trace replay <session-id>
```

Potential replay modes:

- `messages-only`: load and validate message order only.
- `stub-llm`: replay saved assistant responses instead of calling the model.
- `stub-tools`: replay saved tool results instead of executing tools.
- `full`: stub both LLM and tools for deterministic regression tests.

This would make real sessions reusable as bug repros and test fixtures.

## 2. Skill Invocation Unification

Skills can be reached through the `Skill` tool and through slash-command expansion. Extract shared helpers so behavior cannot drift:

```ts
resolveSkillCommand(name, commands)
expandPromptCommand(command, args)
applyCommandContextModifier(command)
```

This should centralize handling for `allowedTools`, `model`, `maxThinkingTokens`, prompt expansion, and metadata messages.

## 3. Trace-Aware Tool Fixtures

Add a fixture layer for replaying tool calls from traces. A fixture key could include:

- `toolName`
- normalized input
- `toolUseId`
- trace sequence number

This lets tests replay turns without touching the filesystem, shell, or network unless explicitly requested.

## 4. Session Log Integrity Checks

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

## 6. Better Skill Discovery UX

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

Allow agent definitions to declare default skill sets:

```yaml
skills:
  - pdf
  - github:review-pr
```

Then `TaskTool` agents can get scoped skills without exposing every skill in the main conversation.

## 10. Golden Protocol Tests

Add golden tests for external-facing protocol surfaces:

- ACP available commands
- stream-json init messages
- session JSONL shape
- tool result protocol
- slash skill expansion

The repo has strict parity constraints, so golden protocol tests would provide useful guardrails.
