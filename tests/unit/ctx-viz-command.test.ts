import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { getCommands } from '@commands'

describe('/ctx-viz command', () => {
  test('renders a context table and awaits async tool prompts', async () => {
    const commands = await getCommands()
    const ctxViz = commands.find(command => command.name === 'ctx-viz')

    expect(ctxViz).toBeTruthy()
    expect(ctxViz?.type).toBe('local')

    const output = await (ctxViz as any).call('', {
      options: {
        tools: [
          {
            name: 'AsyncDummy',
            async prompt() {
              return 'async dummy prompt'
            },
            inputSchema: z.object({ query: z.string() }),
          },
        ],
      },
    })

    expect(output).toContain('| Component')
    expect(output).toContain('System prompt')
    expect(output).toContain('Tool definitions')
    expect(output).toContain('AsyncDummy')
    expect(output).not.toContain('[object Promise]')
  })
})
