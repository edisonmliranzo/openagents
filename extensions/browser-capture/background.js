const CONTEXT_MENU_ID = 'openagents-capture-selection'
const DEFAULT_API_BASE = 'http://localhost:3001'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Send selection to OpenAgents',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return
  const selection = `${info.selectionText ?? ''}`.trim()
  if (!selection) {
    notify('OpenAgents Capture', 'No text selection found.')
    return
  }

  const config = await readConfig()
  if (!config.token) {
    notify('OpenAgents Capture', 'Missing API token. Open extension options to configure it.')
    return
  }

  const payload = {
    url: `${tab?.url ?? ''}`.trim(),
    title: `${tab?.title ?? ''}`.trim(),
    selection,
    note: config.defaultNote || undefined,
    conversationId: config.conversationId || undefined,
  }

  try {
    const response = await fetch(`${config.apiBase}/api/v1/memory/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await safeText(response)
      notify('OpenAgents Capture', `Capture failed (${response.status}): ${text || 'unknown error'}`)
      return
    }

    const result = await response.json()
    const target = result?.conversationId ? 'memory + conversation' : 'memory'
    notify('OpenAgents Capture', `Captured to ${target}.`)
  } catch (error) {
    notify('OpenAgents Capture', `Capture request failed: ${error?.message ?? error}`)
  }
})

async function readConfig() {
  const stored = await chrome.storage.sync.get({
    apiBase: DEFAULT_API_BASE,
    token: '',
    conversationId: '',
    defaultNote: '',
  })
  return {
    apiBase: normalizeApiBase(stored.apiBase),
    token: `${stored.token ?? ''}`.trim(),
    conversationId: `${stored.conversationId ?? ''}`.trim(),
    defaultNote: `${stored.defaultNote ?? ''}`.trim(),
  }
}

function normalizeApiBase(value) {
  const trimmed = `${value ?? ''}`.trim()
  if (!trimmed) return DEFAULT_API_BASE
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

async function safeText(response) {
  try {
    const text = await response.text()
    return text.slice(0, 240)
  } catch {
    return ''
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    title,
    message,
  })
}
