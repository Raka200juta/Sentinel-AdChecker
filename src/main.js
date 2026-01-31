const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// --- STEALTH SETUP (LEVEL: ROOT) ---
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('rotate-host-per-load'); 
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#f0f0f0',
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
    session.defaultSession.on('will-download', (event, item) => {
        event.preventDefault(); 
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

    pythonProcess.stdout.on('data', (data) => event.sender.send('from-python', data.toString()));
    pythonProcess.stderr.on('data', (data) => event.sender.send('from-python', `[ERROR] ${data.toString()}`));
    pythonProcess.on('close', (code) => event.sender.send('from-python', `[DONE] Process exited with code ${code}`));
});

// --- 2. IPC HANDLER: HEADLESS BROWSER + ANALYST ENGINE v2.1 ---
ipcMain.handle('perform-headless-scan', async (event, targetUrl) => {
  
  // VARIABLE UNTUK ANALISIS
  let maxHunterScore = 0; 
  let connectionError = null; // Melacak jika ada error koneksi (Anti-False-Safe)

  const logToUI = (message) => {
      console.log(message);
      if (!event.sender.isDestroyed()) event.sender.send('system-log', message);
  };

  // A. VALIDASI
  if (!targetUrl || targetUrl.trim() === '') return { success: false, error: "URL is empty." };
  let cleanUrl = targetUrl.match(/(https?:\/\/[^\s]+)/g);
  let finalUrl = cleanUrl ? cleanUrl[0] : targetUrl;
  if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;

  // B. CHAMELEON PROFILE
  const profiles = [
      { name: 'Desktop PC', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', width: 1366, height: 768 },
      { name: 'iPhone 14 Pro', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', width: 393, height: 852 },
      { name: 'Samsung S23', ua: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36', width: 412, height: 919 }
  ];
  const selectedProfile = profiles[Math.floor(Math.random() * profiles.length)];
  logToUI(`[Headless] Chameleon Mode: Activating ${selectedProfile.name}...`);
  logToUI(`[Headless] Target: ${finalUrl}`);

  // C. PATHFINDER SETUP
  let redirectChain = [{ step: 1, url: finalUrl, status: 'START', method: 'INPUT' }];
  
  const workerWindow = new BrowserWindow({
    show: false, width: selectedProfile.width, height: selectedProfile.height,
    webPreferences: {
      offscreen: true, nodeIntegration: false, contextIsolation: true,
      webSecurity: false, preload: path.join(__dirname, 'stealth.js') 
    }
  });

  // --- D. LOG BRIDGE & SCORE CAPTURE ---
  workerWindow.webContents.on('console-message', (e, level, message) => {
      const msg = (message.details || message).toString(); 
      
      // Tangkap Skor Hunter
      if (msg.includes('Score:')) {
          const match = msg.match(/Score:\s*(\d+)/);
          if (match) {
              const s = parseInt(match[1]);
              if (s > maxHunterScore) maxHunterScore = s;
          }
      }

      // Kirim Log ke UI
      if (msg.includes('Sentinel') || msg.includes('Hunter') || msg.includes('Found') || msg.includes('Score') || msg.includes('Click')) {
          logToUI(`[GHOST] ${msg}`);
      }
  });

  // --- E. EVASION ---
  const stealthScript = `
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    if ('${selectedProfile.name}'.includes('iPhone') || '${selectedProfile.name}'.includes('Samsung')) {
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
        window.ontouchstart = true;
    }
  `;
  workerWindow.webContents.on('did-finish-load', async () => {
      try { await workerWindow.webContents.executeJavaScript(stealthScript); } catch(e) {}
  });

  // --- F. SNIFFER ---
  const filter = { urls: ['*://*/*'] };
  workerWindow.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
      const url = details.url.toLowerCase();
      let reason = '';

      if (url.includes('challenges.cloudflare.com') || url.includes('turnstile')) reason = 'CAPTCHA-CF';
      else if (url.includes('google.com/recaptcha')) reason = 'CAPTCHA-GO';
      else if (url.includes('hcaptcha')) reason = 'CAPTCHA-HC';
      else if (url.endsWith('.gif') || url.endsWith('.mp4') || url.endsWith('.webm')) reason = 'AD-MEDIA';
      else if (url.includes('doubleclick') || url.includes('tracker') || url.includes('ads')) reason = 'AD-NET';
      else if (url.includes('t.me') || url.includes('telegram')) reason = 'TELEGRAM-LINK';
      else if (url.includes('twitter') || url.includes('x.com')) reason = 'X-LINK';

      if (reason && !redirectChain.some(item => item.url === details.url)) {
          logToUI(`[SNIFFER] Detected ${reason}: ${url.substring(0, 50)}...`);
          redirectChain.push({ step: redirectChain.length + 1, url: details.url, status: reason, method: 'HIDDEN' });
      }
      callback({ cancel: false });
  });

  workerWindow.webContents.on('did-redirect-navigation', (e, u, i, m) => {
      if(m) {
          logToUI(`[PATHFINDER] Redirecting to: ${u}`);
          redirectChain.push({ step: redirectChain.length+1, url: u, status: '302/301', method: 'REDIRECT' });
      }
  });
  workerWindow.webContents.on('did-start-navigation', (e, u, i, m) => {
      if(m && redirectChain.at(-1)?.url !== u) redirectChain.push({ step: redirectChain.length+1, url: u, status: 'LOADING', method: 'NAV' });
  });

  try {
    // G. PROXY & LOAD (WITH ERROR HANDLING)
    await workerWindow.webContents.session.setProxy({ proxyRules: 'socks5://127.0.0.1:9050', proxyBypassRules: 'localhost' });
    workerWindow.webContents.setUserAgent(selectedProfile.ua);
    
    try { 
        await workerWindow.loadURL(finalUrl, { timeout: 35000, userAgent: selectedProfile.ua }); 
    } catch (e) { 
        logToUI(`[WARN] Load warning: ${e.message}`);
        // Tangkap error fatal (seperti ERR_CONNECTION_FAILED, ERR_TIMED_OUT)
        if (e.message.includes('ERR_')) connectionError = e.message;
    }

    // --- I. HUNTER SCRIPT (v1.9) ---
    const hunterScript = `
        (function() {
            console.log("Hunter v1.9 Executing...");
            function getSuspicionScore(element) {
                const src = (element.src || "").toLowerCase();
                const tagName = element.tagName;
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);

                if (tagName === 'IFRAME') {
                    if (src.includes('cloudflare') || src.includes('turnstile')) return 500;
                    if (src.includes('recaptcha') || src.includes('hcaptcha')) return 450;
                }
                const viewW = window.innerWidth, viewH = window.innerHeight;
                if (rect.width > (viewW * 0.8) && rect.height > (viewH * 0.8)) {
                    if (style.opacity < 0.1 || style.backgroundColor === 'rgba(0, 0, 0, 0)') return 100;
                }
                if (rect.width > 200 && rect.height > 150) {
                     if (style.position === 'absolute' && style.opacity < 0.1) return 80;
                }
                const text = (element.innerText || "").toLowerCase();
                if (['play', 'watch', 'download', 'buka', 'open', 'continue', 'verify'].some(kw => text.includes(kw))) {
                    if (tagName !== 'VIDEO' && tagName !== 'AUDIO') return 40;
                }
                return 0;
            }

            function humanClick(element, score) {
                if(!element) return false;
                console.log("Sentinel Click [Score: " + score + "]");
                element.focus();
                const rect = element.getBoundingClientRect();
                
                let jitterX, jitterY;
                if (score >= 400) { // Captcha (Left Side)
                    jitterX = (Math.random() * 0.2) + 0.1; 
                    jitterY = (Math.random() * 0.4) + 0.3;
                } else { // Standard (Center)
                    jitterX = (Math.random() * 0.4) + 0.3; 
                    jitterY = (Math.random() * 0.4) + 0.3; 
                }

                const x = rect.left + (rect.width * jitterX);
                const y = rect.top + (rect.height * jitterY);
                
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

            const allElements = Array.from(document.querySelectorAll('iframe, div, button, a, span, input'));
            let candidates = [];
            allElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 10 || rect.height < 10) return;
                let score = getSuspicionScore(el);
                if (score > 0) candidates.push({ element: el, score: score });
            });
            candidates.sort((a, b) => b.score - a.score);
            if (candidates.length > 0 && candidates[0].score >= 20) {
                humanClick(candidates[0].element, candidates[0].score);
            } else if (window.isFinalSweep) {
                 const el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                 if(el) humanClick(el, 0);
            }
        })();
    `;

    // J. EXECUTION LOOPS
    logToUI('[SYSTEM] Starting Sweep 1 (Instant)...');
    await new Promise(r => setTimeout(r, 4000));
    await workerWindow.webContents.executeJavaScript(hunterScript);

    logToUI('[SYSTEM] Starting Sweep 2 (Deep Hunter)...');
    await new Promise(r => setTimeout(r, 5000));
    await workerWindow.webContents.executeJavaScript(hunterScript);

    logToUI('[SYSTEM] Starting Sweep 3 (Final Cleanup)...');
    await new Promise(r => setTimeout(r, 5000));
    await workerWindow.webContents.executeJavaScript('window.isFinalSweep = true;');
    await workerWindow.webContents.executeJavaScript(hunterScript);

    await new Promise(r => setTimeout(r, 3000));

    // K. FINAL DATA COLLECTION & RISK ANALYSIS (ANALYST ENGINE v2.1)
    const currentURL = workerWindow.webContents.getURL();
    if (redirectChain.at(-1)?.url !== currentURL) redirectChain.push({ step: redirectChain.length+1, url: currentURL, status: '200 OK', method: 'LAND' });
    else redirectChain.at(-1).status = '200 OK';

    // --- ANALYST LOGIC ---
    let riskScore = 0;
    let riskVerdict = "Clean";
    let riskDesc = "No suspicious activity detected.";
    let detectedThreats = [];

    // --- A. CEK KONEKSI (ANTI FALSE-SAFE) ---
    if (connectionError) {
        riskScore = -1; // Kode Khusus Error
        riskVerdict = "CONNECTION FAILED";
        riskDesc = `Failed to reach target. Likely dead link or proxy issue. (Error: ${connectionError})`;
        detectedThreats.push("Network Error");
    } else {
        // --- B. CEK RISIKO NORMAL ---
        
        // 1. Redirect Chain Analysis
        const adNets = redirectChain.filter(x => x.status === 'AD-NET').length;
        const adMedia = redirectChain.filter(x => x.status === 'AD-MEDIA').length;
        riskScore += (adNets * 5);   
        riskScore += (adMedia * 2);

        // 2. Content & Domain Analysis
        const urlString = redirectChain.map(x => x.url.toLowerCase()).join(' ');
        
        if (urlString.includes('imobile.id') || urlString.includes('tri.co.id') || urlString.includes('vas') || urlString.includes('content.imobile')) {
            riskScore += 50; detectedThreats.push("VAS/SMS Subscription");
        }
        if (urlString.includes('rupiahcepat') || urlString.includes('pinjam') || urlString.includes('kredit') || urlString.includes('dana')) {
            riskScore += 30; detectedThreats.push("Predatory Lending");
        }
        if (urlString.includes('minibox') || urlString.includes('shopee') || urlString.includes('lazada')) {
            riskScore += 20; detectedThreats.push("Forced E-Commerce Redirect");
        }

        // 3. Hunter Analysis
        if (maxHunterScore >= 100) {
            riskScore += 60; detectedThreats.push("Invisible Overlay Trap");
            riskDesc = "Detected a full-screen invisible layer blocking the content (Clickjacking).";
        } else if (maxHunterScore >= 400) {
            riskScore += 10; detectedThreats.push("Captcha Protection");
        } else if (maxHunterScore >= 80) {
            riskScore += 40; detectedThreats.push("Video Hijacking");
        }

        // 4. Normalisasi
        if (riskScore > 100) riskScore = 100;

        // 5. Verdict
        if (riskScore === 0) { riskVerdict = "Clean"; riskDesc = "No threats found."; }
        else if (riskScore < 30) { riskVerdict = "Low Risk"; riskDesc = "Some ads or trackers detected, but harmless."; }
        else if (riskScore < 70) { riskVerdict = "Suspicious"; riskDesc = "Aggressive advertising and potential unwanted redirects."; }
        else { riskVerdict = "DANGEROUS"; }
    }

    logToUI('[SYSTEM] Capturing snapshot...');
    const image = await workerWindow.webContents.capturePage();
    workerWindow.close();

    // RETURN RESULT
    return { 
        success: true, 
        title: workerWindow.getTitle(), 
        screenshot: image.toDataURL(), 
        url: currentURL, 
        chain: redirectChain,
        analysis: { 
            score: riskScore,
            verdict: riskVerdict,
            description: riskDesc,
            tags: detectedThreats
        }
    };

  } catch (error) {
    if (!workerWindow.isDestroyed()) workerWindow.close();
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });