// --- CONFIG & UI ELEMENTS ---
const urlInput = document.getElementById('urlInput');
const scanBtn = document.getElementById('scanBtn');
const logContainer = document.getElementById('logContainer');
// UI Elements
const targetTitle = document.getElementById('target-title');
const targetScreenshot = document.getElementById('target-screenshot');
const torStatus = document.getElementById('tor-status');
const timelineContainer = document.getElementById('redirect-timeline');
const hopBadge = document.querySelector('.count-badge');

// --- HELPER LOGGING ---
function addLog(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `> ${message}`;
    p.className = 'log-line'; 
    
    if (type === 'error') p.classList.add('log-error');
    else if (type === 'debug') p.classList.add('log-debug');
    else p.classList.add('log-info');
    
    logContainer.appendChild(p);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// --- HELPER TIMELINE RENDERER ---
function renderTimeline(chain) {
    timelineContainer.innerHTML = ''; // Bersihkan list lama
    hopBadge.innerText = `${chain.length} Events`;

    if (chain.length === 0) {
        timelineContainer.innerHTML = '<li class="timeline-item"><div class="info"><span class="url">No data captured.</span></div></li>';
        return;
    }

    chain.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'timeline-item';
        
        // Animasi
        setTimeout(() => li.style.opacity = '1', index * 50);

        // Styling untuk "Ad Resource"
        if (item.status === 'AD-MEDIA') li.classList.add('red-flag');

        li.innerHTML = `
            <span class="time">${item.status}</span>
            <div class="info">
                <span class="method">${item.method}</span>
                <span class="url" title="${item.url}">${item.url}</span>
            </div>
        `;
        timelineContainer.appendChild(li);
    });
}

// --- FUNGSI PEMBERSIH (RESET) ---
function resetUI() {
    // 1. Bersihkan Log
    logContainer.innerHTML = '';
    
    // 2. Bersihkan Timeline
    timelineContainer.innerHTML = `
        <li class="timeline-item placeholder-item">
            <span class="time">READY</span>
            <div class="info"><span class="url">Waiting for input...</span></div>
        </li>
    `;
    hopBadge.innerText = '0 Hops';

    // 3. Reset Gambar & Status
    targetScreenshot.src = '';
    targetScreenshot.style.opacity = '0';
    targetTitle.innerText = "Scanning...";
    torStatus.innerText = "SCANNING";
    torStatus.style.color = "orange";
}

// --- MAIN LISTENER ---
scanBtn.addEventListener('click', async () => {
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) {
        addLog("Error: URL empty.", 'error');
        return;
    }

    // --- STEP 1: RESET DULU (Biar gak perlu Ctrl+R) ---
    resetUI();
    
    scanBtn.disabled = true;
    scanBtn.innerText = "SCANNING...";
    addLog(`INITIALIZING SCAN: ${rawUrl}...`);

    let watchdogTimerID;

    // TASK 1: PYTHON ENGINE
    const pythonTask = new Promise((resolve) => {
        window.api.onFromPython('from-python', (data) => {
            const rawText = data.toString();
            const lines = rawText.split('\n');
            lines.forEach(line => {
                const cleanLine = line.trim();
                if(cleanLine) {
                    const type = cleanLine.toLowerCase().includes('error') ? 'error' : 'info';
                    addLog(cleanLine, type);
                }
                if (cleanLine.includes('[DONE]')) resolve("PYTHON_DONE");
            });
        });
        window.api.sendToPython('to-python', rawUrl);
    });

    // TASK 2: HEADLESS PATHFINDER (Dengan Resource Sniffer)
    const headlessTask = (async () => {
        try {
            const result = await window.api.headlessScan(rawUrl);

            if (result.success) {
                targetTitle.innerText = result.title || "No Title";
                targetScreenshot.src = result.screenshot;
                targetScreenshot.style.opacity = '1';
                torStatus.innerText = "SECURE"; // Atau "COMPLETED"
                torStatus.style.color = "green";
                
                addLog("[+] Snapshot Captured.", 'info');

                if (result.chain) {
                    renderTimeline(result.chain);
                    addLog(`[+] Tracker found ${result.chain.length} events (Redirects + Ads).`, 'info');
                }
            } else {
                addLog(`[-] Scan Failed: ${result.error}`, 'error');
                torStatus.innerText = "ERROR";
            }
        } catch (err) {
            addLog(`[!] Critical Error: ${err}`, 'error');
        }
        return "HEADLESS_DONE";
    })();

    // TASK 3: WATCHDOG (60 Detik)
    const safetyTimer = new Promise((resolve) => {
        watchdogTimerID = setTimeout(() => {
            addLog("[!] WATCHDOG: Scan timed out.", 'error');
            resolve("TIMEOUT");
        }, 60000);
    });

    try {
        const winner = await Promise.race([Promise.all([pythonTask, headlessTask]), safetyTimer]);
        if (winner !== "TIMEOUT") clearTimeout(watchdogTimerID);
    } finally {
        clearTimeout(watchdogTimerID);
        // --- STEP AKHIR: KEMBALIKAN TOMBOL ---
        scanBtn.disabled = false;
        scanBtn.innerText = "START SCAN"; // Reset teks tombol
        addLog("[=] READY FOR NEW SCAN.", 'info');
    }
});