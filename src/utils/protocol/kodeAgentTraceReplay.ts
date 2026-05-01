import type { Message } from '@query'
import {
  getToolUseIdFromToolResult,
  loadSessionTraceRecords,
  traceRecordsToMessages,
  type SessionTraceRecord,
} from './kodeAgentTrace'

export type TraceReplayMode = 'messages-only' | 'stub-llm' | 'stub-tools' | 'full'

export type TraceReplayIssue = {
  code:
    | 'empty_trace'
    | 'non_contiguous_seq'
    | 'parent_mismatch'
    | 'orphan_tool_result'
    | 'unresolved_tool_use'
    | 'roundtrip_mismatch'
  message: string
  seq?: number
  uuid?: string
}

export type TraceReplayEvent = {
  seq: number
  uuid: string
  type: 'user' | 'assistant'
  toolUseIds: string[]
  preview: string
}

export type TraceReplayResult = {
  mode: TraceReplayMode
  sessionId: string
  recordCount: number
  messageCount: number
  assistantMessageCount: number
  userMessageCount: number
  toolUseCount: number
  toolResultCount: number
  llmStubbed: boolean
  toolsStubbed: boolean
  ok: boolean
  issues: TraceReplayIssue[]
  events: TraceReplayEvent[]
}

const TRACE_REPLAY_MODES = new Set<TraceReplayMode>([
  'messages-only',
  'stub-llm',
  'stub-tools',
  'full',
])

export function isTraceReplayMode(value: string): value is TraceReplayMode {
  return TRACE_REPLAY_MODES.has(value as TraceReplayMode)
}

function getContentBlocks(record: SessionTraceRecord): any[] {
  const content = (record.message as any)?.content
  return Array.isArray(content) ? content : []
}

function getAssistantToolUseIds(record: SessionTraceRecord): string[] {
  if (record.type !== 'assistant') return []
  return getContentBlocks(record)
    .filter(
      block =>
        block?.type === 'tool_use' ||
        block?.type === 'server_tool_use' ||
        block?.type === 'mcp_tool_use',
    )
    .map(block => block?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function getUserToolResultIds(message: Message): string[] {
  const id = getToolUseIdFromToolResult(message)
  if (id) return [id]
  if (message.type !== 'user') return []
  const content = message.message.content
  if (!Array.isArray(content)) return []
  return content
    .filter(block => block?.type === 'tool_result')
    .map(block => (block as any)?.tool_use_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function previewMessage(message: Message): string {
  if (message.type === 'progress') return ''

  if (message.type === 'assistant') {
    const first = message.message.content[0] as any
    if (first?.type === 'text') return String(first.text ?? '').slice(0, 120)
    if (
      first?.type === 'tool_use' ||
      first?.type === 'server_tool_use' ||
      first?.type === 'mcp_tool_use'
    ) {
      return `${String(first.name ?? 'tool')}(${JSON.stringify(first.input ?? {}).slice(0, 80)})`
    }
    return ''
  }

  const content = message.message.content
  if (typeof content === 'string') return content.slice(0, 120)
  const first = Array.isArray(content) ? (content[0] as any) : null
  if (first?.type === 'tool_result') {
    return `tool_result(${String(first.tool_use_id ?? '')})`
  }
  if (first?.type === 'text') return String(first.text ?? '').slice(0, 120)
  return ''
}

function validateTraceRecords(args: {
  records: SessionTraceRecord[]
  messages: Message[]
}): TraceReplayIssue[] {
  const { records, messages } = args
  const issues: TraceReplayIssue[] = []

  if (records.length === 0) {
    issues.push({
      code: 'empty_trace',
      message: 'Trace contains no replayable user or assistant records.',
    })
    return issues
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!
    const expectedSeq = i + 1
    if (record.seq !== expectedSeq) {
      issues.push({
        code: 'non_contiguous_seq',
        message: `Expected seq ${expectedSeq}, got ${record.seq}.`,
        seq: record.seq,
        uuid: record.uuid,
      })
    }

    const expectedParent = i === 0 ? null : records[i - 1]!.uuid
    if (record.parentUuid !== expectedParent) {
      issues.push({
        code: 'parent_mismatch',
        message: `Expected parentUuid ${expectedParent ?? 'null'}, got ${record.parentUuid ?? 'null'}.`,
        seq: record.seq,
        uuid: record.uuid,
      })
    }
  }

  const pendingToolUses = new Map<string, SessionTraceRecord>()
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!
    const message = messages[i]!

    for (const toolUseId of getAssistantToolUseIds(record)) {
      pendingToolUses.set(toolUseId, record)
    }

    for (const toolUseId of getUserToolResultIds(message)) {
      if (!pendingToolUses.has(toolUseId)) {
        issues.push({
          code: 'orphan_tool_result',
          message: `Tool result ${toolUseId} has no preceding assistant tool use.`,
          seq: record.seq,
          uuid: record.uuid,
        })
      } else {
        pendingToolUses.delete(toolUseId)
      }
    }
  }

  for (const [toolUseId, record] of pendingToolUses) {
    issues.push({
      code: 'unresolved_tool_use',
      message: `Assistant tool use ${toolUseId} has no matching tool result.`,
      seq: record.seq,
      uuid: record.uuid,
    })
  }

  if (messages.length !== records.length) {
    issues.push({
      code: 'roundtrip_mismatch',
      message: `Trace round trip produced ${messages.length} messages from ${records.length} records.`,
    })
  }

  return issues
}

export function replayTrace(args: {
  cwd: string
  sessionId: string
  mode?: TraceReplayMode
}): TraceReplayResult {
  const mode = args.mode ?? 'full'
  const records = loadSessionTraceRecords({
    cwd: args.cwd,
    sessionId: args.sessionId,
  })
  const messages = traceRecordsToMessages(records)
  const issues = validateTraceRecords({ records, messages })
  const assistantMessageCount = records.filter(r => r.type === 'assistant').length
  const userMessageCount = records.filter(r => r.type === 'user').length
  const assistantToolUseIds = records.flatMap(getAssistantToolUseIds)
  const userToolResultIds = messages.flatMap(getUserToolResultIds)

  return {
    mode,
    sessionId: args.sessionId,
    recordCount: records.length,
    messageCount: messages.length,
    assistantMessageCount,
    userMessageCount,
    toolUseCount: assistantToolUseIds.length,
    toolResultCount: userToolResultIds.length,
    llmStubbed: mode === 'stub-llm' || mode === 'full',
    toolsStubbed: mode === 'stub-tools' || mode === 'full',
    ok: issues.length === 0,
    issues,
    events: records.map((record, index) => ({
      seq: record.seq,
      uuid: record.uuid,
      type: record.type,
      toolUseIds:
        record.type === 'assistant'
          ? getAssistantToolUseIds(record)
          : getUserToolResultIds(messages[index]!),
      preview: previewMessage(messages[index]!),
    })),
  }
}
