import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMd, toIndexEntry } from './skillmd-parser.ts'

const sample = `---
name: Weekly Report Builder
description: Compiles metrics from connected accounts into a shareable weekly report.
---

## Workflow

1. Gather the week's metrics from the connected accounts
- Draft the summary section first
* Format the report with headers for each metric
3. Save the result to the library

## Notes

Free-form guidance lives here.
`

test('parseSkillMd: frontmatter, slug name, description, steps', () => {
  const parsed = parseSkillMd(sample)
  assert.ok(parsed)
  assert.equal(parsed!.name, 'weekly-report-builder')
  assert.equal(parsed!.description, 'Compiles metrics from connected accounts into a shareable weekly report.')
  assert.equal(parsed!.steps.length, 4)
  assert.ok(parsed!.steps[0].includes("Gather the week's metrics"))
  assert.ok(parsed!.body.includes('## Notes'))
})

test('parseSkillMd: heading fallback when no frontmatter', () => {
  const parsed = parseSkillMd('# Deploy Guide\n\nFirst do this thing.\n\n- step one here\n- step two here')
  assert.ok(parsed)
  assert.equal(parsed!.name, 'deploy-guide')
  assert.equal(parsed!.description, 'First do this thing.')
  assert.equal(parsed!.steps.length, 2)
})

test('parseSkillMd: rejects empty and step-less content', () => {
  assert.equal(parseSkillMd(''), null)
  assert.equal(parseSkillMd('   '), null)
  const noName = parseSkillMd('just prose with no heading or frontmatter at all')
  assert.ok(noName === null || noName.name === '')
})

test('parseSkillMd: consecutive duplicates collapse, list capped at 15, one-step lists normalize away', () => {
  const withDupes = '# Test Skill\n\n- step a\n- step a\n- step a\n- step b\n- step b'
  const parsed = parseSkillMd(withDupes)
  assert.ok(parsed)
  assert.deepEqual(parsed!.steps, ['step a', 'step b'], 'consecutive identical steps collapse')
  const capped = parseSkillMd(`# Test Skill\n\n${Array.from({ length: 40 }, (_, i) => `- unique step number ${i}`).join('\n')}`)
  assert.ok(capped)
  assert.ok(capped!.steps.length <= 15, `capped: got ${capped!.steps.length}`)
  const single = parseSkillMd('# Test Skill\n\n- only one step in the whole file')
  assert.ok(single)
  assert.deepEqual(single!.steps, [], 'a single bullet is not a procedure — normalized to []')
})

test('toIndexEntry: compact manifest shape', () => {
  const entry = toIndexEntry({
    catalogId: 'cro',
    tags: ['marketing'],
    version: '1.0.0',
    sourceUrl: 'https://example.com',
    publishedAt: '2026-10-24T00:00:00.000Z',
    manifest: { title: 'CRO', description: 'Optimize conversions', tools: ['web_fetch'] },
  })
  assert.equal(entry.catalogId, 'cro')
  assert.equal(entry.title, 'CRO')
  assert.deepEqual(entry.tools, ['web_fetch'])
  assert.equal(entry.updatedAt, '2026-10-24T00:00:00.000Z')
})
