import { existsSync, readdirSync, readFileSync } from 'fs'
import { basename, join } from 'path'
import { parse } from 'shell-quote'
import type { Command } from '@commands'
import {
  getCustomCommandDirectories,
  loadCustomCommands,
  parseFrontmatter,
  type CustomCommandWithScope,
} from '@services/customCommands'

type ParsedArgs = {
  json: boolean
  rest: string[]
}

type SkillDoctorIssue = {
  path: string
  status: 'loaded' | 'skipped' | 'warning'
  reason: string
}

function parseTokens(input: string): string[] {
  const parts = parse(input)
  const out: string[] = []
  for (const part of parts) {
    if (typeof part === 'string') out.push(part)
  }
  return out
}

function parseArgs(tokens: string[]): ParsedArgs {
  const rest: string[] = []
  let json = false
  for (const token of tokens) {
    if (token === '--json') {
      json = true
      continue
    }
    rest.push(token)
  }
  return { json, rest }
}

function isSkillCommand(command: CustomCommandWithScope): boolean {
  return command.type === 'prompt' && command.isSkill === true
}

function skillName(command: CustomCommandWithScope): string {
  return command.userFacingName()
}

function formatOptionalList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : '(none)'
}

function formatOptionalValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '(none)'
  return String(value)
}

function formatSkillSummary(command: CustomCommandWithScope): string {
  const callable = command.disableModelInvocation ? 'no' : 'yes'
  return [
    `${skillName(command)} (${command.scope ?? 'unknown'})`,
    `  Description: ${command.description}`,
    `  Source: ${command.source ?? 'unknown'}`,
    `  Path: ${command.filePath ?? '(unknown)'}`,
    `  Callable via /${skillName(command)}: yes`,
    `  Callable via Skill tool: ${callable}`,
    `  Allowed tools: ${formatOptionalList(command.allowedTools)}`,
    `  Model: ${formatOptionalValue(command.model)}`,
    `  Max thinking tokens: ${formatOptionalValue(command.maxThinkingTokens)}`,
  ].join('\n')
}

async function loadSkills(): Promise<CustomCommandWithScope[]> {
  const commands = await loadCustomCommands()
  return commands.filter(isSkillCommand).sort((a, b) => {
    const left = skillName(a)
    const right = skillName(b)
    return left.localeCompare(right)
  })
}

async function handleList(json: boolean): Promise<string> {
  const skills = await loadSkills()
  if (json) return JSON.stringify(skills.map(skillToJson), null, 2)
  if (skills.length === 0) return 'No skills available'

  const lines = [`Available skills (${skills.length}):`]
  for (const skill of skills) {
    lines.push(
      `  - ${skillName(skill)} (${skill.scope ?? 'unknown'}${skill.source ? `, ${skill.source}` : ''})`,
    )
    lines.push(`    ${skill.description}`)
    if (skill.filePath) lines.push(`    Path: ${skill.filePath}`)
  }
  return lines.join('\n')
}

async function handleShow(name: string | undefined, json: boolean) {
  if (!name) return 'Usage: /skill show <name> [--json]'
  const skills = await loadSkills()
  const skill = skills.find(
    item => item.name === name || item.userFacingName() === name,
  )
  if (!skill) return `Unknown skill: ${name}`
  if (json) return JSON.stringify(skillToJson(skill), null, 2)
  return formatSkillSummary(skill)
}

async function handleDoctor(json: boolean): Promise<string> {
  const skills = await loadSkills()
  const loadedPaths = new Set(
    skills.map(skill => skill.filePath).filter((path): path is string => !!path),
  )
  const issues = inspectSkillDirectories(loadedPaths)
  const skipped = issues.filter(issue => issue.status === 'skipped')
  const warnings = issues.filter(issue => issue.status === 'warning')

  const result = {
    loadedSkills: skills.map(skillToJson),
    inspected: issues,
    summary: {
      loaded: skills.length,
      skipped: skipped.length,
      warnings: warnings.length,
    },
  }

  if (json) return JSON.stringify(result, null, 2)

  const lines: string[] = []
  lines.push('Skill doctor:')
  lines.push(`  Loaded skills: ${skills.length}`)
  lines.push(`  Skipped skills: ${skipped.length}`)
  lines.push(`  Warnings: ${warnings.length}`)

  if (skills.length > 0) {
    lines.push('', 'Loaded:')
    for (const skill of skills) {
      lines.push(`  - ${skillName(skill)}: ${skill.filePath ?? '(unknown)'}`)
    }
  }

  if (issues.length > 0) {
    lines.push('', 'Inspected skill files:')
    for (const issue of issues) {
      lines.push(`  - ${issue.status}: ${issue.path}`)
      lines.push(`    ${issue.reason}`)
    }
  }

  return lines.join('\n')
}

function inspectSkillDirectories(loadedPaths: Set<string>): SkillDoctorIssue[] {
  const dirs = getCustomCommandDirectories()
  const skillRoots = [
    dirs.projectClaudeSkills,
    dirs.projectKodeSkills,
    dirs.userClaudeSkills,
    dirs.userKodeSkills,
  ]

  const issues: SkillDoctorIssue[] = []
  for (const root of skillRoots) {
    if (!existsSync(root)) continue
    let entries
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch (error) {
      issues.push({
        path: root,
        status: 'warning',
        reason: `Could not read skill directory: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const skillDir = join(root, entry.name)
      const skillFileCandidates = [
        join(skillDir, 'SKILL.md'),
        join(skillDir, 'skill.md'),
      ]
      const skillFile = skillFileCandidates.find(path => existsSync(path))
      if (!skillFile) {
        issues.push({
          path: skillDir,
          status: 'skipped',
          reason: 'Missing SKILL.md or skill.md',
        })
        continue
      }

      const validation = validateSkillFile(skillFile, entry.name)
      if (validation) {
        issues.push(validation)
        continue
      }

      issues.push({
        path: skillFile,
        status: loadedPaths.has(skillFile) ? 'loaded' : 'warning',
        reason: loadedPaths.has(skillFile)
          ? 'Loaded successfully'
          : 'Valid-looking skill file was not present in active skill registry; check duplicate names or strict mode',
      })
    }
  }
  return issues
}

function validateSkillFile(
  filePath: string,
  dirName: string,
): SkillDoctorIssue | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dirName)) {
    return {
      path: filePath,
      status: 'warning',
      reason:
        'Skill directory name should be lowercase kebab-case (a-z, 0-9, hyphen)',
    }
  }

  try {
    const raw = readFileSync(filePath, 'utf8')
    const { frontmatter } = parseFrontmatter(raw)
    const declaredName =
      typeof (frontmatter as any).name === 'string'
        ? String((frontmatter as any).name).trim()
        : ''
    if (declaredName && declaredName !== dirName) {
      return {
        path: filePath,
        status: process.env.KODE_SKILLS_STRICT ? 'skipped' : 'warning',
        reason: `Frontmatter name "${declaredName}" does not match directory "${dirName}"`,
      }
    }
    const description =
      typeof frontmatter.description === 'string'
        ? frontmatter.description.trim()
        : ''
    if (process.env.KODE_SKILLS_STRICT && !description) {
      return {
        path: filePath,
        status: 'skipped',
        reason: 'Strict mode requires a non-empty description',
      }
    }
    if (description.length > 1024) {
      return {
        path: filePath,
        status: process.env.KODE_SKILLS_STRICT ? 'skipped' : 'warning',
        reason: 'Description is longer than 1024 characters',
      }
    }
  } catch (error) {
    return {
      path: filePath,
      status: 'skipped',
      reason: `Could not parse skill file: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  return null
}

function skillToJson(command: CustomCommandWithScope) {
  return {
    name: skillName(command),
    description: command.description,
    source: command.source,
    scope: command.scope,
    filePath: command.filePath,
    allowedTools: command.allowedTools ?? [],
    model: command.model,
    maxThinkingTokens: command.maxThinkingTokens,
    slashCallable: true,
    skillToolCallable: command.disableModelInvocation !== true,
    disableModelInvocation: command.disableModelInvocation === true,
    whenToUse: command.whenToUse,
    version: command.version,
  }
}

export async function runSkillCommand(args: string): Promise<string> {
  const tokens = parseTokens(args)
  const parsed = parseArgs(tokens)
  const [subcommand, ...rest] = parsed.rest

  if (!subcommand || subcommand === 'list') {
    return await handleList(parsed.json)
  }

  if (subcommand === 'show') {
    return await handleShow(rest[0], parsed.json)
  }

  if (subcommand === 'doctor') {
    return await handleDoctor(parsed.json)
  }

  return [
    `Unknown /skill subcommand: ${subcommand}`,
    'Usage:',
    '  /skill list [--json]',
    '  /skill show <name> [--json]',
    '  /skill doctor [--json]',
  ].join('\n')
}

const skill = {
  type: 'local',
  name: 'skill',
  description: 'Inspect available skills',
  isEnabled: true,
  isHidden: false,
  async call(args: string) {
    return await runSkillCommand(args)
  },
  userFacingName() {
    return 'skill'
  },
} satisfies Command

export default skill
