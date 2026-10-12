import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMissionDue, nextRunAfter, planCompensation, mergeGraph, normalizeEntityType } from './autonomy-logic.ts'

test('mission is due when nextRunAt passed', () => {
  const now = new Date('2026-10-12T10:00:00Z')
  assert.equal(isMissionDue({ status: 'active', intervalHours: 24, lastRunAt: null, nextRunAt: new Date('2026-10-12T09:00:00Z') }, now), true)
})

test('mission not due before nextRunAt or when paused', () => {
  const now = new Date('2026-10-12T10:00:00Z')
  assert.equal(isMissionDue({ status: 'active', intervalHours: 24, lastRunAt: null, nextRunAt: new Date('2026-10-12T11:00:00Z') }, now), false)
  assert.equal(isMissionDue({ status: 'paused', intervalHours: 24, lastRunAt: null, nextRunAt: new Date('2026-10-12T09:00:00Z') }, now), false)
})

test('mission without nextRunAt is due immediately', () => {
  assert.equal(isMissionDue({ status: 'active', intervalHours: 24, lastRunAt: null, nextRunAt: null }), true)
})

test('nextRunAfter adds clamped interval', () => {
  const now = new Date('2026-10-12T10:00:00Z')
  assert.equal(nextRunAfter(now, 2).toISOString(), '2026-10-12T12:00:00.000Z')
  assert.equal(nextRunAfter(now, 0).toISOString(), '2026-10-13T10:00:00.000Z') // 0 falls back to the 24h default
  assert.equal(nextRunAfter(now, 99999).toISOString(), '2026-11-11T10:00:00.000Z')
})

test('compensation maps created notes to delete by id', () => {
  const c = planCompensation('notes_create', { title: 'x' }, '{"id":"n1","ok":true}')
  assert.deepEqual(c, { tool: 'notes_delete', input: { id: 'n1' } })
})

test('compensation is null for unknown tools or missing ids', () => {
  assert.equal(planCompensation('web_search', {}, 'results'), null)
  assert.equal(planCompensation('notes_create', {}, '{"ok":true}'), null)
})

test('mergeGraph dedupes nodes case-insensitively and links edges', () => {
  const g = mergeGraph(
    [
      { name: 'Acme', type: 'company', summary: '' },
      { name: 'acme', type: 'Company', summary: 'the corp' },
      { name: 'Edison', type: 'person' },
    ],
    [{ from: 'Edison', to: 'ACME', relation: 'Works At' }],
  )
  assert.equal(g.nodes.length, 2)
  const acme = g.nodes.find((n) => n.name === 'Acme')
  assert.equal(acme.type, 'company')
  assert.equal(acme.summary, 'the corp')
  assert.deepEqual(g.edges, [{ from: 'Edison', to: 'Acme', relation: 'works at' }])
})

test('mergeGraph drops self loops and unknown name edges', () => {
  const g = mergeGraph([{ name: 'A', type: 'topic' }], [
    { from: 'A', to: 'A', relation: 'same' },
    { from: 'A', to: 'Ghost', relation: 'x' },
  ])
  assert.equal(g.edges.length, 0)
})

test('normalizeEntityType falls back to other', () => {
  assert.equal(normalizeEntityType('PERSON'), 'person')
  assert.equal(normalizeEntityType('_spaceship'), 'other')
})
