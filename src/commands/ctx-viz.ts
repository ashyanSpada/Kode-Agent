import type { Command } from '@commands'
import type { Tool } from '@tool'
import { getSystemPrompt } from '@constants/prompts'
import { getContext } from '@context'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getMessagesGetter } from '@messages'
import { PROJECT_FILE } from '@constants/product'
const BYTES_PER_TOKEN = 4

interface Section {
  title: string
  content: string
}

interface ToolSummary {
  name: string
  description: string
}

function getContextSections(text: string): Section[] {
  const sections: Section[] = []

  const firstContextIndex = text.indexOf('<context')

  if (firstContextIndex === -1) {
    const coreSysprompt = text.trim()
    return coreSysprompt
      ? [
          {
            title: 'Core Sysprompt',
            content: coreSysprompt,
          },
        ]
      : []
  }

  if (firstContextIndex > 0) {
    const coreSysprompt = text.slice(0, firstContextIndex).trim()
    if (coreSysprompt) {
      sections.push({
        title: 'Core Sysprompt',
        content: coreSysprompt,
      })
    }
  }

  let currentPos = firstContextIndex
  let nonContextContent = ''

  const regex = /<context\s+name="([^"]*)">([\s\S]*?)<\/context>/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentPos) {
      nonContextContent += text.slice(currentPos, match.index)
    }

    const [, name = 'Unnamed Section', content = ''] = match
    sections.push({
      title: name === 'codeStyle' ? `CodeStyle + ${PROJECT_FILE}'s` : name,
      content: content.trim(),
    })

    currentPos = match.index + match[0].length
  }

  if (currentPos < text.length) {
    nonContextContent += text.slice(currentPos)
  }

  const trimmedNonContext = nonContextContent.trim()
  if (trimmedNonContext) {
    sections.push({
      title: 'Non-contextualized Content',
      content: trimmedNonContext,
    })
  }

  return sections
}

function formatTokenCount(bytes: number): string {
  const tokens = bytes / BYTES_PER_TOKEN
  const k = tokens / 1000
  return `${Math.round(k * 10) / 10}k`
}

function formatByteCount(bytes: number): string {
  const kb = bytes / 1024
  return `${Math.round(kb * 10) / 10}kb`
}

function createTextTable(rows: string[][]): string {
  const widths = rows[0]?.map((_, index) =>
    Math.max(...rows.map(row => (row[index] ?? '').length)),
  )

  if (!widths || widths.length === 0) return ''

  const formatRow = (row: string[]) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(' | ')} |`

  const divider = `|-${widths.map(width => '-'.repeat(width)).join('-|-')}-|`
  const [head, ...body] = rows

  return [formatRow(head ?? []), divider, ...body.map(formatRow)].join('\n')
}

function createSummaryTable(
  systemText: string,
  systemSections: Section[],
  tools: ToolSummary[],
  messages: unknown,
): string {
  const rows = [['Component', 'Tokens', 'Size', '% Used']]

  const messagesStr = JSON.stringify(messages) ?? ''
  const toolsStr = JSON.stringify(tools)

  const total = systemText.length + toolsStr.length + messagesStr.length
  const getPercentage = (n: number) =>
    total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'

  rows.push([
    'System prompt',
    formatTokenCount(systemText.length),
    formatByteCount(systemText.length),
    getPercentage(systemText.length),
  ])
  for (const section of systemSections) {
    rows.push([
      `  ${section.title}`,
      formatTokenCount(section.content.length),
      formatByteCount(section.content.length),
      getPercentage(section.content.length),
    ])
  }

  rows.push([
    'Tool definitions',
    formatTokenCount(toolsStr.length),
    formatByteCount(toolsStr.length),
    getPercentage(toolsStr.length),
  ])
  for (const tool of tools) {
    rows.push([
      `  ${tool.name}`,
      formatTokenCount(tool.description.length),
      formatByteCount(tool.description.length),
      getPercentage(tool.description.length),
    ])
  }

  rows.push(
    [
      'Messages',
      formatTokenCount(messagesStr.length),
      formatByteCount(messagesStr.length),
      getPercentage(messagesStr.length),
    ],
    ['Total', formatTokenCount(total), formatByteCount(total), '100%'],
  )

  return createTextTable(rows)
}

const command: Command = {
  name: 'ctx-viz',
  description:
    'Show token usage breakdown for the current conversation context',
  isEnabled: true,
  isHidden: false,
  type: 'local',

  userFacingName() {
    return this.name
  },

  async call(_args: string, cmdContext: { options: { tools: Tool[] } }) {
    const [systemPromptRaw, sysContext] = await Promise.all([
      getSystemPrompt(),
      getContext(),
    ])

    const rawTools = cmdContext.options.tools

    let systemPrompt = systemPromptRaw.join('\n')
    for (const [name, content] of Object.entries(sysContext)) {
      systemPrompt += `\n<context name="${name}">${content}</context>`
    }

    const tools = await Promise.all(
      rawTools.map(async t => {
        const fullPrompt = await t.prompt({ safeMode: false })
        const schema = JSON.stringify(
          'inputJSONSchema' in t && t.inputJSONSchema
            ? t.inputJSONSchema
            : zodToJsonSchema(t.inputSchema as any),
        )

        return {
          name: t.name,
          description: `${fullPrompt}\n\nSchema:\n${schema}`,
        }
      }),
    )

    const messages = getMessagesGetter()()

    const sections = getContextSections(systemPrompt)
    return createSummaryTable(systemPrompt, sections, tools, messages)
  },
}

export default command
