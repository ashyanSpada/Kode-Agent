import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { LlamaCppRuntimeConfig, ModelProfile } from '@utils/config'

export const LLAMA_CPP_PROVIDER = 'llama-cpp'
export const LLAMA_CPP_DEFAULT_HOST = '127.0.0.1'
export const LLAMA_CPP_DEFAULT_PORT = 8080
export const LLAMA_CPP_DEFAULT_API_KEY = 'no-key'

type RuntimeMetadata = {
  pid: number
  command: string
  args: string[]
  baseURL: string
  modelPath: string
  startedAt: number
}

export type LlamaCppStatus = {
  running: boolean
  managed: boolean
  pid?: number
  baseURL: string
  modelPath?: string
  error?: string
}

const ownedProcesses = new Map<string, ChildProcess>()
const metadataPath = join(homedir(), '.kode', 'llama-cpp-runtime.json')

function getRuntimeConfig(profile: ModelProfile): LlamaCppRuntimeConfig {
  return profile.llamaCpp ?? {}
}

export function getLlamaCppBaseURL(config: LlamaCppRuntimeConfig = {}): string {
  const host = config.host || LLAMA_CPP_DEFAULT_HOST
  const port = config.port || LLAMA_CPP_DEFAULT_PORT
  return `http://${host}:${port}/v1`
}

function readMetadata(): RuntimeMetadata | null {
  try {
    if (!existsSync(metadataPath)) return null
    return JSON.parse(readFileSync(metadataPath, 'utf-8')) as RuntimeMetadata
  } catch {
    return null
  }
}

function writeMetadata(metadata: RuntimeMetadata) {
  mkdirSync(dirname(metadataPath), { recursive: true })
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
}

function clearMetadata() {
  try {
    rmSync(metadataPath, { force: true })
  } catch {
    // best effort cleanup
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isPortAvailable(host: string, port: number): Promise<boolean> {
  return await new Promise(resolve => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

async function choosePort(config: LlamaCppRuntimeConfig): Promise<number> {
  const preferred = config.port || LLAMA_CPP_DEFAULT_PORT
  if (config.port) return preferred

  for (let port = preferred; port < preferred + 100; port++) {
    if (await isPortAvailable(config.host || LLAMA_CPP_DEFAULT_HOST, port)) {
      return port
    }
  }

  throw new Error('No available port found for llama.cpp server')
}

function validateManagedRuntime(config: LlamaCppRuntimeConfig) {
  if (!config.binaryPath) {
    throw new Error('llama.cpp binary path is required for managed mode')
  }
  if (!config.modelPath) {
    throw new Error('GGUF model path is required for managed mode')
  }
  const binaryExists =
    config.binaryPath.includes('/') || config.binaryPath.includes('\\')
      ? existsSync(config.binaryPath) && statSync(config.binaryPath).isFile()
      : (process.env.PATH ?? '')
          .split(delimiter)
          .some(pathDir => existsSync(join(pathDir, config.binaryPath!)))

  if (!binaryExists) {
    throw new Error(`llama.cpp binary not found: ${config.binaryPath}`)
  }
  if (!existsSync(config.modelPath) || !statSync(config.modelPath).isFile()) {
    throw new Error(`GGUF model file not found: ${config.modelPath}`)
  }
}

export function buildLlamaCppServerArgs(
  config: LlamaCppRuntimeConfig,
): string[] {
  validateManagedRuntime(config)

  const args = [
    '-m',
    config.modelPath!,
    '--host',
    config.host || LLAMA_CPP_DEFAULT_HOST,
    '--port',
    String(config.port || LLAMA_CPP_DEFAULT_PORT),
  ]

  if (config.ctxSize) args.push('--ctx-size', String(config.ctxSize))
  if (config.threads) args.push('--threads', String(config.threads))
  if (typeof config.gpuLayers === 'number') {
    args.push('--n-gpu-layers', String(config.gpuLayers))
  }
  if (config.extraArgs?.length) args.push(...config.extraArgs)

  return args
}

export async function fetchLlamaCppModels(
  baseURL: string,
  apiKey: string = LLAMA_CPP_DEFAULT_API_KEY,
): Promise<any[]> {
  const cleanBaseURL = baseURL.replace(/\/+$/, '')
  const response = await fetch(`${cleanBaseURL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`llama.cpp model list failed: HTTP ${response.status}`)
  }

  const data = await response.json()
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && Array.isArray((data as any).data)) {
    return (data as any).data
  }
  if (data && typeof data === 'object' && Array.isArray((data as any).models)) {
    return (data as any).models
  }
  return []
}

export async function waitForLlamaCppServer(
  baseURL: string,
  apiKey: string = LLAMA_CPP_DEFAULT_API_KEY,
  timeoutMs: number = 30000,
): Promise<void> {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetchLlamaCppModels(baseURL, apiKey)
      return
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  throw new Error(
    `Timed out waiting for llama.cpp server: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

export async function ensureLlamaCppRuntime(
  profile: ModelProfile,
): Promise<ModelProfile> {
  if (profile.provider !== LLAMA_CPP_PROVIDER) return profile

  const config = getRuntimeConfig(profile)
  const baseProfile = {
    ...profile,
    apiKey: profile.apiKey || LLAMA_CPP_DEFAULT_API_KEY,
    baseURL: profile.baseURL || getLlamaCppBaseURL(config),
  }

  if (config.mode !== 'managed' || config.autoStart === false) {
    return baseProfile
  }

  const existing = readMetadata()
  if (existing?.pid && isPidRunning(existing.pid)) {
    return {
      ...baseProfile,
      baseURL: existing.baseURL,
      llamaCpp: { ...config, modelPath: existing.modelPath },
    }
  }

  const port = await choosePort(config)
  const runtimeConfig = { ...config, port }
  const args = buildLlamaCppServerArgs(runtimeConfig)
  const child = spawn(runtimeConfig.binaryPath!, args, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const baseURL = getLlamaCppBaseURL(runtimeConfig)
  writeMetadata({
    pid: child.pid!,
    command: runtimeConfig.binaryPath!,
    args,
    baseURL,
    modelPath: runtimeConfig.modelPath!,
    startedAt: Date.now(),
  })
  ownedProcesses.set(baseURL, child)

  try {
    await waitForLlamaCppServer(baseURL, baseProfile.apiKey)
  } catch (error) {
    await stopLlamaCppRuntime()
    throw error
  }

  return {
    ...baseProfile,
    baseURL,
    llamaCpp: runtimeConfig,
  }
}

export async function getLlamaCppStatus(): Promise<LlamaCppStatus> {
  const metadata = readMetadata()
  const baseURL = metadata?.baseURL || getLlamaCppBaseURL()
  if (!metadata) {
    try {
      await fetchLlamaCppModels(baseURL)
      return { running: true, managed: false, baseURL }
    } catch (error) {
      return {
        running: false,
        managed: false,
        baseURL,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    running: isPidRunning(metadata.pid),
    managed: true,
    pid: metadata.pid,
    baseURL: metadata.baseURL,
    modelPath: metadata.modelPath,
  }
}

export async function stopLlamaCppRuntime(): Promise<boolean> {
  const metadata = readMetadata()
  if (!metadata?.pid) return false

  const child = ownedProcesses.get(metadata.baseURL)
  if (child && !child.killed) {
    child.kill()
  } else if (isPidRunning(metadata.pid)) {
    process.kill(metadata.pid)
  }

  ownedProcesses.delete(metadata.baseURL)
  clearMetadata()
  return true
}
