const { contextBridge, ipcRenderer } = require('electron');

// Минимальный мост для веб-страниц (WebContentsView): используется внедрённым скриптом
// менеджера паролей для отправки учётных данных в основной процесс.
contextBridge.exposeInMainWorld('__juk', {
  saveCredentials: (username, password) => {
    try { ipcRenderer.send('page:credentials', String(username || '').slice(0, 300), String(password || '').slice(0, 300)); } catch {}
  },
  showChooser: () => {
    try { ipcRenderer.send('page:showChooser'); } catch {}
  },
  hideChooser: () => {
    try { ipcRenderer.send('page:hideChooser'); } catch {}
  }
});
