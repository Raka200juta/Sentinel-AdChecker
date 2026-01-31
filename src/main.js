const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// --- STEALTH SETUP (LEVEL: ROOT) ---
// Mematikan flag otomatisasi agar tidak terdeteksi sebagai Bot
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-site-isolation-trials');
// Mengacak host rules untuk mempersulit fingerprinting
app.commandLine.appendSwitch('rotate-host-per-load'); 

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#f0f0f0', // Abu muda (Tema Desktop)
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js') 
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    createWindow();

    // --- SECURITY: DOWNLOAD BLOCKER ---
    // Mencegah website mendownload file .exe/.apk sampah secara otomatis
    session.defaultSession.on('will-download', (event, item, webContents) => {
        event.preventDefault(); 
        console.log(`[Security] Blocked download attempt: ${item.getFilename()}`);
    });
});

// --- 1. IPC HANDLER: PYTHON SCANNER (Backend Engine) ---
ipcMain.on('to-python', (event, targetUrl) => {
    // Fungsi ini untuk komunikasi dengan script Python jika diperlukan
    console.log(`[Python] Starting scan engine for: ${targetUrl}`);
    
    let executable;
    let args;

    if (app.isPackaged) {
        executable = path.join(process.resourcesPath, 'sentinel-engine');
        if (process.platform === 'win32') executable += '.exe';
        args = [targetUrl];
    } else {
        executable = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, '../backend/bridge.py');
        args = [scriptPath, targetUrl];
    }

    const pythonProcess = spawn(executable, args);

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

// --- 2. IPC HANDLER: HEADLESS BROWSER + ULTIMATE LOGGING + HUNTER v1.7 ---
ipcMain.handle('perform-headless-scan', async (event, targetUrl) => {
  
  // --- FUNGSI PEMBANTU: LOG KE UI & TERMINAL ---
  // Agar log [GHOST] muncul di aplikasi, tidak cuma di terminal
  const logToUI = (message) => {
      console.log(message);
      if (!event.sender.isDestroyed()) {
          event.sender.send('system-log', message);
      }
  };

  // A. VALIDASI INPUT
  if (!targetUrl || targetUrl.trim() === '') return { success: false, error: "URL is empty." };

  // Bersihkan URL dari sampah teks copy-paste
  let cleanUrl = targetUrl.match(/(https?:\/\/[^\s]+)/g);
  let finalUrl = cleanUrl ? cleanUrl[0] : targetUrl;
  if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;

  // B. CHAMELEON PROFILE GENERATOR
  // Mengacak identitas browser (Desktop vs Mobile)
  const profiles = [
      {
          name: 'Desktop PC',
          ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          width: 1366, height: 768
      },
      {
          name: 'iPhone 14 Pro',
          ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          width: 393, height: 852 // Layar Vertikal
      },
      {
          name: 'Samsung S23',
          ua: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36',
          width: 412, height: 919 // Layar Vertikal
      }
  ];

  const selectedProfile = profiles[Math.floor(Math.random() * profiles.length)];
  logToUI(`[Headless] Chameleon Mode: Activating ${selectedProfile.name}...`);
  logToUI(`[Headless] Target: ${finalUrl}`);

  // C. SETUP DATA PATHFINDER
  let redirectChain = [];
  redirectChain.push({ step: 1, url: finalUrl, status: 'START', method: 'INPUT' });
  
  // Setup Window Hantu
  const workerWindow = new BrowserWindow({
    show: false, 
    width: selectedProfile.width, 
    height: selectedProfile.height,
    webPreferences: {
      offscreen: true, 
      nodeIntegration: false, 
      contextIsolation: true,
      webSecurity: false, // FALSE agar bisa tembus iframe/overlay iklan lintas domain
      preload: path.join(__dirname, 'stealth.js') 
    }
  });

  // --- D. LOG BRIDGE (Script Browser -> Terminal -> UI) ---
  workerWindow.webContents.on('console-message', (e, level, message) => {
      // Filter log penting dari script Hunter
      if (message.includes('Sentinel') || message.includes('Hunter') || message.includes('Found') || message.includes('Score') || message.includes('Click')) {
          logToUI(`[GHOST] ${message}`);
      }
  });

  // --- E. EVASION SCRIPT (ANTI-BOT) ---
  const stealthScript = `
    // Hapus properti webdriver agar tidak terdeteksi Cloudflare
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    // Jika profil Mobile, simulasi layar sentuh
    if ('${selectedProfile.name}'.includes('iPhone') || '${selectedProfile.name}'.includes('Samsung')) {
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
        window.ontouchstart = true;
    }
  `;
  workerWindow.webContents.on('did-finish-load', async () => {
      try { await workerWindow.webContents.executeJavaScript(stealthScript); } catch(e) {}
  });

  // --- F. NETWORK SNIFFER (DETEKSI IKLAN & CAPTCHA) ---
  const filter = { urls: ['*://*/*'] };
  workerWindow.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
      const url = details.url.toLowerCase();
      let reason = '';

      // Deteksi Captcha Signature
      if (url.includes('challenges.cloudflare.com') || url.includes('turnstile')) reason = 'CAPTCHA-CF';
      else if (url.includes('google.com/recaptcha')) reason = 'CAPTCHA-GO';
      else if (url.includes('hcaptcha')) reason = 'CAPTCHA-HC';
      
      // Deteksi Iklan Media
      else if (url.endsWith('.gif') || url.endsWith('.mp4') || url.endsWith('.webm')) reason = 'AD-MEDIA';
      // Deteksi Jaringan Iklan
      else if (url.includes('doubleclick') || url.includes('tracker') || url.includes('ads')) reason = 'AD-NET';
      
      // Deteksi Link Sosial (X/Telegram)
      else if (url.includes('t.me') || url.includes('telegram')) reason = 'TELEGRAM-LINK';
      else if (url.includes('twitter') || url.includes('x.com')) reason = 'X-LINK';

      if (reason && !redirectChain.some(item => item.url === details.url)) {
          // Log ke UI (dipotong max 50 karakter biar rapi)
          logToUI(`[SNIFFER] Detected ${reason}: ${url.substring(0, 50)}...`);
          redirectChain.push({ step: redirectChain.length + 1, url: details.url, status: reason, method: 'HIDDEN' });
      }
      callback({ cancel: false });
  });

  // Listeners Navigasi
  workerWindow.webContents.on('did-redirect-navigation', (e, u, i, m) => {
      if(m) {
          logToUI(`[PATHFINDER] Redirecting to: ${u}`);
          redirectChain.push({ step: redirectChain.length+1, url: u, status: '302/301', method: 'REDIRECT' });
      }
  });
  workerWindow.webContents.on('did-start-navigation', (e, u, i, m) => {
      if(m && redirectChain.at(-1)?.url !== u) {
          redirectChain.push({ step: redirectChain.length+1, url: u, status: 'LOADING', method: 'NAV' });
      }
  });

  try {
    // G. KONEKSI (TOR PROXY)
    await workerWindow.webContents.session.setProxy({ proxyRules: 'socks5://127.0.0.1:9050', proxyBypassRules: 'localhost' });
    workerWindow.webContents.setUserAgent(selectedProfile.ua);

    // H. LOAD URL
    try { await workerWindow.loadURL(finalUrl, { timeout: 35000, userAgent: selectedProfile.ua }); } 
    catch (e) { logToUI(`[WARN] Load warning: ${e.message}`); }

    // --- I. THE HUNTER SCRIPT v1.7 (LOGIKA UTAMA) ---
    const hunterScript = `
        (function() {
            console.log("Hunter v1.7 Executing...");

            function getSuspicionScore(element) {
                const src = (element.src || "").toLowerCase();
                const tagName = element.tagName;
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);

                // 1. SIGNATURES (CAPTCHA) - PRIORITAS TERTINGGI
                if (tagName === 'IFRAME') {
                    if (src.includes('cloudflare') || src.includes('turnstile')) return 500;
                    if (src.includes('recaptcha') || src.includes('hcaptcha')) return 450;
                }

                // 2. INVISIBLE TRAPS (Layar Penuh Bening)
                const viewW = window.innerWidth, viewH = window.innerHeight;
                // Ambang batas 80% layar
                if (rect.width > (viewW * 0.8) && rect.height > (viewH * 0.8)) {
                    if (style.opacity < 0.1 || style.backgroundColor === 'rgba(0, 0, 0, 0)') return 100;
                }
                
                // 3. VIDEO OVERLAY (Jebakan di atas Player)
                if (rect.width > 200 && rect.height > 150) {
                     if (style.position === 'absolute' && style.opacity < 0.1) return 80;
                }

                // 4. FAKE BUTTONS (Play/Download Palsu)
                const text = (element.innerText || "").toLowerCase();
                if (['play', 'watch', 'download', 'buka', 'open', 'continue', 'verify'].some(kw => text.includes(kw))) {
                    if (tagName !== 'VIDEO' && tagName !== 'AUDIO') return 40;
                }

                return 0;
            }

            function humanClick(element, reason) {
                if(!element) return false;
                console.log("Sentinel Click [" + reason + "]");
                element.focus();

                const rect = element.getBoundingClientRect();
                // Jitter: Klik tidak persis di tengah (Random 40%-60%)
                const jitterX = (Math.random() * 0.2) + 0.4; 
                const jitterY = (Math.random() * 0.2) + 0.4;
                const x = rect.left + (rect.width * jitterX);
                const y = rect.top + (rect.height * jitterY);

                // Simulasi Event Mouse Lengkap (Touch jika Mobile)
                const events = [
                    new MouseEvent('touchstart', { view: window, bubbles: true, clientX: x, clientY: y }),
                    new MouseEvent('touchend', { view: window, bubbles: true, clientX: x, clientY: y }),
                    new MouseEvent('mouseover', { view: window, bubbles: true, clientX: x, clientY: y }),
                    new MouseEvent('mousedown', { view: window, bubbles: true, clientX: x, clientY: y, buttons: 1 }),
                    new MouseEvent('mouseup', { view: window, bubbles: true, clientX: x, clientY: y }),
                    new MouseEvent('click', { view: window, bubbles: true, clientX: x, clientY: y })
                ];
                events.forEach((evt) => element.dispatchEvent(evt));
                
                try { element.click(); } catch(e) {}
                return true;
            }

            // SCANNING & EXECUTION
            const allElements = Array.from(document.querySelectorAll('iframe, div, button, a, span, input'));
            let candidates = [];
            allElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 10 || rect.height < 10) return; // Skip elemen mikro
                let score = getSuspicionScore(el);
                if (score > 0) candidates.push({ element: el, score: score });
            });

            candidates.sort((a, b) => b.score - a.score);

            if (candidates.length > 0) {
                const top = candidates[0];
                // Klik jika skor >= 20
                if (top.score >= 20) {
                    humanClick(top.element, "Score: " + top.score);
                }
            } else {
                // FALLBACK: Blind Click (Hanya di Sweep Terakhir)
                if (window.isFinalSweep) {
                     const el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                     if(el) humanClick(el, "Blind Click");
                }
            }
        })();
    `;

    // J. EXECUTION LOOPS (SWEEPS)
    logToUI('[SYSTEM] Starting Sweep 1 (Instant)...');
    await new Promise(r => setTimeout(r, 4000));
    await workerWindow.webContents.executeJavaScript(hunterScript);

    logToUI('[SYSTEM] Starting Sweep 2 (Deep Hunter)...');
    await new Promise(r => setTimeout(r, 5000));
    await workerWindow.webContents.executeJavaScript(hunterScript);

    logToUI('[SYSTEM] Starting Sweep 3 (Final Cleanup)...');
    await new Promise(r => setTimeout(r, 5000));
    await workerWindow.webContents.executeJavaScript('window.isFinalSweep = true;'); // Set flag blind click
    await workerWindow.webContents.executeJavaScript(hunterScript);

    await new Promise(r => setTimeout(r, 3000));

    // K. FINAL DATA COLLECTION
    const currentURL = workerWindow.webContents.getURL();
    if (redirectChain.at(-1)?.url !== currentURL) redirectChain.push({ step: redirectChain.length+1, url: currentURL, status: '200 OK', method: 'LAND' });
    else redirectChain.at(-1).status = '200 OK';

    logToUI('[SYSTEM] Capturing snapshot...');
    const image = await workerWindow.webContents.capturePage();
    workerWindow.close();

    return { success: true, title: "Scan Complete", screenshot: image.toDataURL(), url: currentURL, chain: redirectChain };

  } catch (error) {
    if (!workerWindow.isDestroyed()) workerWindow.close();
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });