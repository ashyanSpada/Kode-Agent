import { describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyCliModelSettings } from '@utils/config'

describe('applyCliModelSettings', () => {
  test('applies inline JSON settings and model override', () => {
    const baseConfig: any = {
      modelProfiles: [
        {
          name: 'OpenAI Main',
          provider: 'openai',
          modelName: 'gpt-4.1',
          apiKey: 'key',
          maxTokens: 8192,
          contextLength: 128000,
          isActive: true,
          createdAt: 1,
        },
      ],
      modelPointers: {
        main: 'gpt-4.1',
        task: 'gpt-4.1',
        compact: 'gpt-4.1',
        quick: 'gpt-4.1',
      },
      primaryProvider: 'openai',
    }

    const settings = JSON.stringify({
      modelPointers: { reasoning: 'OpenAI Main' },
      model: 'reasoning',
      primaryProvider: 'openai',
    })

    const result = applyCliModelSettings({
      config: baseConfig,
      cwd: process.cwd(),
      modelOverride: 'OpenAI Main',
      settingsOption: settings,
    })

    expect(result.changed).toBe(true)
    expect(result.effectiveModelOverride).toBe('compact')
    expect(result.nextConfig.modelPointers?.compact).toBe('gpt-4.1')
    expect(result.nextConfig.modelPointers?.main).toBe('gpt-4.1')
    expect(result.nextConfig.primaryProvider).toBe('openai')
    expect(result.warnings.length).toBe(0)
  })

  test('loads settings from file path', () => {
    const dir = join(tmpdir(), `kode-model-settings-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const settingsPath = join(dir, 'settings.json')
    writeFileSync(
      settingsPath,
      JSON.stringify({
        modelProfiles: [
          {
            name: 'Claude',
            provider: 'anthropic',
            modelName: 'claude-sonnet-4-20250514',
            apiKey: 'secret',
            maxTokens: 8192,
            contextLength: 200000,
          },
        ],
        modelPointers: {
          main: 'Claude',
        },
      }),
      'utf-8',
    )

    const result = applyCliModelSettings({
      config: {
        modelProfiles: [],
        modelPointers: { main: '', task: '', compact: '', quick: '' },
      } as any,
      cwd: dir,
      settingsOption: settingsPath,
    })

    expect(result.settingsSource).toContain('settings.json')
    expect(result.nextConfig.modelProfiles?.length).toBe(1)
    expect(result.nextConfig.modelPointers?.main).toBe(
      'claude-sonnet-4-20250514',
    )
    rmSync(dir, { recursive: true, force: true })
  })

  test('preserves llama.cpp runtime settings from profiles', () => {
    const result = applyCliModelSettings({
      config: {
        modelProfiles: [],
        modelPointers: { main: '', task: '', compact: '', quick: '' },
      } as any,
      cwd: process.cwd(),
      settingsOption: JSON.stringify({
        modelProfiles: [
          {
            name: 'Local Llama',
            provider: 'llama-cpp',
            modelName: 'model.gguf',
            apiKey: 'no-key',
            baseURL: 'http://127.0.0.1:8080/v1',
            maxTokens: 8192,
            contextLength: 8192,
            llamaCpp: {
              mode: 'managed',
              binaryPath: '/usr/local/bin/llama-server',
              modelPath: '/models/model.gguf',
              host: '127.0.0.1',
              port: 8080,
              ctxSize: 8192,
              threads: 8,
              gpuLayers: 35,
              extraArgs: ['--parallel', '2'],
              autoStart: true,
            },
          },
        ],
      }),
    })

    const profile = result.nextConfig.modelProfiles?.[0]
    expect(profile?.provider).toBe('llama-cpp')
    expect(profile?.llamaCpp?.mode).toBe('managed')
    expect(profile?.llamaCpp?.port).toBe(8080)
    expect(profile?.llamaCpp?.extraArgs).toEqual(['--parallel', '2'])
  })
})
