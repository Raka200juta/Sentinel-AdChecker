const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- METHOD LAMA (Tetap simpan yang sudah ada) ---
  toPython: (url) => ipcRenderer.send('to-python', url), 
  performHeadlessScan: (url) => ipcRenderer.invoke('perform-headless-scan', url),

  // --- NEW: Phishing analysis IPC ---
  analyzePhishing: (url) => ipcRenderer.invoke('analyze-phishing', url),

  // --- NEW: Read Phishing DB ---
  readPhishingDB: () => {
    const dbPath = path.join(__dirname, '..', 'Daph', 'Phishing_category_detection.csv');
    try {
      return fs.readFileSync(dbPath, 'utf-8');
    } catch (e) {
      console.error('[preload] Cannot read phishing DB:', e.message);
      return '';
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

    // ── NEW: Phishing analysis IPC ────────────────────────
 
    /**
     * Ask main process to call Python backend for phishing analysis.
     * Main process forwards to http://127.0.0.1:5000/analyze/phishing
     */
    analyzePhishing: (url) => ipcRenderer.invoke('analyze-phishing', url),
    
    /**
     * Read the CSV database directly from disk (faster than HTTP).
     * Returns raw CSV string.
     */
    readPhishingDB: () => {
        // Resolve path relative to app root
        const dbPath = path.join(
        __dirname, '..', 'Daph', 'Phishing_category_detection.csv'
        );
        try {
        return fs.readFileSync(dbPath, 'utf-8');
        } catch (e) {
        console.error('[preload] Cannot read phishing DB:', e.message);
        return '';
        }
    },
    
    // Fungsi Headless Scan
    headlessScan: (url) => ipcRenderer.invoke('perform-headless-scan', url)
});