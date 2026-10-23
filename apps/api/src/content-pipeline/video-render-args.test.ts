import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VIDEO_ORIENTATIONS,
  buildRenderArgs,
  escapeDrawText,
  resolveOrientation,
  truncateTitle,
} from './video-render-args.ts'

test('resolveOrientation accepts known values, falls back to vertical', () => {
  assert.equal(resolveOrientation('vertical'), 'vertical')
  assert.equal(resolveOrientation('LANDSCAPE'), 'landscape')
  assert.equal(resolveOrientation('square'), 'square')
  assert.equal(resolveOrientation('diagonal'), 'vertical')
  assert.equal(resolveOrientation(undefined), 'vertical')
})

test('escapeDrawText survives ffmpeg-hostile characters', () => {
  assert.equal(escapeDrawText(`It's 100% done: ship it`), `It\\'s 100\\% done\\: ship it`)
  assert.equal(escapeDrawText('back\\slash'), 'back\\\\slash')
  assert.equal(escapeDrawText('two\r\nlines'), 'two lines')
})

test('truncateTitle clamps long titles with an ellipsis', () => {
  assert.equal(truncateTitle('short'), 'short')
  const long = 'x'.repeat(120)
  const out = truncateTitle(long, 90)
  assert.equal(out.length, 90)
  assert.ok(out.endsWith('...'))
})

test('buildRenderArgs: image background + audio + title filter', () => {
  const args = buildRenderArgs({
    orientation: 'vertical',
    audioPath: 'C:/tmp/narration.mp3',
    outputPath: 'C:/tmp/out.mp4',
    backgroundImagePath: 'C:/tmp/bg.png',
    titleText: "Today's topic: AI agents",
  })
  assert.ok(args.includes('-loop'))
  assert.ok(args.includes('C:/tmp/bg.png'))
  assert.ok(args.includes('C:/tmp/narration.mp3'))
  assert.ok(args.includes('-shortest'))
  assert.ok(args.some((a) => a.includes('drawtext=text=')))
  assert.ok(args.includes('-s'), 'explicit size for orientation')
  assert.ok(args.includes('1080x1920'))
  assert.equal(args[args.length - 1], 'C:/tmp/out.mp4')
})

test('buildRenderArgs: no image -> lavfi solid color input, no drawtext', () => {
  const args = buildRenderArgs({
    orientation: 'square',
    audioPath: 'a.mp3',
    outputPath: 'out.mp4',
    titleText: null,
  })
  const lavfi = args.findIndex((a) => a.startsWith('color=c='))
  assert.ok(lavfi !== -1, 'has lavfi color input')
  assert.ok(args[lavfi].includes('1080x1080'))
  assert.ok(!args.some((a) => a.includes('drawtext')))
})

test('buildRenderArgs: invalid fallback color falls back to default, orientation dims always set', () => {
  for (const orientation of Object.keys(VIDEO_ORIENTATIONS)) {
    const args = buildRenderArgs({
      orientation: orientation as any,
      audioPath: 'a.mp3',
      outputPath: 'out.mp4',
      fallbackColor: 'not-a-color',
    })
    const dims = VIDEO_ORIENTATIONS[orientation as keyof typeof VIDEO_ORIENTATIONS]
    assert.ok(args.includes(`${dims.width}x${dims.height}`), `${orientation} dims present`)
    assert.ok(args.some((a) => a === 'color=c=0x111827:s=' + `${dims.width}x${dims.height}` + ':r=30') || args.some((a) => String(a).startsWith('color=c=')), 'default color used')
  }
})
