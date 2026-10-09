import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePlan, parseVerdict, isSideEffectTool, isPlaceholderAnswer, missingRequired, extractJson } from './task-plan.ts'

const tools = new Set(['web_search', 'web_fetch', 'gmail_send_draft', 'notes_create'])

test('valid plan keeps known tools and llm steps in order', () => {
  const raw = '{"steps":[{"kind":"tool","tool":"web_search","input":{"query":"x"},"instruction":"find sources"},{"kind":"llm","instruction":"write summary"}]}'
  const { steps, errors } = parsePlan(raw, tools, 10)
  assert.equal(errors.length, 0)
  assert.equal(steps.length, 2)
  assert.equal(steps[0].tool, 'web_search')
  assert.equal(steps[1].kind, 'llm')
})

test('unknown tools are rejected, not silently substituted', () => {
  const raw = '{"steps":[{"kind":"tool","tool":"hack_the_planet","instruction":"do it"}]}'
  const { steps, errors } = parsePlan(raw, tools, 10)
  assert.equal(steps.length, 0)
  assert.ok(errors[0].includes('unavailable tool'))
})

test('step count is capped and garbage input yields no steps', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'llm', instruction: `step ${i}` }))
  assert.equal(parsePlan(JSON.stringify({ steps: many }), tools, 5).steps.length, 5)
  assert.equal(parsePlan('not json at all', tools, 5).steps.length, 0)
})

test('side-effect tools are classified for approval', () => {
  assert.equal(isSideEffectTool('gmail_send_draft'), true)
  assert.equal(isSideEffectTool('notes_create'), true)
  assert.equal(isSideEffectTool('web_search'), false)
  assert.equal(isSideEffectTool('web_fetch'), false)
})

test('tool name in "kind" is recognized as a tool step (real model output)', () => {
  const raw = '{"steps": [{"kind": "web_search", "tool": "web_search", "input": {"query": "ollama"}}, {"kind": "llm", "instruction": "write summary"}]}'
  const { steps, errors } = parsePlan(raw, tools, 6)
  assert.equal(errors.length, 0)
  assert.equal(steps[0].kind, 'tool')
  assert.equal(steps[0].tool, 'web_search')
  assert.equal(steps[1].kind, 'llm')
})

test('truncated planner output keeps every complete step', () => {
  const raw = '{"steps":[{"kind":"llm","instruction":"first step"},{"kind":"llm","instruction":"second step"},{"kind":"llm","instruction":"third st'
  const { steps, errors } = parsePlan(raw, tools, 10)
  assert.equal(errors.length, 0)
  assert.equal(steps.length, 2)
  assert.equal(steps[1].instruction, 'second step')
})

test('bare-steps-array output from the planner is accepted (real failure case)', () => {
  const raw = '```json\n[\n  {"kind": "web_search", "tool": "web_search", "input": {"query": "ollama"}},\n  {"kind": "llm", "instruction": "write summary"}\n]\n```'
  const parsed: any = extractJson(raw)
  assert.ok(Array.isArray(parsed), 'extractJson should surface a bare array too')
  const { steps, errors } = parsePlan(raw, tools, 6)
  assert.equal(errors.length, 0)
  assert.equal(steps.length, 2)
})

test('code fences and trailing commas are tolerated', () => {
  const raw = '```json\n{"steps": [{"kind": "llm", "instruction": "one",},],}\n```'
  const { steps } = parsePlan(raw, tools, 6)
  assert.equal(steps.length, 1)
})

test('placeholder verdicts are never accepted as met', () => {
  const copied = parseVerdict('{"met": true, "gaps": [], "answer": "the final deliverable for the user"}')
  assert.equal(copied.met, false)
  assert.equal(isPlaceholderAnswer('the final deliverable for the user'), true)
  const real = parseVerdict('{"met": true, "gaps": [], "answer": "Ollama is a local runtime that runs open LLMs on your machine, with a simple CLI and API (https://ollama.com)."}')
  assert.equal(real.met, true)
})

test('a verdict without tool evidence cannot be met', () => {
  const v = parseVerdict('{"met": true, "gaps": [], "answer": "Ollama is a local runtime that runs open LLMs on your machine, with a simple CLI and API."}', false)
  assert.equal(v.met, false)
})

test('missing required tool inputs are detected from the schema', () => {
  const schema = { type: 'object', required: ['query'], properties: { query: { type: 'string' } } }
  assert.deepEqual(missingRequired(schema, {}), ['query'])
  assert.deepEqual(missingRequired(schema, { query: 'x' }), [])
})

test('verdict: unparseable output counts as not met', () => {
  assert.equal(parseVerdict('looks good to me').met, false)
  assert.equal(parseVerdict('{"met": true, "gaps": [], "answer": "Ollama runs open language models locally through a simple CLI and HTTP API."}').met, true)
  assert.equal(parseVerdict('{"met": false, "gaps": ["missing sources"], "answer": ""}').gaps[0], 'missing sources')
})
