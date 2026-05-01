import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Command } from '@commands'
import type { Message } from '@query'
import { createUserMessage } from '@utils/messages'

export type ResolvedPromptCommand = Extract<Command, { type: 'prompt' }>

export type PromptCommandContextValues = {
  allowedTools: string[]
  model?: string
  maxThinkingTokens?: number
}

type ExpandPromptCommandOptions = {
  commandArgs: string
  includeMetadata?: boolean
}

export function normalizePromptCommandName(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
}

export function parseSlashPromptCommand(
  command: string,
): { commandName: string; args: string } | null {
  const trimmed = command.trim()
  if (!trimmed.startsWith('/')) return null
  const withoutSlash = trimmed.slice(1)
  const spaceIdx = withoutSlash.indexOf(' ')
  const commandName =
    spaceIdx === -1
      ? withoutSlash.trim()
      : withoutSlash.slice(0, spaceIdx).trim()
  if (!commandName) return null
  const args = spaceIdx === -1 ? '' : withoutSlash.slice(spaceIdx + 1).trim()
  return { commandName, args }
}

export function resolveSkillCommand(
  name: string,
  commands: Command[],
): Command | null {
  const commandName = normalizePromptCommandName(name)
  return (
    commands.find(
      command =>
        command.name === commandName ||
        command.userFacingName?.() === commandName ||
        command.aliases?.includes(commandName),
    ) ?? null
  )
}

export async function expandPromptCommand(
  command: ResolvedPromptCommand,
  args: string,
  options: ExpandPromptCommandOptions,
): Promise<Message[]> {
  const prompt = await command.getPromptForCommand(args)
  const expandedMessages = prompt.map(msg =>
    promptMessageToUserMessage(msg, command, options.commandArgs),
  )

  if (!options.includeMetadata) return expandedMessages

  const commandNameForMeta = command.userFacingName()
  const progressMessage = (command as any).progressMessage || 'running'
  const metaMessage =
    createUserMessage(`<command-name>${commandNameForMeta}</command-name>
<command-message>${commandNameForMeta} is ${progressMessage}…</command-message>
<command-args>${args}</command-args>`)

  return [metaMessage, ...expandedMessages]
}

export function getPromptCommandContextValues(
  command: Command,
): PromptCommandContextValues {
  const allowedTools = Array.isArray((command as any).allowedTools)
    ? (command as any).allowedTools
    : []
  const model = normalizeCommandModelName((command as any).model)
  const maxThinkingTokens =
    typeof (command as any).maxThinkingTokens === 'number'
      ? (command as any).maxThinkingTokens
      : undefined

  return { allowedTools, model, maxThinkingTokens }
}

export function applyCommandContextModifier(values: PromptCommandContextValues) {
  const { allowedTools, model, maxThinkingTokens } = values
  if (
    allowedTools.length === 0 &&
    !model &&
    maxThinkingTokens === undefined
  ) {
    return undefined
  }

  return {
    modifyContext(ctx: any) {
      const next = { ...ctx }

      if (allowedTools.length > 0) {
        const prev = Array.isArray((next.options as any)?.commandAllowedTools)
          ? ((next.options as any).commandAllowedTools as string[])
          : []
        next.options = {
          ...(next.options || {}),
          commandAllowedTools: [...new Set([...prev, ...allowedTools])],
        }
      }

      if (model) {
        next.options = { ...(next.options || {}), model }
      }

      if (maxThinkingTokens !== undefined) {
        next.options = {
          ...(next.options || {}),
          maxThinkingTokens,
        }
      }

      return next
    },
  }
}

function promptMessageToUserMessage(
  msg: MessageParam,
  command: ResolvedPromptCommand,
  commandArgs: string,
): Message {
  const userMessage = createUserMessage(messageParamContentToText(msg))
  userMessage.options = {
    ...userMessage.options,
    isCustomCommand: true,
    commandName: command.userFacingName(),
    commandArgs,
  }
  return userMessage
}

function messageParamContentToText(msg: MessageParam): string {
  if (typeof msg.content === 'string') return msg.content
  return msg.content
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('\n')
}

function normalizeCommandModelName(model: unknown): string | undefined {
  if (typeof model !== 'string') return undefined
  const trimmed = model.trim()
  if (!trimmed || trimmed === 'inherit') return undefined
  if (trimmed === 'haiku') return 'quick'
  if (trimmed === 'sonnet') return 'task'
  if (trimmed === 'opus') return 'main'
  return trimmed
}
