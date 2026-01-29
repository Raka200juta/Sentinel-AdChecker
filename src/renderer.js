const { ipcRenderer } = require('electron');

const urlInput = document.getElementById('urlInput');
const scanBtn = document.getElementById('scanBtn');
const terminal = document.getElementById('terminal');
const statusText = document.getElementById('statusText');

function addLog(text) {
    // Pewarnaan Log
    let className = 'log-entry';
    if (text.includes('[PHASE')) className += ' log-phase';
    if (text.includes('[+] CRACKED') || text.includes('MISSION COMPLETE')) className += ' log-success';
    if (text.includes('[-]')) className += ' log-error';

    const div = document.createElement('div');
    div.className = className;
    div.textContent = text.trim();
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight; // Auto scroll ke bawah
}

scanBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return;

    // Reset UI
    terminal.innerHTML = '';
    addLog(`> TARGET ACQUIRED: ${url}`);
    addLog(`> INITIALIZING SENTINEL ENGINE...`);
    
    scanBtn.disabled = true;
    scanBtn.textContent = "SCANNING...";
    statusText.textContent = "RUNNING";
    statusText.style.color = "#ffff00";

    // Kirim perintah ke Main Process
    ipcRenderer.send('start-scan', url);
});

// Terima Log dari Python
ipcRenderer.on('scan-log', (event, data) => {
    // Kadang output python datang borongan, kita split per baris
    const lines = data.split('\n');
    lines.forEach(line => {
        if (line.trim() !== '') addLog(line);
    });
});

// Scan Selesai
ipcRenderer.on('scan-finished', (event, code) => {
    scanBtn.disabled = false;
    scanBtn.textContent = "INITIATE SCAN";
    statusText.textContent = "IDLE";
    statusText.style.color = "#555";
});