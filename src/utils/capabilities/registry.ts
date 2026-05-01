import { isSlashInvocableCommand, type Command } from '@commands'
import type { Tool } from '@tool'
import type { AgentConfig } from '@utils/agent/loader'

export type ToolCapability = {
  kind: 'tool'
  name: string
  userFacingName: string
  permissionKey: string
  readOnly: boolean
}

export type SlashCommandCapability = {
  kind: 'slash-command'
  name: string
  description: string
  hidden: boolean
  aliases: string[]
  argumentHint?: string
  slashInvocable: boolean
}

export type SkillCapability = {
  kind: 'skill'
  name: string
  description: string
  filePath?: string
  allowedTools?: string[]
  model?: string
  slashInvocable: boolean
}

export type McpToolCapability = {
  kind: 'mcp-tool'
  server: string
  name: string
  toolName: string
  permissionKey: string
  readOnly: boolean
}

export type AgentCapability = {
  kind: 'agent'
  name: string
  description: string
  tools: string[] | '*'
  source: AgentConfig['source']
  location: AgentConfig['location']
  skills?: string[]
}

export type Capability =
  | ToolCapability
  | SlashCommandCapability
  | SkillCapability
  | McpToolCapability
  | AgentCapability

export type CapabilityRegistry = {
  capabilities: Capability[]
  tools: ToolCapability[]
  slashCommands: SlashCommandCapability[]
  skills: SkillCapability[]
  mcpTools: McpToolCapability[]
  agents: AgentCapability[]
}

export function buildCapabilityRegistry(args: {
  tools?: Tool[]
  commands?: Command[]
  agents?: AgentConfig[]
}): CapabilityRegistry {
  const tools = buildToolCapabilities(args.tools ?? [])
  const mcpTools = buildMcpToolCapabilities(args.tools ?? [])
  const commandCapabilities = buildCommandCapabilities(args.commands ?? [])
  const agents = buildAgentCapabilities(args.agents ?? [])
  const slashCommands = commandCapabilities.filter(
    (capability): capability is SlashCommandCapability =>
      capability.kind === 'slash-command',
  )
  const skills = commandCapabilities.filter(
    (capability): capability is SkillCapability => capability.kind === 'skill',
  )

  return {
    capabilities: [...tools, ...mcpTools, ...slashCommands, ...skills, ...agents],
    tools,
    slashCommands,
    skills,
    mcpTools,
    agents,
  }
}

export function buildToolCapabilities(tools: Tool[]): ToolCapability[] {
  return tools.map(tool => ({
    kind: 'tool',
    name: tool.name,
    userFacingName: tool.userFacingName(),
    permissionKey: tool.name,
    readOnly: tool.isReadOnly(),
  }))
}

export function buildMcpToolCapabilities(tools: Tool[]): McpToolCapability[] {
  return tools
    .map(tool => {
      const parsed = parseMcpToolName(tool.name)
      if (!parsed) return null
      return {
        kind: 'mcp-tool' as const,
        server: parsed.server,
        name: parsed.name,
        toolName: tool.name,
        permissionKey: tool.name,
        readOnly: tool.isReadOnly(),
      }
    })
    .filter((capability): capability is McpToolCapability => capability !== null)
}

export function buildCommandCapabilities(
  commands: Command[],
): Array<SlashCommandCapability | SkillCapability> {
  return commands.map(command => {
    const slashInvocable = isSlashInvocableCommand(command)
    if ((command as any).isSkill === true) {
      const allowedTools = Array.isArray((command as any).allowedTools)
        ? ((command as any).allowedTools as string[])
        : undefined
      const model =
        typeof (command as any).model === 'string'
          ? ((command as any).model as string)
          : undefined
      const filePath =
        typeof (command as any).filePath === 'string'
          ? ((command as any).filePath as string)
          : undefined
      return {
        kind: 'skill' as const,
        name: command.userFacingName(),
        description: command.description,
        ...(filePath ? { filePath } : {}),
        ...(allowedTools ? { allowedTools } : {}),
        ...(model ? { model } : {}),
        slashInvocable,
      }
    }

    return {
      kind: 'slash-command' as const,
      name: command.userFacingName(),
      description: command.description,
      hidden: command.isHidden,
      aliases: command.aliases ?? [],
      ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
      slashInvocable,
    }
  })
}

export function buildAgentCapabilities(
  agents: AgentConfig[],
): AgentCapability[] {
  return agents.map(agent => ({
    kind: 'agent',
    name: agent.agentType,
    description: agent.whenToUse,
    tools: agent.tools,
    source: agent.source,
    location: agent.location,
    ...(agent.skills ? { skills: agent.skills } : {}),
  }))
}

export function getSlashInvocableCapabilities(
  commands: Command[],
): Array<SlashCommandCapability | SkillCapability> {
  return buildCommandCapabilities(commands).filter(
    capability => capability.slashInvocable,
  )
}

export function getSlashCommandNames(commands: Command[]): string[] {
  return getSlashInvocableCapabilities(commands).map(
    capability => `/${capability.name}`,
  )
}

export function getToolCapabilityNames(tools: Tool[]): string[] {
  return buildToolCapabilities(tools).map(capability => capability.name)
}

function parseMcpToolName(
  toolName: string,
): { server: string; name: string } | null {
  const match = /^mcp__(.+)__(.+)$/.exec(toolName)
  if (!match) return null
  return { server: match[1]!, name: match[2]! }
}
