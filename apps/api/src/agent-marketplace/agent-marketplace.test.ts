import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  domainAllowed,
  extractUrlsFromInput,
  inferToolDataScope,
  isSubset,
  manifestHash,
  validateAndNormalizeManifest,
} from './marketplace-permissions.ts'

describe('AgentMarketplace permission & manifest helpers', () => {
  it('isSubset returns true only when every granted item is in the manifest', () => {
    assert.equal(isSubset(['web_search'], ['web_search', 'web_fetch']), true)
    assert.equal(isSubset(['web_search', 'shell_execute'], ['web_search']), false)
  })

  it('domainAllowed matches exact domains and wildcard subdomains safely', () => {
    const allowed = ['api.github.com', '*.example.com']
    assert.equal(domainAllowed('api.github.com', allowed), true)
    assert.equal(domainAllowed('sub.example.com', allowed), true)
    assert.equal(domainAllowed('example.com', allowed), false)
    assert.equal(domainAllowed('evil-example.com', allowed), false)
  })

  it('inferToolDataScope maps connector and memory tools to declared data scopes', () => {
    assert.equal(inferToolDataScope('gmail_search'), 'email:read')
    assert.equal(inferToolDataScope('calendar_get_availability'), 'calendar:read')
    assert.equal(inferToolDataScope('memory_search'), 'memory:read')
    assert.equal(inferToolDataScope('memory_save_preference'), 'memory:write')
    assert.equal(inferToolDataScope('get_current_time'), null)
  })

  it('extractUrlsFromInput collects unique http/https URLs from nested inputs', () => {
    const urls = extractUrlsFromInput({
      url: 'https://api.github.com/repos',
      nested: ['check http://docs.example.com/page and https://api.github.com/repos'],
    })
    assert.deepEqual(urls, ['https://api.github.com/repos', 'http://docs.example.com/page'])
  })

  it('manifestHash is deterministic and changes when version or permissions change', () => {
    const m1 = validateAndNormalizeManifest({ tools: ['web_fetch', 'web_search'], networkDomains: ['example.com'], dataScopes: [] })
    const m2 = validateAndNormalizeManifest({ tools: ['web_search', 'web_fetch'], networkDomains: ['EXAMPLE.COM'], dataScopes: [] })
    assert.equal(manifestHash('1.0.0', m1), manifestHash('1.0.0', m2))
    assert.notEqual(manifestHash('1.0.0', m1), manifestHash('1.0.1', m1))
  })
})
