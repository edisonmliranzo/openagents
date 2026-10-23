import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { NormalizeNaNPipe } from './normalize-nan.pipe.ts'

const pipe = new NormalizeNaNPipe()

test('an absent numeric query param arrives as NaN and is normalized back to undefined', () => {
  // This is exactly what Nest's ValidationPipe produces for `@Query('limit') limit?: number`
  // when the parameter is not supplied: `+undefined` === NaN.
  const nestResult = +undefined
  assert.ok(Number.isNaN(nestResult))
  assert.equal(pipe.transform(nestResult), undefined)
})

test('valid numbers and zero are left untouched', () => {
  assert.equal(pipe.transform(25), 25)
  assert.equal(pipe.transform(0), 0)
  assert.equal(pipe.transform(-3), -3)
  assert.equal(pipe.transform(1.5), 1.5)
})

test('non-numeric values pass through unchanged', () => {
  assert.equal(pipe.transform('hello'), 'hello')
  assert.equal(pipe.transform(undefined), undefined)
  assert.equal(pipe.transform(null), null)
  const body = { a: 1 }
  assert.equal(pipe.transform(body), body)
})

test('Infinity is not treated as NaN', () => {
  assert.equal(pipe.transform(Infinity), Infinity)
})
