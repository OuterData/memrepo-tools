#!/usr/bin/env node
// memrepo validate — lints a memrepo's layout and frontmatter against
// memrepo-spec's SPEC.md. Collects every error before exiting (not just
// the first) so one run gives the full picture.

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const errors = []

function fail(file, msg) {
  errors.push(`${file}: ${msg}`)
}

function readYamlFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  try {
    return yaml.load(match[1])
  } catch (e) {
    fail(filePath, `frontmatter is not valid YAML: ${e.message}`)
    return null
  }
}

function requireKeys(filePath, obj, keys) {
  if (!obj || typeof obj !== 'object') {
    fail(filePath, 'has no parseable frontmatter/content')
    return
  }
  for (const k of keys) {
    if (!(k in obj)) fail(filePath, `missing required key "${k}"`)
  }
}

function validateManifest(repoRoot) {
  const p = path.join(repoRoot, 'manifest.yaml')
  if (!fs.existsSync(p)) {
    fail(p, 'manifest.yaml is required at repo root and is missing')
    return
  }
  let doc
  try {
    doc = yaml.load(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    fail(p, `not valid YAML: ${e.message}`)
    return
  }
  requireKeys(p, doc, ['memrepo_version', 'owner', 'created', 'store_transcripts'])
  if (doc && typeof doc.memrepo_version !== 'undefined' && typeof doc.memrepo_version !== 'string') {
    fail(p, 'memrepo_version must be a string')
  }
  if (doc && typeof doc.store_transcripts !== 'undefined' && typeof doc.store_transcripts !== 'boolean') {
    fail(p, 'store_transcripts must be a boolean')
  }
}

function validateBriefing(filePath) {
  const fm = readYamlFrontmatter(filePath)
  if (fm === null) return
  requireKeys(filePath, fm, ['version', 'updated', 'sources'])
  if (fm.version !== undefined && typeof fm.version !== 'number') {
    fail(filePath, 'version must be a number')
  }
  if (fm.sources !== undefined && !Array.isArray(fm.sources)) {
    fail(filePath, 'sources must be an array')
  }
}

function validateRules(filePath) {
  let doc
  try {
    doc = yaml.load(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    fail(filePath, `not valid YAML: ${e.message}`)
    return
  }
  if (!Array.isArray(doc)) {
    fail(filePath, 'rules.yaml must be a YAML array')
    return
  }
  const seenIds = new Set()
  const validTiers = ['prose', 'assertion', 'gate']
  const validOnFail = ['block', 'warn']
  doc.forEach((entry, i) => {
    const label = `${filePath} [entry ${i}]`
    requireKeys(label, entry, ['id', 'rule', 'tier', 'scope', 'origin', 'on_fail'])
    if (!entry) return
    if (entry.id && seenIds.has(entry.id)) fail(label, `duplicate id "${entry.id}" within this file`)
    if (entry.id) seenIds.add(entry.id)
    if (entry.tier && !validTiers.includes(entry.tier)) {
      fail(label, `tier "${entry.tier}" must be one of: ${validTiers.join(', ')}`)
    }
    if (entry.tier === 'gate' && !entry.check) {
      fail(label, 'tier "gate" requires a "check" command')
    }
    if (entry.tier !== 'gate' && entry.check) {
      fail(label, `"check" is only valid for tier "gate", found on tier "${entry.tier}"`)
    }
    if (entry.scope && !Array.isArray(entry.scope)) {
      fail(label, 'scope must be an array of glob patterns')
    }
    if (entry.on_fail && !validOnFail.includes(entry.on_fail)) {
      fail(label, `on_fail "${entry.on_fail}" must be one of: ${validOnFail.join(', ')}`)
    }
  })
}

function validateSession(filePath) {
  const fm = readYamlFrontmatter(filePath)
  if (fm === null) return
  requireKeys(filePath, fm, ['started', 'ended', 'outcome'])
  const validOutcomes = ['complete', 'abandoned', 'escalated']
  if (fm.outcome && !validOutcomes.includes(fm.outcome)) {
    fail(filePath, `outcome "${fm.outcome}" must be one of: ${validOutcomes.join(', ')}`)
  }
}

function validateSkill(filePath) {
  const fm = readYamlFrontmatter(filePath)
  if (fm === null) return
  requireKeys(filePath, fm, ['confidence', 'evidence_count', 'status', 'source', 'last_reinforced'])
  if (typeof fm.confidence === 'number' && (fm.confidence < 0 || fm.confidence > 1)) {
    fail(filePath, 'confidence must be between 0 and 1')
  }
  if (typeof fm.evidence_count === 'number' && fm.evidence_count < 1) {
    fail(filePath, 'evidence_count must be >= 1')
  }
  const validStatus = ['active', 'quarantined', 'retired']
  if (fm.status && !validStatus.includes(fm.status)) {
    fail(filePath, `status "${fm.status}" must be one of: ${validStatus.join(', ')}`)
  }
  const validSource = ['tandem', 'session', 'manual']
  if (fm.source && !validSource.includes(fm.source)) {
    fail(filePath, `source "${fm.source}" must be one of: ${validSource.join(', ')}`)
  }
}

function walkMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMarkdownFiles(full))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

function validateProjects(repoRoot) {
  const projectsDir = path.join(repoRoot, 'projects')
  if (!fs.existsSync(projectsDir)) return // valid — no projects yet

  for (const slugEntry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!slugEntry.isDirectory()) continue
    const projectDir = path.join(projectsDir, slugEntry.name)

    const briefing = path.join(projectDir, 'briefing.md')
    if (fs.existsSync(briefing)) validateBriefing(briefing)

    const rules = path.join(projectDir, 'rules.yaml')
    if (fs.existsSync(rules)) validateRules(rules)

    const sessionsDir = path.join(projectDir, 'sessions')
    if (fs.existsSync(sessionsDir)) {
      for (const monthEntry of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
        if (!monthEntry.isDirectory()) continue
        const monthDir = path.join(sessionsDir, monthEntry.name)
        for (const f of fs.readdirSync(monthDir)) {
          if (f.endsWith('.md')) validateSession(path.join(monthDir, f))
        }
      }
    }
  }
}

function validateSkills(repoRoot) {
  const skillsDir = path.join(repoRoot, 'skills')
  if (!fs.existsSync(skillsDir)) return // valid — no skills yet
  for (const f of walkMarkdownFiles(skillsDir)) validateSkill(f)
}

function main() {
  const repoRoot = process.argv[2]
  if (!repoRoot) {
    console.error('Usage: memrepo validate <path-to-memrepo>')
    process.exit(1)
  }
  if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
    console.error(`${repoRoot}: not a directory`)
    process.exit(1)
  }

  validateManifest(repoRoot)
  validateProjects(repoRoot)
  validateSkills(repoRoot)
  // /inbox/ is deliberately unvalidated — format is engine-defined (SPEC.md §5).

  if (errors.length > 0) {
    console.error(`memrepo validate: ${errors.length} error(s)\n`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(`memrepo validate: ${repoRoot} — OK`)
}

main()
