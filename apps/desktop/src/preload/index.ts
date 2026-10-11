import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('openagentsDesktop', {
  isDesktop: true,
  getPlatformInfo: () => ipcRenderer.invoke('platform:info'),
  sendNotification: (options: { title: string; body: string }) =>
    ipcRenderer.invoke('platform:notify', options),
  openPath: (path: string) => ipcRenderer.invoke('platform:openPath', path)
})
