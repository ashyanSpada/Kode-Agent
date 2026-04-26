import { describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildLlamaCppServerArgs,
  getLlamaCppBaseURL,
} from '@services/ai/llamaCppRuntime'

describe('llama.cpp runtime', () => {
  test('builds llama-server arguments from managed runtime config', () => {
    const dir = join(tmpdir(), `kode-llama-cpp-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const binaryPath = join(dir, 'llama-server')
    const modelPath = join(dir, 'model.gguf')
    writeFileSync(binaryPath, '', 'utf-8')
    writeFileSync(modelPath, '', 'utf-8')

    const args = buildLlamaCppServerArgs({
      binaryPath,
      modelPath,
      host: '127.0.0.1',
      port: 8090,
      ctxSize: 8192,
      threads: 8,
      gpuLayers: 35,
      extraArgs: ['--parallel', '2'],
    })

    expect(args).toEqual([
      '-m',
      modelPath,
      '--host',
      '127.0.0.1',
      '--port',
      '8090',
      '--ctx-size',
      '8192',
      '--threads',
      '8',
      '--n-gpu-layers',
      '35',
      '--parallel',
      '2',
    ])
    rmSync(dir, { recursive: true, force: true })
  })

  test('formats default and custom OpenAI-compatible base URLs', () => {
    expect(getLlamaCppBaseURL()).toBe('http://127.0.0.1:8080/v1')
    expect(getLlamaCppBaseURL({ host: '0.0.0.0', port: 8123 })).toBe(
      'http://0.0.0.0:8123/v1',
    )
  })

  test('accepts llama-server binary names that resolve through PATH', () => {
    const dir = join(tmpdir(), `kode-llama-cpp-path-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const binaryPath = join(dir, 'llama-server')
    const modelPath = join(dir, 'model.gguf')
    writeFileSync(binaryPath, '', 'utf-8')
    writeFileSync(modelPath, '', 'utf-8')
    const originalPath = process.env.PATH
    process.env.PATH = `${dir}${originalPath ? `${delimiter}${originalPath}` : ''}`

    const args = buildLlamaCppServerArgs({
      binaryPath: 'llama-server',
      modelPath,
    })

    expect(args.slice(0, 2)).toEqual(['-m', modelPath])
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }
    rmSync(dir, { recursive: true, force: true })
  })
})
