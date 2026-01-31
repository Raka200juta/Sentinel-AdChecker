// --- CONFIG & UI ELEMENTS ---
const urlInput = document.getElementById('urlInput');
const scanBtn = document.getElementById('scanBtn');
const logContainer = document.getElementById('logContainer');

// UI Elements (Cards)
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
    
    // Assign Class sesuai Tipe Log (Cek src/styles.css)
    if (type === 'error') p.classList.add('log-error');
    else if (type === 'debug') p.classList.add('log-debug');   // Untuk [GHOST]
    else if (type === 'warning') p.classList.add('log-warning'); // Untuk [SNIFFER]
    else p.classList.add('log-info');
    
    logContainer.appendChild(p);
    // Auto Scroll ke bawah
    logContainer.scrollTop = logContainer.scrollHeight;
}

// --- HELPER TIMELINE RENDERER ---
function renderTimeline(chain) {
    timelineContainer.innerHTML = ''; 
    hopBadge.innerText = `${chain.length} Events`;

    if (chain.length === 0) {
        timelineContainer.innerHTML = '<li class="timeline-item"><div class="info"><span class="url">No data captured.</span></div></li>';
        return;
    }

    chain.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'timeline-item';
        
        // Animasi muncul bertahap
        setTimeout(() => li.style.opacity = '1', index * 50);

        // Styling Red Flag untuk Tracker/Iklan
        const redFlags = ['AD-MEDIA', 'AD-NET', 'X-LINK', 'TELEGRAM-LINK', 'CAPTCHA-CF', 'CAPTCHA-GO'];
        if (redFlags.includes(item.status)) {
            li.classList.add('red-flag');
        }

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

// --- FUNGSI RESET UI (NEW SCAN) ---
function resetUI() {
    logContainer.innerHTML = '';
    timelineContainer.innerHTML = `
        <li class="timeline-item placeholder-item">
            <span class="time">READY</span>
            <div class="info"><span class="url">Waiting for input...</span></div>
        </li>
    `;
    hopBadge.innerText = '0 Hops';
    targetScreenshot.src = '';
    targetScreenshot.style.opacity = '0';
    targetTitle.innerText = "Scanning...";
    torStatus.innerText = "SCANNING";
    torStatus.style.color = "orange";
}

// ============================================================
// GLOBAL LISTENERS (Ditaruh di luar click handler agar stabil)
// ============================================================

// 1. LISTENER LOG SYSTEM (Ghost/Sniffer/System dari Main.js)
window.api.onFromPython('system-log', (message) => {
    let type = 'info';
    
    if (message.includes('[ERROR]')) type = 'error';
    else if (message.includes('[GHOST]')) type = 'debug';   // Log Internal Browser
    else if (message.includes('[SNIFFER]')) type = 'warning'; // Log Deteksi Iklan
    else if (message.includes('[WARN]')) type = 'error';
    
    addLog(message, type);
});

// 2. LISTENER LOG PYTHON ENGINE
window.api.onFromPython('from-python', (data) => {
    const rawText = data.toString();
    const lines = rawText.split('\n');
    lines.forEach(line => {
        const cleanLine = line.trim();
        if(cleanLine) {
            const type = cleanLine.toLowerCase().includes('error') ? 'error' : 'info';
            addLog(cleanLine, type);
        }
    });
});

// ============================================================
// MAIN CLICK HANDLER
// ============================================================
scanBtn.addEventListener('click', async () => {
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) {
        addLog("Error: URL empty.", 'error');
        return;
    }

    // Reset Tampilan
    resetUI();
    
    // Kunci Tombol
    scanBtn.disabled = true;
    scanBtn.innerText = "SCANNING...";
    
    // 1. Jalankan Python Engine (Fire & Forget)
    // Log-nya akan ditangkap oleh listener global 'from-python'
    window.api.sendToPython('to-python', rawUrl);

    // 2. Jalankan Headless Scan (Await Result)
    // Log [GHOST]/[SNIFFER] akan ditangkap oleh listener global 'system-log'
    try {
        const result = await window.api.headlessScan(rawUrl);

        if (result.success) {
            // Update UI Akhir
            targetTitle.innerText = result.title || "Scan Complete";
            targetScreenshot.src = result.screenshot;
            targetScreenshot.style.opacity = '1';
            torStatus.innerText = "SECURE"; 
            torStatus.style.color = "green";
            
            // Render Timeline (Redirect Chain)
            if (result.chain) {
                renderTimeline(result.chain);
            }
        } else {
            addLog(`[-] Scan Failed: ${result.error}`, 'error');
            torStatus.innerText = "ERROR";
        }
    } catch (err) {
        addLog(`[!] Critical Error: ${err}`, 'error');
    } finally {
        // Buka Kunci Tombol
        scanBtn.disabled = false;
        scanBtn.innerText = "START SCAN";
        addLog("[=] READY FOR NEW SCAN.", 'info');
    }
});