const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Kirim data ke Python (Backend)
    sendToPython: (channel, data) => {
        let validChannels = ['to-python'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    // Terima data dari Backend (Python & System Logs)
    onFromPython: (channel, func) => {
        // KITA TAMBAHKAN 'system-log' DI SINI
        let validChannels = ['from-python', 'system-log'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    // Fungsi Headless Scan
    headlessScan: (url) => ipcRenderer.invoke('perform-headless-scan', url)
});