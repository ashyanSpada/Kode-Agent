import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  GlobalConfig,
  LlamaCppRuntimeConfig,
  ModelPointerType,
  ModelProfile,
} from './schema'

const MODEL_POINTERS = ['main', 'task', 'compact', 'quick'] as const
type PointerKey = (typeof MODEL_POINTERS)[number]

type CliSettingsPayload = Partial<{
  model: string
  primaryProvider: string
  defaultModelName: string
  replaceModelProfiles: boolean
  modelPointers: Record<string, unknown>
  modelProfiles: unknown[]
}>

export type ApplyCliModelSettingsInput = {
  config: GlobalConfig
  cwd: string
  modelOverride?: string
  settingsOption?: string
}

export type ApplyCliModelSettingsResult = {
  nextConfig: GlobalConfig
  effectiveModelOverride?: string
  warnings: string[]
  changed: boolean
  settingsSource?: string
}

function normalizePointerName(pointer: string): PointerKey | null {
  const normalized = pointer.trim().toLowerCase()
  if (normalized === 'reasoning') return 'compact'
  return MODEL_POINTERS.includes(normalized as PointerKey)
    ? (normalized as PointerKey)
    : null
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeLlamaCppRuntime(
  value: unknown,
): LlamaCppRuntimeConfig | undefined {
  const raw = asObject(value)
  if (!raw) return undefined

  const runtime: LlamaCppRuntimeConfig = {}
  if (raw.mode === 'existing' || raw.mode === 'managed') runtime.mode = raw.mode
  if (typeof raw.binaryPath === 'string') runtime.binaryPath = raw.binaryPath
  if (typeof raw.modelPath === 'string') runtime.modelPath = raw.modelPath
  if (typeof raw.host === 'string') runtime.host = raw.host

  for (const key of ['port', 'ctxSize', 'threads', 'gpuLayers'] as const) {
    const numericValue = Number(raw[key])
    if (Number.isFinite(numericValue)) runtime[key] = numericValue
  }

  if (Array.isArray(raw.extraArgs)) {
    runtime.extraArgs = raw.extraArgs.filter(
      (arg): arg is string => typeof arg === 'string',
    )
  }
  if (typeof raw.autoStart === 'boolean') runtime.autoStart = raw.autoStart

  return runtime
}

function parseSettingsInput(
  rawSettings: string,
  cwd: string,
): { payload: CliSettingsPayload; source: string } {
  const trimmed = rawSettings.trim()
  if (!trimmed) {
    throw new Error('--settings requires a non-empty JSON string or file path')
  }

  const isLikelyInlineJson =
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('"')

  if (isLikelyInlineJson) {
    const parsed = JSON.parse(trimmed)
    const object = asObject(parsed)
    if (!object) {
      throw new Error('--settings JSON must be an object')
    }
    return { payload: object as CliSettingsPayload, source: 'inline-json' }
  }

  const resolvedPath = resolve(cwd, trimmed)
  if (!existsSync(resolvedPath)) {
    throw new Error(`--settings file not found: ${resolvedPath}`)
  }

  const fileText = readFileSync(resolvedPath, 'utf-8')
  const parsed = JSON.parse(fileText)
  const object = asObject(parsed)
  if (!object) {
    throw new Error('--settings file JSON must be an object')
  }
  return { payload: object as CliSettingsPayload, source: resolvedPath }
}

function normalizeModelProfile(input: unknown): ModelProfile | null {
  const raw = asObject(input)
  if (!raw) return null

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const provider = typeof raw.provider === 'string' ? raw.provider.trim() : ''
  const modelName =
    typeof raw.modelName === 'string' ? raw.modelName.trim() : ''
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey : ''
  const maxTokens = Number(raw.maxTokens)
  const contextLength = Number(raw.contextLength)
  if (
    !name ||
    !provider ||
    !modelName ||
    !Number.isFinite(maxTokens) ||
    maxTokens <= 0 ||
    !Number.isFinite(contextLength) ||
    contextLength <= 0
  ) {
    return null
  }

  return {
    name,
    provider: provider as any,
    modelName,
    apiKey,
    maxTokens,
    contextLength,
    baseURL: typeof raw.baseURL === 'string' ? raw.baseURL : undefined,
    reasoningEffort:
      typeof raw.reasoningEffort === 'string' ? raw.reasoningEffort : undefined,
    isActive: typeof raw.isActive === 'boolean' ? raw.isActive : true,
    createdAt:
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : Date.now(),
    lastUsed:
      typeof raw.lastUsed === 'number' && Number.isFinite(raw.lastUsed)
        ? raw.lastUsed
        : undefined,
    isGPT5: typeof raw.isGPT5 === 'boolean' ? raw.isGPT5 : undefined,
    validationStatus:
      raw.validationStatus === 'valid' ||
      raw.validationStatus === 'needs_repair' ||
      raw.validationStatus === 'auto_repaired'
        ? raw.validationStatus
        : undefined,
    lastValidation:
      typeof raw.lastValidation === 'number' &&
      Number.isFinite(raw.lastValidation)
        ? raw.lastValidation
        : undefined,
    llamaCpp: normalizeLlamaCppRuntime(raw.llamaCpp),
  }
}

function upsertProfiles(
  existingProfiles: ModelProfile[],
  nextProfiles: ModelProfile[],
): ModelProfile[] {
  const merged = [...existingProfiles]
  for (const profile of nextProfiles) {
    const index = merged.findIndex(p => p.modelName === profile.modelName)
    if (index >= 0) {
      merged[index] = profile
    } else {
      merged.push(profile)
    }
  }
  return merged
}

function resolveProfileReference(
  modelRef: string,
  profiles: ModelProfile[],
): ModelProfile | null {
  const byModelName = profiles.find(p => p.modelName === modelRef)
  if (byModelName) return byModelName
  const byName = profiles.find(p => p.name === modelRef)
  return byName ?? null
}

export function applyCliModelSettings({
  config,
  cwd,
  modelOverride,
  settingsOption,
}: ApplyCliModelSettingsInput): ApplyCliModelSettingsResult {
  const warnings: string[] = []
  const nextConfig: GlobalConfig = {
    ...config,
    modelProfiles: [...(config.modelProfiles ?? [])],
    modelPointers: {
      main: config.modelPointers?.main ?? '',
      task: config.modelPointers?.task ?? '',
      compact: config.modelPointers?.compact ?? '',
      quick: config.modelPointers?.quick ?? '',
    },
  }

  let changed = false
  let effectiveModelOverride =
    typeof modelOverride === 'string' && modelOverride.trim()
      ? modelOverride.trim()
      : undefined
  let settingsSource: string | undefined

  if (settingsOption && settingsOption.trim()) {
    const { payload, source } = parseSettingsInput(settingsOption, cwd)
    settingsSource = source

    if (
      typeof payload.primaryProvider === 'string' &&
      payload.primaryProvider
    ) {
      nextConfig.primaryProvider = payload.primaryProvider as any
      changed = true
    }
    if (typeof payload.defaultModelName === 'string') {
      nextConfig.defaultModelName = payload.defaultModelName
      changed = true
    }
    if (typeof payload.model === 'string' && payload.model.trim()) {
      effectiveModelOverride = payload.model.trim()
    }

    if (Array.isArray(payload.modelProfiles)) {
      const normalizedProfiles: ModelProfile[] = []
      for (const candidate of payload.modelProfiles) {
        const parsed = normalizeModelProfile(candidate)
        if (parsed) {
          normalizedProfiles.push(parsed)
        } else {
          warnings.push(
            'Skipped one invalid model profile from --settings payload',
          )
        }
      }
      if (
        typeof payload.replaceModelProfiles === 'boolean' &&
        payload.replaceModelProfiles
      ) {
        nextConfig.modelProfiles = normalizedProfiles
      } else if (normalizedProfiles.length > 0) {
        nextConfig.modelProfiles = upsertProfiles(
          nextConfig.modelProfiles ?? [],
          normalizedProfiles,
        )
      }
      changed = true
    }

    const pointerPatch = asObject(payload.modelPointers)
    if (pointerPatch) {
      for (const [key, value] of Object.entries(pointerPatch)) {
        const pointer = normalizePointerName(key)
        if (!pointer) {
          warnings.push(`Ignored unknown pointer '${key}' in --settings`)
          continue
        }
        if (typeof value !== 'string' || !value.trim()) {
          nextConfig.modelPointers![pointer] = ''
          changed = true
          continue
        }
        const target = resolveProfileReference(
          value.trim(),
          nextConfig.modelProfiles ?? [],
        )
        nextConfig.modelPointers![pointer] = target?.modelName ?? value.trim()
        changed = true
      }
    }
  }

  if (effectiveModelOverride) {
    const normalizedPointer = normalizePointerName(effectiveModelOverride)
    if (normalizedPointer) {
      const target = nextConfig.modelPointers?.[normalizedPointer]
      if (target) {
        nextConfig.modelPointers!.main = target
      } else {
        warnings.push(
          `Model pointer '${effectiveModelOverride}' is not configured; main pointer was not updated`,
        )
      }
      effectiveModelOverride = normalizedPointer
      changed = true
    } else {
      const targetProfile = resolveProfileReference(
        effectiveModelOverride,
        nextConfig.modelProfiles ?? [],
      )
      if (targetProfile) {
        nextConfig.modelPointers!.main = targetProfile.modelName
        nextConfig.defaultModelName = targetProfile.modelName
        effectiveModelOverride = targetProfile.modelName
      } else {
        nextConfig.modelPointers!.main = effectiveModelOverride
      }
      changed = true
    }
  }

  return {
    nextConfig,
    effectiveModelOverride,
    warnings,
    changed,
    settingsSource,
  }
}
