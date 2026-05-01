import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import skill from '@commands/skill'
import { reloadCustomCommands } from '@services/customCommands'
import { setCwd } from '@utils/state'

async function withEnv<T>(
  updates: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(updates)) {
    previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('/skill command', () => {
  const runnerCwd = process.cwd()
  let projectDir: string
  let homeDir: string

  beforeEach(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'kode-skill-command-proj-'))
    homeDir = mkdtempSync(join(tmpdir(), 'kode-skill-command-home-'))
    await setCwd(projectDir)
  })

  afterEach(async () => {
    reloadCustomCommands()
    await setCwd(runnerCwd)
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(homeDir, { recursive: true, force: true })
  })

  test('lists and shows available skills', async () => {
    await withEnv({ KODE_CONFIG_DIR: join(homeDir, '.kode') }, async () => {
      const skillDir = join(projectDir, '.kode', 'skills', 'pdf')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: pdf',
          'description: Read and summarize PDFs',
          'allowed-tools: Read Bash(pdftotext:*)',
          'model: sonnet',
          '---',
          '',
          'Use pdftotext when needed.',
        ].join('\n'),
        'utf8',
      )

      reloadCustomCommands()

      const list = await skill.call('list', {} as any)
      expect(list).toContain('Available skills (')
      expect(list).toContain('pdf')
      expect(list).toContain('Read and summarize PDFs')

      const show = await skill.call('show pdf', {} as any)
      expect(show).toContain('Callable via /pdf: yes')
      expect(show).toContain('Allowed tools: Read, Bash(pdftotext:*)')
      expect(show).toContain('Model: sonnet')
    })
  })

  test('doctor reports loaded and skipped skill directories', async () => {
    await withEnv({ KODE_CONFIG_DIR: join(homeDir, '.kode') }, async () => {
      const goodSkillDir = join(projectDir, '.kode', 'skills', 'good-skill')
      mkdirSync(goodSkillDir, { recursive: true })
      writeFileSync(
        join(goodSkillDir, 'SKILL.md'),
        [
          '---',
          'name: good-skill',
          'description: Healthy skill',
          '---',
          '',
          'Do useful work.',
        ].join('\n'),
        'utf8',
      )

      const missingFileDir = join(projectDir, '.kode', 'skills', 'missing-file')
      mkdirSync(missingFileDir, { recursive: true })

      reloadCustomCommands()

      const output = await skill.call('doctor', {} as any)
      expect(output).toContain('Loaded skills:')
      expect(output).toContain('Skipped skills: 1')
      expect(output).toContain('good-skill')
      expect(output).toContain('Missing SKILL.md or skill.md')
    })
  })
})
