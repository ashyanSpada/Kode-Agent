import type { Command } from '@commands'
import { getSlashInvocableCapabilities } from '@utils/capabilities/registry'
import type { UnifiedSuggestion } from './types'

export function generateSlashCommandSuggestions(args: {
  commands: Command[]
  prefix: string
}): UnifiedSuggestion[] {
  const { commands, prefix } = args
  const filteredCommands = getSlashInvocableCapabilities(commands)

  if (!prefix) {
    return filteredCommands.map(cmd => ({
      value: cmd.name,
      displayValue: `/${cmd.name}`,
      type: 'command' as const,
      score: 100,
    }))
  }

  return filteredCommands
    .filter(cmd => {
      const names = [
        cmd.name,
        ...(cmd.kind === 'slash-command' ? cmd.aliases : []),
      ]
      return names.some(name =>
        name.toLowerCase().startsWith(prefix.toLowerCase()),
      )
    })
    .map(cmd => ({
      value: cmd.name,
      displayValue: `/${cmd.name}`,
      type: 'command' as const,
      score: 100 - prefix.length + (cmd.name.startsWith(prefix) ? 10 : 0),
    }))
}
