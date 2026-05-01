import { z } from 'zod'
import { FallbackToolUseRejectedMessage } from '@components/FallbackToolUseRejectedMessage'
import { Tool } from '@tool'
import * as React from 'react'
import { getCommands } from '@commands'
import {
  loadCustomCommands,
  type CustomCommandWithScope,
} from '@services/customCommands'
import { TOOL_NAME_FOR_PROMPT } from './prompt'
import {
  applyCommandContextModifier,
  expandPromptCommand,
  getPromptCommandContextValues,
  parseSlashPromptCommand,
  resolveSkillCommand,
  type ResolvedPromptCommand,
} from '@utils/commands/promptCommandInvocation'

const inputSchema = z.strictObject({
  command: z
    .string()
    .describe(
      'The slash command to execute with its arguments, e.g., "/review-pr 123"',
    ),
})

type Input = z.infer<typeof inputSchema>
type Output = {
  success: boolean
  commandName: string
}

function getCharBudget(): number {
  const raw = Number(process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET)
  return Number.isFinite(raw) && raw > 0 ? raw : 15000
}

export const SlashCommandTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description({ command }: Input) {
    return `Execute slash command: ${command}`
  },
  userFacingName() {
    return 'SlashCommand'
  },
  inputSchema,
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  async isEnabled() {
    return true
  },
  needsPermissions() {
    return true
  },
  async prompt() {
    const all = await loadCustomCommands()
    const commands = all.filter(
      cmd =>
        cmd.type === 'prompt' &&
        cmd.isSkill !== true &&
        cmd.disableModelInvocation !== true &&
        (cmd.hasUserSpecifiedDescription || cmd.whenToUse),
    )

    const limited: CustomCommandWithScope[] = []
    let used = 0
    for (const cmd of commands) {
      const name = `/${cmd.name}`
      const args = cmd.argumentHint ? ` ${cmd.argumentHint}` : ''
      const whenToUse = cmd.whenToUse ? `- ${cmd.whenToUse}` : ''
      const line = `- ${name}${args}: ${cmd.description} ${whenToUse}`.trim()
      used += line.length + 1
      if (used > getCharBudget()) break
      limited.push(cmd)
    }

    const availableLines =
      limited.length > 0
        ? limited
            .map(cmd => {
              const name = `/${cmd.name}`
              const args = cmd.argumentHint ? ` ${cmd.argumentHint}` : ''
              const whenToUse = cmd.whenToUse ? `- ${cmd.whenToUse}` : ''
              return `- ${name}${args}: ${cmd.description} ${whenToUse}`.trim()
            })
            .join('\n')
        : ''

    const truncatedNotice =
      commands.length > limited.length
        ? `\n(Showing ${limited.length} of ${commands.length} commands due to token limits)`
        : ''

    return `Execute a slash command within the main conversation

How slash commands work:
When you use this tool or when a user types a slash command, you will see <command-message>{name} is running…</command-message> followed by the expanded prompt. For example, if .claude/commands/foo.md contains "Print today's date", then /foo expands to that prompt in the next message.

Usage:
- \`command\` (required): The slash command to execute, including any arguments
- Example: \`command: "/review-pr 123"\`

IMPORTANT: Only use this tool for custom slash commands that appear in the Available Commands list below. Do NOT use for:
- Built-in CLI commands (like /help, /clear, etc.)
- Commands not shown in the list
- Commands you think might exist but aren't listed

${
  availableLines
    ? `Available Commands:
${availableLines}${truncatedNotice}
`
    : ''
}Notes:
- When a user requests multiple slash commands, execute each one sequentially and check for <command-message>{name} is running…</command-message> to verify each has been processed
- Do not invoke a command that is already running. For example, if you see <command-message>foo is running…</command-message>, do NOT use this tool with "/foo" - process the expanded prompt in the following message
- Only custom slash commands with descriptions are listed in Available Commands. If a user's command is not listed, ask them to check the slash command file and consult the docs.
`
  },
  renderToolUseMessage({ command }: Input, _options: { verbose: boolean }) {
    return command || ''
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderResultForAssistant(output: Output) {
    return `Launching command: /${output.commandName}`
  },
  async validateInput({ command }: Input, context) {
    const parsed = parseSlashPromptCommand(command)
    if (!parsed) {
      return {
        result: false,
        message: `Invalid slash command format: ${command}`,
        errorCode: 1,
      }
    }

    const commands = context?.options?.commands ?? (await getCommands())

    const cmd = resolveSkillCommand(parsed.commandName, commands)
    if (!cmd) {
      return {
        result: false,
        message: `Unknown slash command: ${parsed.commandName}`,
        errorCode: 2,
      }
    }

    if ((cmd as any).disableModelInvocation) {
      return {
        result: false,
        message: `Slash command ${parsed.commandName} cannot be used with ${TOOL_NAME_FOR_PROMPT} tool due to disable-model-invocation`,
        errorCode: 4,
      }
    }

    if ((cmd as any).disableNonInteractive) {
      return {
        result: false,
        message: `Slash command ${parsed.commandName} cannot be used with ${TOOL_NAME_FOR_PROMPT} tool because it is non-interactive`,
        errorCode: 6,
      }
    }

    if (cmd.type !== 'prompt') {
      return {
        result: false,
        message: `Slash command ${parsed.commandName} is not a prompt-based command`,
        errorCode: 5,
      }
    }

    return { result: true }
  },
  async *call({ command }: Input, context) {
    const parsed = parseSlashPromptCommand(command)
    if (!parsed) {
      throw new Error(`Invalid slash command format: ${command}`)
    }

    const commands = context.options?.commands ?? (await getCommands())
    const cmd = resolveSkillCommand(parsed.commandName, commands)
    if (!cmd) {
      throw new Error(`Unknown slash command: ${parsed.commandName}`)
    }
    if ((cmd as any).disableModelInvocation) {
      throw new Error(
        `Slash command ${parsed.commandName} cannot be used with ${TOOL_NAME_FOR_PROMPT} tool due to disable-model-invocation`,
      )
    }
    if ((cmd as any).disableNonInteractive) {
      throw new Error(
        `Slash command ${parsed.commandName} cannot be used with ${TOOL_NAME_FOR_PROMPT} tool because it is non-interactive`,
      )
    }
    if (cmd.type !== 'prompt') {
      throw new Error(
        `Unexpected ${cmd.type} command. Expected 'prompt' command. Use /${parsed.commandName} directly in the main conversation.`,
      )
    }

    const newMessages = await expandPromptCommand(
      cmd as ResolvedPromptCommand,
      parsed.args,
      { commandArgs: parsed.args, includeMetadata: true },
    )
    const commandContext = getPromptCommandContextValues(cmd)

    const output: Output = { success: true, commandName: parsed.commandName }

    yield {
      type: 'result' as const,
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
      newMessages,
      contextModifier: applyCommandContextModifier(commandContext),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
