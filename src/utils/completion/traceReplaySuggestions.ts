import { listKodeAgentSessions } from '@utils/protocol/kodeAgentSessionResume'
import type { UnifiedSuggestion } from './types'

export function generateTraceReplaySuggestions(args: {
  prefix: string
  cwd: string
}): UnifiedSuggestion[] {
  const { prefix, cwd } = args
  const normalizedPrefix = prefix.toLowerCase()
  const sessions = listKodeAgentSessions({ cwd })

  const suggestions: UnifiedSuggestion[] = []

  if ('latest'.startsWith(normalizedPrefix)) {
    suggestions.push({
      value: 'latest',
      displayValue: 'latest',
      type: 'trace',
      score: 10000,
      metadata: { kind: 'latest' },
    })
  }

  for (const session of sessions) {
    const searchable = [
      session.sessionId,
      session.slug ?? '',
      session.customTitle ?? '',
      session.tag ?? '',
    ].filter(Boolean)

    if (
      normalizedPrefix &&
      !searchable.some(value => value.toLowerCase().startsWith(normalizedPrefix))
    ) {
      continue
    }

    const label =
      session.customTitle ??
      session.slug ??
      session.summary?.replace(/\s+/g, ' ').slice(0, 48) ??
      ''
    const displayValue = label
      ? `${session.sessionId}  ${label}`
      : session.sessionId

    suggestions.push({
      value: session.sessionId,
      displayValue,
      type: 'trace',
      score: 9000 - suggestions.length,
      metadata: {
        sessionId: session.sessionId,
        slug: session.slug,
        customTitle: session.customTitle,
        tag: session.tag,
        modifiedAt: session.modifiedAt?.toISOString() ?? null,
      },
    })
  }

  return suggestions
}
