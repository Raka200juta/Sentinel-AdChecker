const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// --- STEALTH SETUP (LEVEL: ROOT) ---
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-site-isolation-trials');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#f0f0f0', // Putih/Abu gaya aplikasi Desktop
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
    session.defaultSession.on('will-download', (event, item, webContents) => {
        event.preventDefault(); // Blokir download otomatis (malware/apk)
        console.log(`[Security] Blocked download attempt: ${item.getFilename()}`);
    });
});

// --- 1. IPC HANDLER: PYTHON SCANNER ---
ipcMain.on('to-python', (event, targetUrl) => {
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

// --- 2. IPC HANDLER: HEADLESS BROWSER + ULTIMATE HUNTER ---
ipcMain.handle('perform-headless-scan', async (event, targetUrl) => {
  
  // A. VALIDASI
  if (!targetUrl || targetUrl.trim() === '') return { success: false, error: "URL is empty." };

  let finalUrl = targetUrl.trim();
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
  }

  console.log(`[Headless] Ultimate Scan: ${finalUrl}`);

  // B. SETUP PATHFINDER DATA
  let redirectChain = [];
  redirectChain.push({
      step: 1,
      url: finalUrl,
      status: 'START',
      method: 'INPUT'
  });
  
  const width = 1366 + Math.floor(Math.random() * 100);
  const height = 768 + Math.floor(Math.random() * 100);

  const workerWindow = new BrowserWindow({
    show: false, 
    width: width,
    height: height,
    webPreferences: {
      offscreen: true, 
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // FALSE agar bisa tembus iframe/overlay iklan
      preload: path.join(__dirname, 'stealth.js') 
    }
  });

  // C. SNIFFER & LISTENERS

  // 1. Resource Sniffer (Deteksi Iklan & Signature Captcha)
  const filter = { urls: ['*://*/*'] };
  workerWindow.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
      const url = details.url.toLowerCase();
      let isSuspicious = false;
      let reason = '';

      // --- DETEKSI CAPTCHA (Signature Based) ---
      if (url.includes('challenges.cloudflare.com') || url.includes('turnstile')) {
          isSuspicious = true; reason = 'CAPTCHA-CF';
      }
      else if (url.includes('google.com/recaptcha') || url.includes('recaptcha')) {
          isSuspicious = true; reason = 'CAPTCHA-GO';
      }
      else if (url.includes('hcaptcha')) {
          isSuspicious = true; reason = 'CAPTCHA-HC';
      }
      // --- DETEKSI IKLAN ---
      else if (url.endsWith('.gif') || url.endsWith('.mp4') || url.endsWith('.webm')) {
          isSuspicious = true; reason = 'AD-MEDIA';
      }
      else if (url.includes('doubleclick') || url.includes('googleadservices') || url.includes('ads') || url.includes('tracker')) {
          isSuspicious = true; reason = 'AD-NET';
      }

      if (isSuspicious) {
          const isDuplicate = redirectChain.some(item => item.url === details.url);
          if (!isDuplicate) {
              console.log(`[Sniffer] Detected ${reason}: ${url}`);
              redirectChain.push({
                  step: redirectChain.length + 1,
                  url: details.url,
                  status: reason,
                  method: 'HIDDEN'
              });
          }
      }
      callback({ cancel: false });
  });

  // 2. Redirect Listener
  workerWindow.webContents.on('did-redirect-navigation', (event, url, isInPlace, isMainFrame) => {
      if (isMainFrame) {
          console.log(`[Pathfinder] Redirect: ${url}`);
          redirectChain.push({
              step: redirectChain.length + 1,
              url: url,
              status: '302/301',
              method: 'REDIRECT'
          });
      }
  });

  // 3. Navigation Listener
  workerWindow.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
      if (isMainFrame && redirectChain[redirectChain.length - 1].url !== url) {
          console.log(`[Pathfinder] Nav: ${url}`);
          redirectChain.push({
              step: redirectChain.length + 1,
              url: url,
              status: 'LOADING',
              method: 'NAV'
          });
      }
  });

  try {
    // D. SETUP JARINGAN (TOR)
    await workerWindow.webContents.session.setProxy({
      proxyRules: 'socks5://127.0.0.1:9050',
      proxyBypassRules: 'localhost'
    });

    const stealthAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    workerWindow.webContents.setUserAgent(stealthAgent);

    // E. LOAD URL
    try {
        await workerWindow.loadURL(finalUrl, { 
            timeout: 30000, 
            userAgent: stealthAgent,
            httpReferrer: 'https://www.google.com/' 
        });
    } catch (loadErr) {
        console.log(`[Headless] Load Warning: ${loadErr.message}`);
    }

    // F. ULTIMATE GATE BREAKER (COMBINED LOGIC v1.5)
    console.log('[Headless] Activating Ultimate Hunter Protocol...');
    
    const hunterScript = `
        (function() {
            console.log("Hunter Sweep Executing...");

            function getSuspicionScore(element) {
                let score = 0;
                const style = window.getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                const text = (element.innerText || "").toLowerCase();
                const viewW = window.innerWidth;
                const viewH = window.innerHeight;
                const tagName = element.tagName;
                const src = (element.src || "").toLowerCase();

                // --- PRIORITY 1: CAPTCHA SIGNATURES (SKOR 500) ---
                // Tembus Cloudflare/Recaptcha berdasarkan URL Iframe
                if (tagName === 'IFRAME') {
                    if (src.includes('challenges.cloudflare.com') || src.includes('turnstile')) return 500;
                    if (src.includes('google.com/recaptcha') || src.includes('recaptcha')) return 450;
                    if (src.includes('hcaptcha')) return 450;
                }

                // --- PRIORITY 2: INVISIBLE OVERLAYS (SKOR 100) ---
                // Jebakan layar bening
                if (rect.width > (viewW * 0.9) && rect.height > (viewH * 0.9)) {
                    if (style.opacity < 0.1 || style.backgroundColor === 'rgba(0, 0, 0, 0)') {
                        return 100;
                    }
                }

                // --- PRIORITY 3: VIDEO TRAPS (SKOR 80) ---
                // Overlay bening seukuran video player (min 300x200)
                if (rect.width > 300 && rect.height > 200) {
                    if (style.opacity < 0.1 || style.backgroundColor === 'rgba(0, 0, 0, 0)') {
                        if (style.position === 'absolute' || style.position === 'fixed') {
                             return 80;
                        }
                    }
                }

                // --- PRIORITY 4: FAKE MEDIA & IFRAMES (SKOR 40-50) ---
                if (tagName === 'IFRAME' && style.zIndex > 100 && rect.width > 200) return 50;
                
                if (['play', 'watch', 'stream', 'start', 'download'].some(kw => text.includes(kw))) {
                    if (tagName !== 'VIDEO' && tagName !== 'AUDIO') return 40;
                }

                return 0;
            }

            function forceClick(element, reason) {
                if(!element) return false;
                console.log("Sentinel Triggered [" + reason + "]");
                element.focus();

                // Advanced Click (Koordinat Tengah) - Penting buat Iframe Captcha
                const rect = element.getBoundingClientRect();
                const x = rect.left + (rect.width / 2);
                const y = rect.top + (rect.height / 2);

                ['mousedown', 'mouseup', 'click'].forEach(evt => {
                    const event = new MouseEvent(evt, {
                        bubbles: true, cancelable: true, view: window, buttons: 1,
                        clientX: x, clientY: y
                    });
                    element.dispatchEvent(event);
                });
                
                element.click();
                return true;
            }

            // --- EKSEKUSI ---
            const allElements = Array.from(document.querySelectorAll('iframe, div, a, button, span, img, input'));
            let candidates = [];

            allElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 10 || rect.height < 10) return;
                if (rect.top > window.innerHeight || rect.left > window.innerWidth) return;

                let score = getSuspicionScore(el);
                if (score > 0) candidates.push({ element: el, score: score });
            });

            candidates.sort((a, b) => b.score - a.score);

            if (candidates.length > 0) {
                const top = candidates[0];
                // Threshold minimal 20 poin
                if (top.score >= 20) {
                    forceClick(top.element, "Score: " + top.score + " <" + top.element.tagName + ">");
                    return true;
                }
            } else {
                // FALLBACK: Blind Click di Sweep Terakhir
                if (window.isFinalSweep) {
                     console.log("Blind Click executed...");
                     const el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                     if(el) forceClick(el, "Blind Center");
                }
            }
            return false;
        })();
    `;

    // G. LOOPING RONDA (MULTI-STAGE SWEEP)
    
    // SWEEP 1: Detik ke-3 (Cloudflare/Popup Awal)
    console.log('[Headless] Sweep 1: Initial Checks...');
    await new Promise(r => setTimeout(r, 3000));
    await workerWindow.webContents.executeJavaScript(hunterScript);

    // SWEEP 2: Detik ke-7 (Video Trap/Delayed Ads)
    console.log('[Headless] Sweep 2: Deep Hunter...');
    await new Promise(r => setTimeout(r, 4000));
    await workerWindow.webContents.executeJavaScript(hunterScript);

    // SWEEP 3: Detik ke-12 (Final Cleanup & Blind Click)
    console.log('[Headless] Sweep 3: Final Sweep...');
    await new Promise(r => setTimeout(r, 5000));
    await workerWindow.webContents.executeJavaScript('window.isFinalSweep = true;');
    await workerWindow.webContents.executeJavaScript(hunterScript);

    // Tunggu efek redirect terakhir
    await new Promise(r => setTimeout(r, 3000));

    // Scroll dikit
    try {
        workerWindow.webContents.sendInputEvent({ type: 'mouseWheel', x: width/2, y: height/2, deltaY: -300 });
        await new Promise(r => setTimeout(r, 1000));
    } catch(e) {}

    // H. FINALISASI DATA
    const currentURL = workerWindow.webContents.getURL();
    if (redirectChain.length > 0 && redirectChain[redirectChain.length - 1].url !== currentURL) {
         redirectChain.push({
            step: redirectChain.length + 1,
            url: currentURL,
            status: '200 OK',
            method: 'LAND'
        });
    } else if (redirectChain.length > 0) {
        redirectChain[redirectChain.length - 1].status = '200 OK';
        redirectChain[redirectChain.length - 1].method = 'LAND';
    }

    console.log('[Headless] Capturing snapshot...');
    const image = await workerWindow.webContents.capturePage();
    const screenshotData = image.toDataURL();
    const title = workerWindow.getTitle();

    workerWindow.close();

    // I. KIRIM HASIL
    return {
      success: true,
      title: title,
      screenshot: screenshotData,
      url: currentURL,
      chain: redirectChain 
    };

  } catch (error) {
    console.error('[Headless] Failed:', error);
    if (!workerWindow.isDestroyed()) workerWindow.close();
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});