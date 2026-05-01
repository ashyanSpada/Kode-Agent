import { describe, expect, test } from 'bun:test'
import {
  buildCapabilityRegistry,
  getSlashCommandNames,
  getSlashInvocableCapabilities,
  getToolCapabilityNames,
} from '@utils/capabilities/registry'

describe('capability registry', () => {
  test('normalizes tools, MCP tools, slash commands, skills, and agents', () => {
    const readTool = {
      name: 'Read',
      userFacingName: () => 'Read',
      isReadOnly: () => true,
    } as any
    const mcpTool = {
      name: 'mcp__github__get_issue',
      userFacingName: () => 'GitHub - get_issue (MCP)',
      isReadOnly: () => false,
    } as any
    const slashCommand = {
      type: 'prompt',
      name: 'review-pr',
      description: 'Review a PR',
      isHidden: false,
      aliases: ['rp'],
      argumentHint: '<number>',
      userFacingName: () => 'review-pr',
    } as any
    const hiddenSkill = {
      type: 'prompt',
      name: 'pdf',
      description: 'Read PDFs',
      isHidden: true,
      isSkill: true,
      allowedTools: ['Read(~/**)'],
      filePath: '/tmp/pdf/SKILL.md',
      userFacingName: () => 'pdf',
    } as any
    const hiddenCommand = {
      type: 'local',
      name: 'internal',
      description: 'Internal only',
      isHidden: true,
      userFacingName: () => 'internal',
    } as any
    const agent = {
      agentType: 'explorer',
      whenToUse: 'Explore code',
      tools: ['Read', 'Grep'],
      source: 'built-in',
      location: 'built-in',
      skills: ['pdf'],
    } as any

    const registry = buildCapabilityRegistry({
      tools: [readTool, mcpTool],
      commands: [slashCommand, hiddenSkill, hiddenCommand],
      agents: [agent],
    })

    expect(registry.tools.map(tool => tool.name)).toEqual([
      'Read',
      'mcp__github__get_issue',
    ])
    expect(registry.mcpTools).toEqual([
      {
        kind: 'mcp-tool',
        server: 'github',
        name: 'get_issue',
        toolName: 'mcp__github__get_issue',
        permissionKey: 'mcp__github__get_issue',
        readOnly: false,
      },
    ])
    expect(registry.slashCommands.map(command => command.name)).toEqual([
      'review-pr',
      'internal',
    ])
    expect(registry.slashCommands.map(command => command.slashInvocable)).toEqual(
      [true, false],
    )
    expect(registry.skills).toMatchObject([
      {
        kind: 'skill',
        name: 'pdf',
        filePath: '/tmp/pdf/SKILL.md',
        allowedTools: ['Read(~/**)'],
        slashInvocable: true,
      },
    ])
    expect(registry.agents).toMatchObject([
      {
        kind: 'agent',
        name: 'explorer',
        tools: ['Read', 'Grep'],
        skills: ['pdf'],
      },
    ])
  })

  test('exposes one source for slash-invocable command names', () => {
    const commands = [
      {
        type: 'prompt',
        name: 'review-pr',
        description: 'Review a PR',
        isHidden: false,
        userFacingName: () => 'review-pr',
      },
      {
        type: 'prompt',
        name: 'pdf',
        description: 'PDF skill',
        isHidden: true,
        isSkill: true,
        userFacingName: () => 'pdf',
      },
      {
        type: 'local',
        name: 'internal',
        description: 'Internal only',
        isHidden: true,
        userFacingName: () => 'internal',
      },
    ] as any[]

    expect(getSlashCommandNames(commands)).toEqual(['/review-pr', '/pdf'])
    expect(getSlashInvocableCapabilities(commands).map(c => c.name)).toEqual([
      'review-pr',
      'pdf',
    ])
  })

  test('exposes one source for stream-json tool names', () => {
    const tools = [
      {
        name: 'Read',
        userFacingName: () => 'Read',
        isReadOnly: () => true,
      },
      {
        name: 'mcp__github__get_issue',
        userFacingName: () => 'GitHub - get_issue (MCP)',
        isReadOnly: () => false,
      },
    ] as any[]

    expect(getToolCapabilityNames(tools)).toEqual([
      'Read',
      'mcp__github__get_issue',
    ])
  })
})
