const apiBaseInput = document.getElementById('apiBase')
const tokenInput = document.getElementById('token')
const conversationIdInput = document.getElementById('conversationId')
const defaultNoteInput = document.getElementById('defaultNote')
const saveBtn = document.getElementById('saveBtn')
const resetBtn = document.getElementById('resetBtn')
const statusEl = document.getElementById('status')

const DEFAULTS = {
  apiBase: 'http://localhost:3001',
  token: '',
  conversationId: '',
  defaultNote: '',
}

init().catch(() => showStatus('Failed to load options.', true))

saveBtn.addEventListener('click', async () => {
  const payload = {
    apiBase: normalizeApiBase(apiBaseInput.value),
    token: tokenInput.value.trim(),
    conversationId: conversationIdInput.value.trim(),
    defaultNote: defaultNoteInput.value.trim(),
  }

  await chrome.storage.sync.set(payload)
  showStatus('Saved.')
})

resetBtn.addEventListener('click', async () => {
  apiBaseInput.value = DEFAULTS.apiBase
  tokenInput.value = ''
  conversationIdInput.value = ''
  defaultNoteInput.value = ''
  await chrome.storage.sync.set(DEFAULTS)
  showStatus('Reset to defaults.')
})

async function init() {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  apiBaseInput.value = normalizeApiBase(stored.apiBase)
  tokenInput.value = `${stored.token ?? ''}`.trim()
  conversationIdInput.value = `${stored.conversationId ?? ''}`.trim()
  defaultNoteInput.value = `${stored.defaultNote ?? ''}`.trim()
}

function normalizeApiBase(value) {
  const trimmed = `${value ?? ''}`.trim()
  if (!trimmed) return DEFAULTS.apiBase
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

function showStatus(message, isError = false) {
  statusEl.textContent = message
  statusEl.style.color = isError ? '#b91c1c' : '#0f766e'
  window.setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = ''
  }, 2200)
}
