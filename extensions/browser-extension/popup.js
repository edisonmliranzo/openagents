const apiBase = document.getElementById('apiBase')
const token = document.getElementById('token')
const ok = document.getElementById('ok')
chrome.storage.local.get(['apiBase', 'token']).then((cfg) => {
  apiBase.value = cfg.apiBase || 'http://localhost:3000'
  token.value = cfg.token || ''
})
document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ apiBase: apiBase.value.trim(), token: token.value.trim() })
  ok.style.display = 'block'
  setTimeout(() => window.close(), 700)
})
