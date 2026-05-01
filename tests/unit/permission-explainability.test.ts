import { beforeEach, describe, expect, test } from 'bun:test'
import {
  applyToolPermissionContextUpdate,
  createDefaultToolPermissionContext,
} from '@kode-types/toolPermissionContext'
import { explainPermissionDecision } from '@permissions'
import { BashTool } from '@tools/BashTool/BashTool'
import { FileReadTool } from '@tools/FileReadTool/FileReadTool'
import { SkillTool } from '@tools/ai/SkillTool/SkillTool'
import { WebFetchTool } from '@tools/network/WebFetchTool/WebFetchTool'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from '@utils/config'

function makeContext(overrides?: any) {
  return {
    abortController: new AbortController(),
    messageId: 'test',
    readFileTimestamps: {},
    options: {
      commands: [],
      tools: [],
      verbose: false,
      safeMode: false,
      forkNumber: 0,
      messageLogName: 'test',
      maxThinkingTokens: 0,
      permissionMode: 'default',
      ...(overrides?.options ?? {}),
    },
    ...overrides,
  } as any
}

describe('permission explainability', () => {
  beforeEach(() => {
    const current = getCurrentProjectConfig()
    saveCurrentProjectConfig({
      ...current,
      allowedTools: [],
      deniedTools: [],
      askedTools: [],
    })
  })

  test('explains project-config deny rules', async () => {
    const current = getCurrentProjectConfig()
    saveCurrentProjectConfig({
      ...current,
      deniedTools: ['Bash(echo hi)'],
    } as any)

    const explanation = await explainPermissionDecision(
      BashTool as any,
      { command: 'echo hi' },
      makeContext(),
    )

    expect(explanation).toMatchObject({
      toolName: 'Bash',
      behavior: 'deny',
      allowed: false,
      matchedRule: 'Bash(echo hi)',
      ruleSource: 'projectConfig',
    })
  })

  test('explains command-scoped allow rules', async () => {
    const explanation = await explainPermissionDecision(
      SkillTool as any,
      { skill: 'plugin:pdf' },
      makeContext({
        options: {
          commandAllowedTools: ['Skill(plugin:*)'],
        },
      }),
    )

    expect(explanation).toMatchObject({
      behavior: 'allow',
      allowed: true,
      matchedRule: 'Skill(plugin:*)',
      ruleSource: 'command',
    })
  })

  test('explains session-context wildcard web rules', async () => {
    let toolPermissionContext = createDefaultToolPermissionContext()
    toolPermissionContext = applyToolPermissionContextUpdate(
      toolPermissionContext,
      {
        type: 'addRules',
        destination: 'session',
        behavior: 'allow',
        rules: ['WebFetch(domain:*.example.com)'],
      },
    )

    const explanation = await explainPermissionDecision(
      WebFetchTool as any,
      { url: 'https://api.example.com', prompt: '' },
      makeContext({ options: { toolPermissionContext } }),
    )

    expect(explanation).toMatchObject({
      behavior: 'allow',
      matchedRule: 'WebFetch(domain:*.example.com)',
      ruleSource: 'session',
    })
  })

  test('includes suggested rules for promptable file reads', async () => {
    const explanation = await explainPermissionDecision(
      FileReadTool as any,
      { file_path: '/tmp/kode-permission-explainability.txt' },
      makeContext(),
    )

    expect(explanation.behavior).toBe('ask')
    expect(explanation.allowed).toBe(false)
    expect(explanation.suggestedRules.length).toBeGreaterThan(0)
    expect(explanation.reason).toContain('requested permissions')
  })
})
