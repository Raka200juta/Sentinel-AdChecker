// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Fungsi kirim data ke Python
    sendToPython: (channel, data) => {
        let validChannels = ['to-python'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    // Fungsi terima data dari Python
    onFromPython: (channel, func) => {
        let validChannels = ['from-python'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    // Fungsi Panggil Headless Browser (Pathfinder)
    headlessScan: (url) => ipcRenderer.invoke('perform-headless-scan', url)
});