const { contextBridge, ipcRenderer } = require('electron');
const calls = ['bootstrap', 'pickProject', 'pickBinary', 'saveSettings', 'connect', 'disconnect', 'newSession', 'resumeSession', 'listSessions', 'send', 'cancel', 'models', 'setModel', 'rename', 'compact', 'fork', 'approve', 'answer', 'clarify', 'decline', 'inventory', 'shell', 'files', 'readFile', 'changes', 'diff', 'exportSession', 'openLink', 'window'];
contextBridge.exposeInMainWorld('muse', Object.fromEntries([
  ...calls.map(name => [name, (...args) => ipcRenderer.invoke(`muse:${name}`, ...args)]),
  ['onEvent', handler => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('muse:event', listener);
    return () => ipcRenderer.removeListener('muse:event', listener);
  }]
]));
