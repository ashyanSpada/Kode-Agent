import type { Tool, ToolUseContext } from '@tool'
import { BashTool } from '@tools/BashTool/BashTool'
import { SlashCommandTool } from '@tools/interaction/SlashCommandTool/SlashCommandTool'
import { SkillTool } from '@tools/ai/SkillTool/SkillTool'
import { WebFetchTool } from '@tools/network/WebFetchTool/WebFetchTool'
import { WebSearchTool } from '@tools/network/WebSearchTool/WebSearchTool'
import { getCurrentProjectConfig } from '@utils/config'
import { getPermissionMode } from '@utils/permissions/permissionModeState'
import { getPermissionKey } from './rules'
import { hasPermissionsToUseTool } from './engine'
import type {
  ToolPermissionContext,
  ToolPermissionContextUpdate,
  ToolPermissionUpdateDestination,
} from '@kode-types/toolPermissionContext'
import { parseMcpToolName } from '@utils/permissions/ruleString'
import { minimatch } from 'minimatch'

export type PermissionExplanationBehavior = 'allow' | 'ask' | 'deny'

export type PermissionExplanation = {
  toolName: string
  behavior: PermissionExplanationBehavior
  allowed: boolean
  matchedRule?: string
  ruleSource?: ToolPermissionUpdateDestination | 'projectConfig' | 'command'
  reason: string
  suggestedRules: string[]
  permissionMode: string
}

type RuleCandidate = {
  rule: string
  source: PermissionExplanation['ruleSource']
  behavior: PermissionExplanationBehavior
}

export async function explainPermissionDecision(
  tool: Tool,
  input: { [k: string]: unknown },
  context: ToolUseContext,
  assistantMessage?: unknown,
): Promise<PermissionExplanation> {
  const result = await hasPermissionsToUseTool(
    tool,
    input,
    context,
    assistantMessage as never,
  )
  const behavior = result.result
    ? 'allow'
    : (result as { shouldPromptUser?: boolean }).shouldPromptUser === false
      ? 'deny'
      : 'ask'
  const candidates = collectRuleCandidates(context)
  const matched = findMatchingRule({
    tool,
    input,
    candidates: candidates.filter(candidate => candidate.behavior === behavior),
  })
  const permissionMode = getPermissionMode(context)

  return {
    toolName: tool.name,
    behavior,
    allowed: result.result === true,
    ...(matched ? { matchedRule: matched.rule, ruleSource: matched.source } : {}),
    reason: reasonForDecision({
      tool,
      input,
      result,
      behavior,
      matched,
      permissionMode,
    }),
    suggestedRules:
      result.result === true
        ? []
        : extractSuggestedRules((result as any).suggestions) ??
          fallbackSuggestedRules(tool, input),
    permissionMode,
  }
}

function collectRuleCandidates(context: ToolUseContext): RuleCandidate[] {
  const toolPermissionContext = context.options?.toolPermissionContext
  const commandAllowedTools = Array.isArray(context.options?.commandAllowedTools)
    ? context.options.commandAllowedTools
    : []
  const out: RuleCandidate[] = [
    ...commandAllowedTools.map(rule => ({
      rule,
      source: 'command' as const,
      behavior: 'allow' as const,
    })),
  ]

  if (toolPermissionContext) {
    out.push(...rulesFromContext(toolPermissionContext, 'allow'))
    out.push(...rulesFromContext(toolPermissionContext, 'deny'))
    out.push(...rulesFromContext(toolPermissionContext, 'ask'))
    return out
  }

  const projectConfig = getCurrentProjectConfig()
  out.push(
    ...(projectConfig.allowedTools ?? []).map(rule => ({
      rule,
      source: 'projectConfig' as const,
      behavior: 'allow' as const,
    })),
    ...((projectConfig as any).deniedTools ?? []).map((rule: string) => ({
      rule,
      source: 'projectConfig' as const,
      behavior: 'deny' as const,
    })),
    ...((projectConfig as any).askedTools ?? []).map((rule: string) => ({
      rule,
      source: 'projectConfig' as const,
      behavior: 'ask' as const,
    })),
  )
  return out
}

function rulesFromContext(
  context: ToolPermissionContext,
  behavior: PermissionExplanationBehavior,
): RuleCandidate[] {
  const groups =
    behavior === 'allow'
      ? context.alwaysAllowRules
      : behavior === 'deny'
        ? context.alwaysDenyRules
        : context.alwaysAskRules
  const out: RuleCandidate[] = []
  for (const [source, rules] of Object.entries(groups)) {
    if (!Array.isArray(rules)) continue
    for (const rule of rules) {
      out.push({
        rule,
        source: source as ToolPermissionUpdateDestination,
        behavior,
      })
    }
  }
  return out
}

function findMatchingRule(args: {
  tool: Tool
  input: { [k: string]: unknown }
  candidates: RuleCandidate[]
}): RuleCandidate | undefined {
  return args.candidates.find(candidate =>
    ruleMatchesToolInput(candidate.rule, args.tool, args.input),
  )
}

function ruleMatchesToolInput(
  rule: string,
  tool: Tool,
  input: { [k: string]: unknown },
): boolean {
  if (rule === tool.name) return true

  if (tool === BashTool) {
    const command =
      typeof input.command === 'string' ? input.command.trim() : ''
    if (!command) return false
    return (
      rule === getPermissionKey(tool, { command }, null) ||
      rule === getPermissionKey(tool, { command }, command) ||
      rule === `${tool.name}(${command.split(/\s+/)[0]}:*)`
    )
  }

  if (tool === SlashCommandTool) {
    const command =
      typeof input.command === 'string' ? input.command.trim() : ''
    const firstWord = command.split(/\s+/)[0]
    return (
      rule === getPermissionKey(tool, { command }, null) ||
      (firstWord ? rule === getPermissionKey(tool, { command }, firstWord) : false)
    )
  }

  if (tool === SkillTool) {
    const skill =
      typeof input.skill === 'string'
        ? input.skill.trim().replace(/^\//, '')
        : ''
    if (!skill) return false
    if (rule === getPermissionKey(tool, { skill }, null)) return true
    return getSkillPrefixes(skill).some(
      prefix => rule === getPermissionKey(tool, { skill }, prefix),
    )
  }

  if (tool === WebFetchTool) {
    return webFetchRuleMatches(rule, tool, input)
  }

  if (tool === WebSearchTool) {
    return rule === WebSearchTool.name || rule === getPermissionKey(tool, input, null)
  }

  const permissionKey = getPermissionKey(tool, input, null)
  if (rule === permissionKey) return true

  const parsedTool = parseMcpToolName(permissionKey)
  const parsedRule = parseMcpToolName(rule)
  return (
    !!parsedTool &&
    !!parsedRule &&
    parsedRule.serverName === parsedTool.serverName &&
    parsedRule.toolName === '*'
  )
}

function webFetchRuleMatches(
  rule: string,
  tool: Tool,
  input: { [k: string]: unknown },
): boolean {
  if (rule === WebFetchTool.name) return true
  const permissionKey = getPermissionKey(tool, input, null)
  if (rule === permissionKey) return true

  const actual = contentFromRule(permissionKey)
  const expected = contentFromRule(rule)
  if (!actual || !expected) return false
  if (!actual.startsWith('domain:') || !expected.startsWith('domain:')) {
    return expected === actual
  }
  const hostname = actual.slice('domain:'.length)
  const pattern = expected.slice('domain:'.length)
  return minimatch(hostname, pattern, { nocase: true, dot: true })
}

function contentFromRule(rule: string): string | null {
  const open = rule.indexOf('(')
  if (open === -1 || !rule.endsWith(')')) return null
  return rule.slice(open + 1, -1).trim()
}

function reasonForDecision(args: {
  tool: Tool
  input: { [k: string]: unknown }
  result: Awaited<ReturnType<typeof hasPermissionsToUseTool>>
  behavior: PermissionExplanationBehavior
  matched?: RuleCandidate
  permissionMode: string
}): string {
  if (args.matched) {
    return `Matched ${args.behavior} rule ${args.matched.rule} from ${args.matched.source}.`
  }
  if (args.permissionMode === 'bypassPermissions' && args.result.result) {
    return 'Allowed by bypassPermissions mode.'
  }
  if (args.permissionMode === 'dontAsk' && args.behavior === 'deny') {
    return 'Denied because dontAsk mode suppresses permission prompts.'
  }
  if (args.result.result === false) return args.result.message
  if (!args.tool.needsPermissions(args.input as never)) {
    return 'Allowed because the tool does not require permissions for this input.'
  }
  return 'Allowed by built-in permission rules.'
}

function extractSuggestedRules(
  suggestions: ToolPermissionContextUpdate[] | undefined,
): string[] | undefined {
  if (!Array.isArray(suggestions)) return undefined
  const rules = suggestions.flatMap(suggestion =>
    suggestion.type === 'addRules' ? suggestion.rules : [],
  )
  return rules.length > 0 ? [...new Set(rules)] : undefined
}

function fallbackSuggestedRules(
  tool: Tool,
  input: { [k: string]: unknown },
): string[] {
  const rule = getPermissionKey(tool, input, null)
  return rule ? [rule] : [tool.name]
}

function getSkillPrefixes(skillName: string): string[] {
  const parts = skillName
    .split(':')
    .map(part => part.trim())
    .filter(Boolean)
  if (parts.length <= 1) return []
  return parts.slice(0, -1).map((_, idx) => parts.slice(0, idx + 1).join(':'))
}
