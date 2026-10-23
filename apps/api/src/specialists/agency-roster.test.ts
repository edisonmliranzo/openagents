import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AGENCY_ROSTER, PERSONA_SECTIONS, SPECIALIST_ROLES } from './agency-roster.ts'

test('agency roster: every entry is structurally valid', () => {
  assert.ok(AGENCY_ROSTER.length >= 12, 'roster should offer a meaningful catalog (>= 12 entries)')
  for (const entry of AGENCY_ROSTER) {
    assert.ok(entry.slug.length > 2, `slug too short: ${entry.slug}`)
    assert.ok(/^[a-z0-9-]+$/.test(entry.slug), `slug must be kebab-case: ${entry.slug}`)
    assert.ok(entry.name.length > 2 && entry.name.length <= 60, `name must fit create() limit: ${entry.name}`)
    assert.ok(SPECIALIST_ROLES.includes(entry.role), `role must be a supported specialist role: ${entry.slug}`)
    assert.ok(entry.division.trim().length > 0, `division required: ${entry.slug}`)
    assert.ok(entry.tagline.trim().length > 8, `tagline required: ${entry.slug}`)
    assert.ok(
      entry.defaultMonthlyBudgetUsd > 0 && entry.defaultMonthlyBudgetUsd <= 1000,
      `budget out of range: ${entry.slug}`,
    )
  }
})

test('agency roster: slugs and names are unique', () => {
  const slugs = AGENCY_ROSTER.map((e) => e.slug)
  const names = AGENCY_ROSTER.map((e) => e.name.toLowerCase())
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate slug found')
  assert.equal(new Set(names).size, names.length, 'duplicate name found')
})

test('agency roster: personas follow the five-section persona contract', () => {
  for (const entry of AGENCY_ROSTER) {
    const p = entry.personaPrompt
    assert.equal(p, p.trim(), `persona must be trimmed: ${entry.slug}`)
    assert.ok(p.length > 400, `persona too thin (<400 chars): ${entry.slug}`)
    assert.ok(p.length <= 4000, `persona exceeds create() limit of 4000: ${entry.slug}`)
    for (const section of PERSONA_SECTIONS) {
      assert.ok(p.includes(section), `persona missing "${section}": ${entry.slug}`)
    }
  }
})

test('agency roster: roles cover the full specialist role spectrum', () => {
  const used = new Set(AGENCY_ROSTER.map((e) => e.role))
  for (const role of SPECIALIST_ROLES) {
    assert.ok(used.has(role), `roster should include at least one ${role}`)
  }
})
