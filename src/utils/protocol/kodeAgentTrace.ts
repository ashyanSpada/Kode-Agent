import { existsSync, readFileSync } from 'fs'
import type { Message } from '@query'
import type { Message as APIMessage } from '@anthropic-ai/sdk/resources/index.mjs'
import {
  getSessionLogFilePath,
  type SessionJsonlEntry,
} from './kodeAgentSessionLog'

export type SessionTraceRecord = Extract<
  SessionJsonlEntry,
  { type: 'user' | 'assistant' }
>

function safeParseJson(line: string): unknown | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function isTraceRecord(value: unknown): value is SessionTraceRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as any
  return (
    (record.type === 'user' || record.type === 'assistant') &&
    typeof record.seq === 'number' &&
    Number.isFinite(record.seq) &&
    typeof record.uuid === 'string' &&
    record.message &&
    typeof record.message === 'object'
  )
}

export function isToolResultMessage(message: Message): boolean {
  if (message.type !== 'user') return false
  const content = message.message.content
  return (
    Array.isArray(content) &&
    content.some(block => block?.type === 'tool_result')
  )
}

export function getToolUseIdFromToolResult(message: Message): string | null {
  if (message.type !== 'user') return null
  const content = message.message.content
  if (!Array.isArray(content)) return null
  const block = content.find(item => item?.type === 'tool_result') as
    | { tool_use_id?: unknown }
    | undefined
  return typeof block?.tool_use_id === 'string' ? block.tool_use_id : null
}

export function loadSessionTraceRecords(args: {
  cwd: string
  sessionId: string
}): SessionTraceRecord[] {
  const filePath = getSessionLogFilePath(args)
  if (!existsSync(filePath)) {
    throw new Error(`No trace found with session ID: ${args.sessionId}`)
  }

  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => safeParseJson(line.trim()))
    .filter(isTraceRecord)
    .sort((a, b) => a.seq - b.seq)
}

export function traceRecordsToMessages(records: SessionTraceRecord[]): Message[] {
  return records.map(record => {
    if (record.type === 'user') {
      return {
        type: 'user',
        uuid: record.uuid as any,
        message: record.message as any,
        ...(record.toolUseResult !== undefined
          ? {
              toolUseResult: {
                data: record.toolUseResult,
                resultForAssistant: '',
              },
            }
          : {}),
      }
    }

    return {
      type: 'assistant',
      uuid: record.uuid as any,
      costUSD: record.costUSD ?? 0,
      durationMs: record.durationMs ?? 0,
      message: record.message as APIMessage,
      ...(record.isApiErrorMessage ? { isApiErrorMessage: true } : {}),
      ...(typeof record.requestId === 'string'
        ? { requestId: record.requestId }
        : {}),
      ...(typeof record.responseId === 'string'
        ? { responseId: record.responseId }
        : {}),
    } as any
  })
}
