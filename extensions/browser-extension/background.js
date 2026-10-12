// OpenAgents clipper: right-click any page or selection to save it as a clip.
const DEFAULTS = { apiBase: 'http://localhost:3000', token: '' }

async function getConfig() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(['apiBase', 'token'])) }
}

async function clip(kind, text, sourceUrl) {
  const { apiBase, token } = await getConfig()
  if (!token) {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title: 'OpenAgents', message: 'Set your agent API token in the extension options (toolbar icon).' })
    return
  }
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/v1/life/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
    body: JSON.stringify({ kind, text, sourceUrl }),
  })
  if (res.ok) {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title: 'Saved to your agent', message: 'Find it in Autonomy > Clips.' })
  } else {
    const body = await res.text().catch(() => '')
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title: 'Clip failed', message: String(res.status) + ' ' + body.slice(0, 120) })
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'oa-clip-selection', title: 'Save selection to OpenAgents', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'oa-clip-page', title: 'Save page to OpenAgents', contexts: ['page'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'oa-clip-selection') {
    await clip('text', String(info.selectionText ?? ''), info.pageUrl)
  } else if (info.menuItemId === 'oa-clip-page') {
    const title = tab?.title ? tab.title + '\n\n' : ''
    await clip('link', title + 'Saved from: ' + (info.pageUrl ?? ''), info.pageUrl)
  }
})

chrome.commands?.onCommand?.addListener?.(() => {})
