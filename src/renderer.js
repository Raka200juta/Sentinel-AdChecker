// ============================================================
// CONFIG & UI ELEMENTS
// ============================================================
const urlInput = document.getElementById('urlInput');
const scanBtn = document.getElementById('scanBtn');
const logContainer = document.getElementById('logContainer');

// UI Elements (Tab 1: Dashboard)
const targetTitle = document.getElementById('target-title');
const targetScreenshot = document.getElementById('target-screenshot');
const torStatus = document.getElementById('tor-status'); // INI YANG AKAN KITA DINAMISKAN
const timelineContainer = document.getElementById('redirect-timeline'); 
const hopBadge = document.querySelector('.count-badge');

// UI Elements (Tab 2: Chain Analysis)
const analysisContainer = document.getElementById('analysis-timeline');

// UI Elements (Tab 3: Risk Analysis)
const scoreCircle = document.getElementById('risk-score');
const verdictText = document.getElementById('risk-verdict');
const descText = document.getElementById('risk-desc');
const tagsContainer = document.getElementById('risk-tags');

// ============================================================
// TAB SWITCHING LOGIC
// ============================================================
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(view => {
        view.style.display = 'none';
        view.classList.remove('active');
    });

    const btn = document.getElementById(`tab-${tabName}`);
    if (btn) btn.classList.add('active');

    const activeView = document.getElementById(`view-${tabName}`);
    if (activeView) {
        activeView.style.display = 'block';
        setTimeout(() => activeView.classList.add('active'), 10);
    }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function addLog(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `> ${message}`;
    p.className = 'log-line'; 
    
    if (type === 'error') p.classList.add('log-error');
    else if (type === 'debug') p.classList.add('log-debug');
    else if (type === 'warning') p.classList.add('log-warning');
    else p.classList.add('log-info');
    
    logContainer.appendChild(p);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function renderTimeline(chain) {
    timelineContainer.innerHTML = ''; 
    analysisContainer.innerHTML = '';
    hopBadge.innerText = `${chain.length} Events`;

    if (chain.length === 0) {
        const emptyMsg = '<li class="timeline-item"><div class="info"><span class="url">No data captured.</span></div></li>';
        timelineContainer.innerHTML = emptyMsg;
        analysisContainer.innerHTML = emptyMsg;
        return;
    }

    chain.forEach((item, index) => {
        let redFlagClass = '';
        const redFlags = ['AD-MEDIA', 'AD-NET', 'X-LINK', 'TELEGRAM-LINK', 'CAPTCHA-CF', 'CAPTCHA-GO'];
        if (redFlags.includes(item.status)) redFlagClass = 'red-flag';

        const htmlContent = `
            <span class="time">${item.status}</span>
            <div class="info">
                <span class="method">${item.method}</span>
                <span class="url" title="${item.url}">${item.url}</span>
            </div>
        `;

        // Dashboard
        const liDash = document.createElement('li');
        liDash.className = `timeline-item ${redFlagClass}`;
        liDash.innerHTML = htmlContent;
        liDash.style.opacity = '0';
        timelineContainer.appendChild(liDash);
        setTimeout(() => liDash.style.opacity = '1', index * 50);

        // Analysis
        const liFull = document.createElement('li');
        liFull.className = `timeline-item ${redFlagClass}`;
        liFull.innerHTML = htmlContent;
        liFull.style.opacity = '0';
        analysisContainer.appendChild(liFull);
        setTimeout(() => liFull.style.opacity = '1', index * 50);
    });
}

function renderRiskReport(analysis) {
    if (!analysis) return;
    const score = analysis.score;
    
    scoreCircle.innerText = score;
    verdictText.innerText = analysis.verdict;
    descText.innerText = analysis.description;

    scoreCircle.className = 'score-circle'; 
    if (score === 0) scoreCircle.classList.add('score-safe');
    else if (score < 50) scoreCircle.classList.add('score-med');
    else if (score < 80) scoreCircle.classList.add('score-high');
    else scoreCircle.classList.add('score-crit');

    tagsContainer.innerHTML = '';
    if (analysis.tags.length > 0) {
        analysis.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'impact-tag';
            span.innerText = tag;
            tagsContainer.appendChild(span);
        });
    } else {
        tagsContainer.innerHTML = '<span style="font-style: italic; color: #999; font-size: 12px;">No specific threats tagged.</span>';
    }
}

// --- RESET UI ---
function resetUI() {
    logContainer.innerHTML = '';
    const resetHtml = '<li class="timeline-item placeholder-item"><span class="time">READY</span><div class="info"><span class="url">Waiting...</span></div></li>';
    
    timelineContainer.innerHTML = resetHtml;
    analysisContainer.innerHTML = resetHtml;
    hopBadge.innerText = '0 Hops';
    
    targetScreenshot.src = '';
    targetScreenshot.style.opacity = '0';
    targetTitle.innerText = "Scanning...";
    
    // Reset Status Badge ke default
    torStatus.innerText = "SCANNING";
    torStatus.style.color = "orange";
    torStatus.style.borderColor = "orange";

    scoreCircle.innerText = '-';
    scoreCircle.className = 'score-circle';
    verdictText.innerText = 'Analyzing...';
    descText.innerText = 'Please wait while Sentinel scans the target.';
    tagsContainer.innerHTML = '';
}

// ============================================================
// LISTENERS
// ============================================================
window.api.onFromPython('system-log', (message) => {
    let type = 'info';
    if (message.includes('[ERROR]')) type = 'error';
    else if (message.includes('[GHOST]')) type = 'debug';
    else if (message.includes('[SNIFFER]')) type = 'warning';
    else if (message.includes('[WARN]')) type = 'error';
    addLog(message, type);
});

window.api.onFromPython('from-python', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if(line.trim()) addLog(line.trim(), 'info');
    });
});

// ============================================================
// MAIN CLICK HANDLER (PERBAIKAN LOGIKA STATUS ADA DI SINI)
// ============================================================
scanBtn.addEventListener('click', async () => {
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) { addLog("Error: URL empty.", 'error'); return; }

    resetUI();
    scanBtn.disabled = true;
    scanBtn.innerText = "SCANNING...";
    window.switchTab('dashboard'); 
    
    window.api.sendToPython('to-python', rawUrl);

    try {
        const result = await window.api.headlessScan(rawUrl);

        if (result.success) {
            targetTitle.innerText = result.title || "Scan Complete";
            targetScreenshot.src = result.screenshot;
            targetScreenshot.style.opacity = '1';

            // --- PERBAIKAN: UPDATE STATUS BADGE BERDASARKAN SKOR ---
            if (result.analysis) {
                const score = result.analysis.score;
                
                // Update Teks Verdict (Singkat)
                if (score === 0) {
                    torStatus.innerText = "SECURE";
                    torStatus.style.color = "#27ae60"; // Hijau
                } else if (score < 50) {
                    torStatus.innerText = "WARNING";
                    torStatus.style.color = "#f39c12"; // Kuning/Orange
                } else {
                    torStatus.innerText = "DANGEROUS";
                    torStatus.style.color = "#c0392b"; // Merah
                }
                
                // Update Report Tab 3
                renderRiskReport(result.analysis);

                // Auto Switch jika bahaya
                if (score >= 80) {
                    addLog("[!] HIGH RISK DETECTED. Opening report...", "error");
                    setTimeout(() => window.switchTab('risk'), 1500);
                }
            } else {
                // Fallback jika analisis gagal
                torStatus.innerText = "UNKNOWN";
                torStatus.style.color = "grey";
            }

            if (result.chain) renderTimeline(result.chain);
            
        } else {
            addLog(`[-] Scan Failed: ${result.error}`, 'error');
            torStatus.innerText = "ERROR";
            torStatus.style.color = "red";
        }
    } catch (err) {
        addLog(`[!] Critical Error: ${err}`, 'error');
        torStatus.innerText = "CRITICAL";
        torStatus.style.color = "red";
    } finally {
        scanBtn.disabled = false;
        scanBtn.innerText = "START SCAN";
        addLog("[=] READY FOR NEW SCAN.", 'info');
    }
});