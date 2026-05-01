import type { Command } from '@commands'
import {
  isTraceReplayMode,
  replayTrace,
  type TraceReplayMode,
  type TraceReplayResult,
} from '@utils/protocol/kodeAgentTraceReplay'
import { findMostRecentKodeAgentSessionId } from '@utils/protocol/kodeAgentSessionLoad'
import { resolveResumeSessionIdentifier } from '@utils/protocol/kodeAgentSessionResume'
import { getCwd } from '@utils/state'

type ParsedTraceArgs =
  | {
      ok: true
      action: 'replay'
      identifier: string
      mode: TraceReplayMode
      json: boolean
    }
  | { ok: false; message: string }

function usage(): string {
  return [
    'Usage:',
    '  /trace replay <session-id|slug|title|latest> [--mode messages-only|stub-llm|stub-tools|full] [--json]',
  ].join('\n')
}

function parseArgs(args: string): ParsedTraceArgs {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { ok: false, message: usage() }

  const action = parts.shift()
  if (action !== 'replay') {
    return { ok: false, message: usage() }
  }

  let identifier = ''
  let mode: TraceReplayMode = 'full'
  let json = false

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (part === '--json') {
      json = true
      continue
    }
    if (part === '--mode') {
      const next = parts[++i]
      if (!next || !isTraceReplayMode(next)) {
        return {
          ok: false,
          message: `Invalid trace replay mode: ${next ?? ''}\n${usage()}`,
        }
      }
      mode = next
      continue
    }
    if (part.startsWith('--mode=')) {
      const value = part.slice('--mode='.length)
      if (!isTraceReplayMode(value)) {
        return {
          ok: false,
          message: `Invalid trace replay mode: ${value}\n${usage()}`,
        }
      }
      mode = value
      continue
    }
    if (part.startsWith('--')) {
      return { ok: false, message: `Unknown option: ${part}\n${usage()}` }
    }
    if (!identifier) {
      identifier = part
      continue
    }
    return { ok: false, message: `Unexpected argument: ${part}\n${usage()}` }
  }

  if (!identifier) return { ok: false, message: usage() }

  return { ok: true, action: 'replay', identifier, mode, json }
}

function resolveSessionId(cwd: string, identifier: string): string | null {
  if (identifier === 'latest') return findMostRecentKodeAgentSessionId(cwd)

  const resolved = resolveResumeSessionIdentifier({ cwd, identifier })
  if (resolved.kind === 'ok') return resolved.sessionId
  if (resolved.kind === 'different_directory') {
    throw new Error(
      resolved.otherCwd
        ? `That session belongs to a different directory: ${resolved.otherCwd}`
        : 'That session belongs to a different directory.',
    )
  }
  if (resolved.kind === 'ambiguous') {
    throw new Error(
      `Multiple sessions match "${identifier}": ${resolved.matchingSessionIds.join(', ')}`,
    )
  }
  return null
}

function formatReplayResult(result: TraceReplayResult): string {
  const lines = [
    result.ok ? 'Trace replay OK' : 'Trace replay found issues',
    `Session: ${result.sessionId}`,
    `Mode: ${result.mode}`,
    `Records: ${result.recordCount}`,
    `Messages: ${result.messageCount} (${result.userMessageCount} user, ${result.assistantMessageCount} assistant)`,
    `Tool uses/results: ${result.toolUseCount}/${result.toolResultCount}`,
    `LLM stubbed: ${result.llmStubbed ? 'yes' : 'no'}`,
    `Tools stubbed: ${result.toolsStubbed ? 'yes' : 'no'}`,
  ]

  if (result.issues.length > 0) {
    lines.push('', 'Issues:')
    for (const issue of result.issues) {
      const location =
        issue.seq !== undefined ? ` seq=${issue.seq}` : ''
      lines.push(`- ${issue.code}${location}: ${issue.message}`)
    }
  }

  return lines.join('\n')
}

const traceCommand = {
  type: 'local',
  name: 'trace',
  description: 'Replay and validate persisted session traces',
  isEnabled: true,
  isHidden: false,
  userFacingName() {
    return 'trace'
  },
  async call(args) {
    const parsed = parseArgs(args)
    if (parsed.ok === false) return parsed.message

    const cwd = getCwd()
    const sessionId = resolveSessionId(cwd, parsed.identifier)
    if (!sessionId) {
      return `No trace found for "${parsed.identifier}".`
    }

    const result = replayTrace({
      cwd,
      sessionId,
      mode: parsed.mode,
    })

    return parsed.json ? JSON.stringify(result, null, 2) : formatReplayResult(result)
  },
} satisfies Command

export default traceCommand
