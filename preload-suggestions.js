const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sug', {
  pick: (index) => ipcRenderer.send('suggestions:pick', index),
  ready: () => ipcRenderer.send('suggestions:ready'),
  onRender: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('suggestions:render', listener);
    return () => ipcRenderer.removeListener('suggestions:render', listener);
  }
});
