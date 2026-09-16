const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pw', {
  answer: (save) => ipcRenderer.send('pw:answer', !!save),
  choose: (id) => ipcRenderer.send('pw:choose', id),
  ready: () => ipcRenderer.send('pw:ready'),
  onState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('pw:state', listener);
    return () => ipcRenderer.removeListener('pw:state', listener);
  }
});
