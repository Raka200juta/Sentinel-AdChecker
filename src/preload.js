const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // --- FUNGSI LAMA (SCANNER PYTHON) ---
    // Mengirim data ke Python
    sendToPython: (channel, data) => {
        ipcRenderer.send(channel, data);
    },
    // Menerima data dari Python
    onFromPython: (channel, func) => {
        // Kita filter channel biar aman
        const validChannels = ['from-python', 'python-error'];
        if (validChannels.includes(channel)) {
            // Hapus listener lama biar gak dobel
            ipcRenderer.removeAllListeners(channel);
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },

    // --- FUNGSI BARU (HEADLESS SCANNER) ---
    headlessScan: (url) => ipcRenderer.invoke('perform-headless-scan', url)
});