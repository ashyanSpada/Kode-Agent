import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import traceCommand from '@commands/trace'
import { appendSessionJsonlFromMessage } from '@utils/protocol/kodeAgentSessionLog'
import { getCompletionContext } from '@utils/completion/context'
import { generateTraceReplaySuggestions } from '@utils/completion/traceReplaySuggestions'
import {
  getKodeAgentSessionId,
  resetKodeAgentSessionIdForTests,
  setKodeAgentSessionId,
} from '@utils/protocol/kodeAgentSessionId'
import { resetSessionJsonlStateForTests } from '@utils/protocol/kodeAgentSessionLog'
import { replayTrace } from '@utils/protocol/kodeAgentTraceReplay'
import { createAssistantMessage, createUserMessage } from '@utils/messages'
import { setCwd } from '@utils/state'

describe('trace replay', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const runnerCwd = process.cwd()

  let configDir: string
  let projectDir: string

  beforeEach(async () => {
    resetSessionJsonlStateForTests()
    setKodeAgentSessionId('704b907b-2b0f-478d-a7cb-b9fecf921913')
    configDir = mkdtempSync(join(tmpdir(), 'kode-trace-replay-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-trace-replay-project-'))
    process.env.KODE_CONFIG_DIR = configDir
    await setCwd(projectDir)
  })

  afterEach(async () => {
    await setCwd(runnerCwd)
    resetSessionJsonlStateForTests()
    resetKodeAgentSessionIdForTests()
    if (originalConfigDir === undefined) {
      delete process.env.KODE_CONFIG_DIR
    } else {
      process.env.KODE_CONFIG_DIR = originalConfigDir
    }
    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('replays a valid trace with recorded assistant and tool result messages', () => {
    const user = createUserMessage('list files')
    const assistant = {
      ...createAssistantMessage(''),
      message: {
        ...createAssistantMessage('').message,
        content: [
          {
            type: 'tool_use',
            id: 'toolu_trace',
            name: 'Bash',
            input: { command: 'ls' },
          },
        ],
      },
    } as any
    const result = createUserMessage(
      [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_trace',
          content: 'ok',
        },
      ],
      {
        data: { stdout: 'ok', exitCode: 0 },
        resultForAssistant: 'ok',
      },
    )

    appendSessionJsonlFromMessage({ message: user, toolUseContext: {} })
    appendSessionJsonlFromMessage({ message: assistant, toolUseContext: {} })
    appendSessionJsonlFromMessage({ message: result, toolUseContext: {} })

    const replay = replayTrace({
      cwd: projectDir,
      sessionId: getKodeAgentSessionId(),
      mode: 'full',
    })

    expect(replay.ok).toBe(true)
    expect(replay.recordCount).toBe(3)
    expect(replay.toolUseCount).toBe(1)
    expect(replay.toolResultCount).toBe(1)
    expect(replay.llmStubbed).toBe(true)
    expect(replay.toolsStubbed).toBe(true)
    expect(replay.events.map(event => event.seq)).toEqual([1, 2, 3])
  })

  test('reports unresolved assistant tool uses', () => {
    const assistant = {
      ...createAssistantMessage(''),
      message: {
        ...createAssistantMessage('').message,
        content: [
          {
            type: 'tool_use',
            id: 'toolu_missing',
            name: 'Bash',
            input: { command: 'pwd' },
          },
        ],
      },
    } as any

    appendSessionJsonlFromMessage({
      message: createUserMessage('run pwd'),
      toolUseContext: {},
    })
    appendSessionJsonlFromMessage({ message: assistant, toolUseContext: {} })

    const replay = replayTrace({
      cwd: projectDir,
      sessionId: getKodeAgentSessionId(),
      mode: 'messages-only',
    })

    expect(replay.ok).toBe(false)
    expect(replay.issues.map(issue => issue.code)).toContain(
      'unresolved_tool_use',
    )
  })

  test('/trace replay latest returns a replay summary', async () => {
    appendSessionJsonlFromMessage({
      message: createUserMessage('hello'),
      toolUseContext: {},
    })
    appendSessionJsonlFromMessage({
      message: createAssistantMessage('hi'),
      toolUseContext: {},
    })

    const output = await traceCommand.call('replay latest', {
      options: { commands: [], tools: [], slowAndCapableModel: 'main' },
      abortController: new AbortController(),
      setForkConvoWithMessagesOnTheNextRender() {},
    } as any)

    expect(output).toContain('Trace replay OK')
    expect(output).toContain(`Session: ${getKodeAgentSessionId()}`)
    expect(output).toContain('Records: 2')
  })

  test('completion detects /trace replay argument context', () => {
    const context = getCompletionContext({
      input: '/trace replay ',
      cursorOffset: '/trace replay '.length,
    })

    expect(context).toEqual({
      type: 'trace',
      prefix: '',
      startPos: '/trace replay '.length,
      endPos: '/trace replay '.length,
    })

    const prefixed = getCompletionContext({
      input: '/trace replay 704',
      cursorOffset: '/trace replay 704'.length,
    })
    expect(prefixed?.type).toBe('trace')
    expect(prefixed?.prefix).toBe('704')
  })

  test('completion suggests existing replayable trace ids', () => {
    appendSessionJsonlFromMessage({
      message: createUserMessage('hello'),
      toolUseContext: {},
    })

    const suggestions = generateTraceReplaySuggestions({
      cwd: projectDir,
      prefix: '',
    })

    expect(suggestions.map(s => s.value)).toContain('latest')
    expect(suggestions.map(s => s.value)).toContain(getKodeAgentSessionId())

    const prefixed = generateTraceReplaySuggestions({
      cwd: projectDir,
      prefix: '704',
    })
    expect(prefixed.map(s => s.value)).toEqual([getKodeAgentSessionId()])
  })
})
