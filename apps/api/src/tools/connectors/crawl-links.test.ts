import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractLinks,
  extractPageTitle,
  extractTextFromHtml,
  normalizeCrawlUrl,
} from './crawl-links.ts'

test('normalizeCrawlUrl resolves, strips fragments, rejects non-http schemes', () => {
  assert.equal(normalizeCrawlUrl('/docs/intro', 'https://example.com/guide/'), 'https://example.com/docs/intro')
  assert.equal(normalizeCrawlUrl('https://example.com/page#section'), 'https://example.com/page')
  assert.equal(normalizeCrawlUrl('mailto:hi@example.com'), null)
  assert.equal(normalizeCrawlUrl('javascript:void(0)'), null)
  assert.equal(normalizeCrawlUrl('ftp://example.com/file'), null)
  assert.equal(normalizeCrawlUrl('not a url at all', 'definitely not a base'), null)
})

test('extractLinks keeps only same-origin crawlable pages, deduped, order preserved', () => {
  const html = `
    <a href="/a">first</a>
    <a href="https://elsewhere.com/x">external</a>
    <a href="/a#top">same page as first (fragment stripped)</a>
    <a href="b.html">relative</a>
    <a href="/img/logo.png">binary</a>
    <a href="/doc.pdf">binary</a>
    <a href="mailto:x@y.z">not http</a>
    <a href="/a">exact dupe</a>
    <a href="https://example.com/z?query=1">absolute same-origin</a>
  `
  const links = extractLinks(html, 'https://example.com/start')
  assert.deepEqual(links, [
    'https://example.com/a',
    'https://example.com/b.html',
    'https://example.com/z?query=1',
  ])
})

test('extractLinks caps output at maxLinks', () => {
  const html = Array.from({ length: 50 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join(' ')
  const links = extractLinks(html, 'https://example.com/', 10)
  assert.equal(links.length, 10)
})

test('extractPageTitle reads and cleans the title', () => {
  assert.equal(extractPageTitle('<html><head><title>  Hello   World </title></head></html>'), 'Hello World')
  assert.equal(extractPageTitle('<p>no title here</p>'), '')
})

test('extractTextFromHtml strips scripts, styles, and tags', () => {
  const html = `
    <style>.x { color: red }</style>
    <script>console.log('should not appear')</script>
    <h1>Real   heading</h1>
    <p>Body text</p>
    <!-- a comment -->
  `
  const text = extractTextFromHtml(html)
  assert.ok(!text.includes('should not appear'))
  assert.ok(!text.includes('color: red'))
  assert.ok(!text.includes('a comment'))
  assert.ok(text.includes('Real heading'))
  assert.ok(text.includes('Body text'))
})
