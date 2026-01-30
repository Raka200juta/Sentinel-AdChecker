const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// --- [CRITICAL] STEALTH MODE SETUP ---
// Ini harus dijalankan sebelum app ready agar efektif melawan Cloudflare.
// Mematikan flag yang menandakan browser ini dikendalikan script.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-site-isolation-trials');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#0a0a0a',
        webPreferences: {
            // Security Settings
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            // Jembatan komunikasi
            preload: path.join(__dirname, 'preload.js') 
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

// --- 1. IPC HANDLER: PYTHON SCANNER (ENGINE UTAMA) ---
ipcMain.on('to-python', (event, targetUrl) => {
    console.log(`[Python] Starting scan engine for: ${targetUrl}`);
    
    // Konfigurasi Path Python (Dev vs Production)
    let executable;
    let args;

    if (app.isPackaged) {
        // PRODUCTION (.exe/.deb): Pakai binary terbundle
        executable = path.join(process.resourcesPath, 'sentinel-engine');
        if (process.platform === 'win32') executable += '.exe';
        args = [targetUrl];
    } else {
        // DEV (npm start): Pakai script python lokal
        // Ganti 'python' jika di Windows pakai itu
        executable = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, '../backend/bridge.py');
        args = [scriptPath, targetUrl];
    }

    console.log(`Command: ${executable} ${args.join(' ')}`);

    const pythonProcess = spawn(executable, args);

    // Forward Output ke UI
    pythonProcess.stdout.on('data', (data) => {
        event.sender.send('from-python', data.toString());
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        event.sender.send('from-python', `[ERROR] ${data.toString()}`);
    });

    pythonProcess.on('close', (code) => {
        event.sender.send('from-python', `[DONE] Process exited with code ${code}`);
    });
});

// --- 2. IPC HANDLER: HEADLESS BROWSER (STEALTH V4 - HUMANIZED) ---
ipcMain.handle('perform-headless-scan', async (event, targetUrl) => {
  
  if (!targetUrl || targetUrl.trim() === '') return { success: false, error: "URL is empty." };

  let finalUrl = targetUrl.trim();
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
  }

  console.log(`[Headless] Stealth Scan (v4): ${finalUrl}`);
  
  // 1. RANDOMIZE VIEWPORT (Biar gak ketahuan ukuran default bot)
  const width = 1366 + Math.floor(Math.random() * 100); // 1366 s/d 1466
  const height = 768 + Math.floor(Math.random() * 100); // 768 s/d 868

  const workerWindow = new BrowserWindow({
    show: false, 
    width: width,
    height: height,
    webPreferences: {
      offscreen: true, 
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'stealth.js') // Pastikan file stealth.js masih ada!
    }
  });

  try {
    await workerWindow.webContents.session.setProxy({
      proxyRules: 'socks5://127.0.0.1:9050',
      proxyBypassRules: 'localhost'
    });

    const stealthAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    workerWindow.webContents.setUserAgent(stealthAgent);

    // Timeout pendek (25s) biar gak macet
    try {
        await workerWindow.loadURL(finalUrl, { 
            timeout: 25000, 
            userAgent: stealthAgent,
            httpReferrer: 'https://www.google.com/' 
        });
    } catch (loadErr) {
        console.log(`[Headless] Partial Load Warning: ${loadErr.message}`);
    }

    // --- 2. HUMAN SIMULATION (Gerakkan Mouse & Scroll) ---
    // Cloudflare sering ngecek: "Ini yang buka mouse-nya gerak gak?"
    try {
        const wc = workerWindow.webContents;
        
        // Gerakan 1: Mouse masuk
        wc.sendInputEvent({ type: 'mouseMove', x: 100, y: 100 });
        await new Promise(r => setTimeout(r, 500));
        
        // Gerakan 2: Scroll ke bawah dikit
        wc.sendInputEvent({ type: 'mouseWheel', x: 100, y: 100, deltaY: -100 });
        await new Promise(r => setTimeout(r, 1000));

        // Gerakan 3: Mouse gerak lagi ke tengah
        wc.sendInputEvent({ type: 'mouseMove', x: width / 2, y: height / 2 });
        await new Promise(r => setTimeout(r, 1500)); // Tunggu render
        
    } catch (inputErr) {
        console.log("Human simulation failed:", inputErr);
    }

    console.log('[Headless] Capturing snapshot...');
    const image = await workerWindow.webContents.capturePage();
    const screenshotData = image.toDataURL();
    const title = workerWindow.getTitle();

    workerWindow.close();

    return {
      success: true,
      title: title,
      screenshot: screenshotData,
      url: finalUrl
    };

  } catch (error) {
    console.error('[Headless] Failed:', error);
    if (!workerWindow.isDestroyed()) workerWindow.close();
    return { success: false, error: error.message || "Unknown Error" };
  }
});