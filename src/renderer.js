// --- src/renderer.js ---

// 1. Ambil Elemen UI
const urlInput = document.getElementById('urlInput');
const scanBtn = document.getElementById('scanBtn');
const logContainer = document.getElementById('logContainer');
const visualizerSection = document.getElementById('visualizer-section');
const targetTitle = document.getElementById('target-title');
const targetScreenshot = document.getElementById('target-screenshot');

// 2. Helper Log
function addLog(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `> ${message}`;
    if (type === 'error') p.style.color = '#ff5555';
    else if (type === 'success') p.style.color = '#55ff55';
    else if (type === 'debug') p.style.color = '#888888'; // Warna abu untuk debug
    else p.style.color = '#00ff00';
    
    p.style.fontFamily = 'monospace';
    p.style.margin = '2px 0';
    logContainer.appendChild(p);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 3. Fungsi Reset Tombol (PENTING)
function resetScanButton() {
    scanBtn.disabled = false;
    scanBtn.innerText = "INITIATE SCAN";
    scanBtn.style.cursor = "pointer";
    addLog("[=] READY FOR NEW SCAN.", 'success');
}

// 4. Listener Utama
scanBtn.addEventListener('click', async () => {
    // A. Validasi
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) {
        addLog("Error: Please enter a target URL.", 'error');
        return;
    }

    // Auto-fix URL
    let url = rawUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    // B. Siapkan UI
    logContainer.innerHTML = ''; 
    addLog(`INITIALIZING SCAN ON: ${url}...`);
    
    // Kunci Tombol
    scanBtn.disabled = true;
    scanBtn.innerText = "SCANNING (Please Wait)...";
    scanBtn.style.cursor = "progress";

    // C. DEFINISI TUGAS (TASKS)

    // Task 1: Python Engine
    const pythonTask = new Promise((resolve) => {
        // Listener Pesan Python
        window.api.onFromPython('from-python', (data) => {
            const cleanData = data.toString().trim();
            
            // Filter log kosong
            if(cleanData) {
                const type = cleanData.toLowerCase().includes('error') ? 'error' : 'info';
                addLog(cleanData, type);
            }

            // Cek sinyal selesai
            if (cleanData.includes('[DONE]')) {
                addLog("[DEBUG] Python Engine Finished.", 'debug');
                resolve("PYTHON_DONE");
            }
        });
        
        // Jalankan Python
        window.api.sendToPython('to-python', url);
    });

    // Task 2: Headless Browser (Visualizer)
    const headlessTask = (async () => {
        // Reset Gambar
        if (visualizerSection) {
            visualizerSection.style.display = 'block';
            targetTitle.innerText = "Initializing Tor Circuit...";
            targetScreenshot.style.opacity = '0.3';
        }
        
        addLog("[*] Launching Stealth Browser...", 'info');

        try {
            // Panggil Main Process
            const result = await window.api.headlessScan(url);

            if (result.success) {
                addLog("[+] Visual Capture Success!", 'success');
                if(targetTitle) targetTitle.innerText = result.title;
                if(targetScreenshot) {
                    targetScreenshot.src = result.screenshot;
                    targetScreenshot.style.opacity = '1';
                }
            } else {
                addLog(`[-] Visual Capture Failed: ${result.error}`, 'error');
                if(targetTitle) targetTitle.innerText = "Capture Failed";
            }
        } catch (err) {
            addLog(`[!] Headless Error: ${err}`, 'error');
        }
        
        addLog("[DEBUG] Visualizer Finished.", 'debug');
        return "HEADLESS_DONE";
    })();

    // Task 3: SAFETY TIMER (Penyelamat Tombol Macet)
    // Jika 60 detik berlalu dan scan belum kelar, paksa selesai.
    const safetyTimer = new Promise((resolve) => {
        setTimeout(() => {
            addLog("[!] WATCHDOG: Scan timed out forcefully.", 'error');
            resolve("TIMEOUT");
        }, 60000); // 60 Detik (1 Menit)
    });

    // D. EKSEKUSI PARALEL (RACE)
    // Kita menunggu: (Python SELESAI && Headless SELESAI) -ATAU- (Timer Waktu Habis)
    try {
        await Promise.race([
            Promise.all([pythonTask, headlessTask]), // Skenario Normal
            safetyTimer                              // Skenario Macet
        ]);
    } catch (err) {
        addLog(`[!] Critical Error: ${err}`, 'error');
    } finally {
        // E. APAPUN YANG TERJADI, NYALAKAN TOMBOL LAGI
        resetScanButton();
    }
});