const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('menu', {
  ready: () => ipcRenderer.send('menu:ready'),
  pick: (path) => ipcRenderer.send('menu:pick', path),
  close: () => ipcRenderer.send('menu:closeReq'),
  onState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('menu:state', listener);
    return () => ipcRenderer.removeListener('menu:state', listener);
  }
});
