const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dl', {
  ready: () => ipcRenderer.send('dl:ready'),
  action: (id, action) => ipcRenderer.send('dl:action', id, action),
  openAll: () => ipcRenderer.send('dl:openAll'),
  close: () => ipcRenderer.invoke('dl:close'),
  onState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('dl:state', listener);
    return () => ipcRenderer.removeListener('dl:state', listener);
  }
});
