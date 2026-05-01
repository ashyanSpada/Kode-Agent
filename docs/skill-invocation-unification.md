# Skill Invocation Unification

This note documents the shared execution path for prompt-based skills and custom slash commands.

## What Changed

`SkillTool` and `SlashCommandTool` used to duplicate the same behavior:

- find a command by name, user-facing name, or alias
- expand the command prompt into conversation messages
- apply command-scoped `allowedTools`
- normalize command `model` aliases
- apply `maxThinkingTokens`
- create slash command metadata messages

That shared behavior now lives in:

```text
src/utils/commands/promptCommandInvocation.ts
```

The tool implementations still keep their own validation messages and assistant-facing result text, but the execution mechanics are shared so Skill and slash behavior cannot drift.

## Shared Helpers

The shared module exposes these helpers:

```ts
normalizePromptCommandName(raw)
parseSlashPromptCommand(command)
resolveSkillCommand(name, commands)
expandPromptCommand(command, args, options)
getPromptCommandContextValues(command)
applyCommandContextModifier(values)
```

`resolveSkillCommand` is intentionally used by both Skill and slash invocations. It matches:

- `command.name`
- `command.userFacingName()`
- `command.aliases`

## Example: Skill Tool Invocation

When the LLM calls:

```json
{
  "skill": "pdf",
  "args": "summarize docs/report.pdf"
}
```

`SkillTool` now does this:

```ts
const skillName = normalizePromptCommandName(skill)
const cmd = resolveSkillCommand(skillName, commands)
const newMessages = await expandPromptCommand(cmd, args ?? '', {
  commandArgs: '',
})
const commandContext = getPromptCommandContextValues(cmd)
const contextModifier = applyCommandContextModifier(commandContext)
```

The expanded prompt messages are marked as custom command messages:

```ts
message.options = {
  isCustomCommand: true,
  commandName: 'pdf',
  commandArgs: '',
}
```

Skill invocations intentionally keep `commandArgs` empty for compatibility with the existing Skill tool behavior.

## Example: Slash Command Invocation

When the LLM calls:

```json
{
  "command": "/review-pr 123"
}
```

`SlashCommandTool` now does this:

```ts
const parsed = parseSlashPromptCommand(command)
const cmd = resolveSkillCommand(parsed.commandName, commands)
const newMessages = await expandPromptCommand(cmd, parsed.args, {
  commandArgs: parsed.args,
  includeMetadata: true,
})
const commandContext = getPromptCommandContextValues(cmd)
const contextModifier = applyCommandContextModifier(commandContext)
```

Slash command invocations include a metadata message before the expanded prompt:

```xml
<command-name>review-pr</command-name>
<command-message>review-pr is running…</command-message>
<command-args>123</command-args>
```

The expanded prompt message keeps the actual slash arguments:

```ts
message.options = {
  isCustomCommand: true,
  commandName: 'review-pr',
  commandArgs: '123',
}
```

## Example: Context Modifiers

For command frontmatter like:

```yaml
---
name: review-pr
allowed-tools:
  - Read(~/**)
  - Bash(git:*)
model: sonnet
maxThinkingTokens: 456
---
```

The shared context modifier applies:

```ts
ctx.options.commandAllowedTools = [
  ...previousAllowedTools,
  'Read(~/**)',
  'Bash(git:*)',
]
ctx.options.model = 'task'
ctx.options.maxThinkingTokens = 456
```

Model aliases are normalized as:

| Frontmatter | Runtime model pointer |
|-------------|-----------------------|
| `haiku` | `quick` |
| `sonnet` | `task` |
| `opus` | `main` |
| `inherit` | unchanged |

## Behavior Preserved

The refactor preserves these differences:

- `SkillTool` rejects commands with `disable-model-invocation`.
- `SlashCommandTool` rejects commands with `disable-model-invocation`.
- `SlashCommandTool` also rejects `disableNonInteractive` commands.
- `SkillTool` result text remains `Launching skill: <name>`.
- `SlashCommandTool` result text remains `Launching command: /<name>`.
- Slash invocations still include command metadata messages.
- Skill invocations do not include slash metadata messages.

## Tests

The main regression coverage is in:

```text
tests/unit/skill-slash-permission-parity.test.ts
```

The tests verify that both invocation paths share:

- model alias normalization
- `maxThinkingTokens`
- accumulated `commandAllowedTools`
- custom command message metadata
- slash command metadata messages
