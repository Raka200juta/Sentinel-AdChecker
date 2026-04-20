/* ═══════════════════════════════════════════════════════════
   SENTINEL DESKTOP — RENDERER
   Handles: navigation, adware scan UI, TOR status polling
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ── NAVIGATION ─────────────────────────────────────────── */
window.sentinelNav = {
  _current: 'home',
  _pages: ['home', 'adware', 'phishing'],

  go(name) {
    this._pages.forEach(p => {
      document.getElementById(`page-${p}`).classList.toggle('active', p === name);
    });
    this._current = name;
  },
  goHome()     { this.go('home'); },
  goAdware()   { this.go('adware'); },
  goPhishing() { this.go('phishing'); },
};

/* ── TOR STATUS ──────────────────────────────────────────── */
const TorMonitor = {
  badges: ['tor-status-home', 'tor-status-adware', 'tor-status-phishing'],
  interval: null,

  async check() {
    try {
      const res = await window.electronAPI.checkTorStatus?.() ?? await this._httpCheck();
      this.setConnected(res);
    } catch {
      this.setConnected(false);
    }
  },

  async _httpCheck() {
    try {
      const r = await fetch('http://127.0.0.1:5000/status', { signal: AbortSignal.timeout(2000) });
      const d = await r.json();
      return d.tor === 'connected' || d.status === 'ok';
    } catch { return false; }
  },

  setConnected(ok) {
    this.badges.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('connected', ok);
    });
    // Update home status chip
    const chip = document.getElementById('status-home');
    if (chip && ok) { chip.textContent = '● READY'; chip.className = 'status-chip status-done'; }
  },

  start() {
    this.check();
    this.interval = setInterval(() => this.check(), 5000);
  },
};

/* ── ADWARE SCAN ─────────────────────────────────────────── */
window.adwareScan = {
  running: false,
  logEl: null,
  terminalEl: null,

  init() {
    this.logEl = document.getElementById('log-terminal');
  },

  log(msg, type = 'info') {
    const el = document.getElementById('log-terminal');
    if (!el) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const ts = new Date().toTimeString().slice(0, 8);
    entry.textContent = `[${ts}] ${msg}`;
    el.appendChild(entry);
    el.scrollTop = el.scrollHeight;
  },

  clearLogs() {
    const el = document.getElementById('log-terminal');
    if (el) el.innerHTML = '';
    this.log('Log cleared.', 'debug');
  },

  setStatus(st) {
    const chip = document.getElementById('status-adware');
    if (!chip) return;
    chip.textContent = { idle: '● IDLE', scanning: '● SCANNING', done: '● COMPLETE', error: '● ERROR' }[st] || '● IDLE';
    chip.className = `status-chip status-${st === 'idle' ? 'idle' : st === 'done' ? 'done' : st === 'error' ? 'error' : 'scanning'}`;
  },

  toggleButton(busy) {
    const btn = document.getElementById('adware-scan-btn');
    if (!btn) return;
    btn.querySelector('.scan-btn-text').style.display = busy ? 'none' : '';
    btn.querySelector('.scan-btn-loader').style.display = busy ? 'flex' : 'none';
    btn.disabled = busy;
  },

  resetUI() {
    // Screenshot
    document.getElementById('screenshot-container').querySelector('.screenshot-placeholder').style.display = 'flex';
    document.getElementById('screenshot-img').style.display = 'none';
    // Pathfinder
    document.getElementById('path-chain').innerHTML = '<div class="path-empty">No redirect chain captured yet</div>';
    document.getElementById('path-count').textContent = '0 hops';
    // Crypto
    ['aes-count','iv-count','payload-count','adnet-count'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    document.getElementById('decrypted-payloads').innerHTML = '';
  },

  async start() {
    if (this.running) return;
    const urlEl = document.getElementById('adware-url-input');
    const url = urlEl?.value?.trim();
    if (!url) { this.log('ERROR: No URL entered.', 'error'); return; }

    this.running = true;
    this.toggleButton(true);
    this.setStatus('scanning');
    this.resetUI();
    this.log(`Initiating scan → ${url}`, 'info');
    this.log('Routing through Tor circuit…', 'debug');

    try {
      // Call backend via electronAPI bridge or HTTP
      const result = await this._callBackend(url);
      this.renderResults(result);
      this.setStatus('done');
      this.log('Scan complete.', 'success');
    } catch (err) {
      this.log(`SCAN FAILED: ${err.message}`, 'error');
      this.setStatus('error');
    } finally {
      this.running = false;
      this.toggleButton(false);
    }
  },

  async _callBackend(url) {
    // Try electronAPI first (IPC), fallback to HTTP
    if (window.electronAPI?.runScan) {
      return await window.electronAPI.runScan(url);
    }
    // HTTP fallback
    const res = await fetch('http://127.0.0.1:5000/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  renderResults(data) {
    if (!data) return;

    // Screenshot
    if (data.screenshot) {
      const img = document.getElementById('screenshot-img');
      img.src = data.screenshot.startsWith('data:') ? data.screenshot : `data:image/png;base64,${data.screenshot}`;
      img.style.display = 'block';
      document.getElementById('screenshot-container').querySelector('.screenshot-placeholder').style.display = 'none';
      document.getElementById('ss-status').textContent = 'Captured';
      this.log('Screenshot captured.', 'success');
    }

    // Pathfinder
    const redirects = data.redirects || data.redirect_chain || [];
    if (redirects.length) {
      const chainEl = document.getElementById('path-chain');
      chainEl.innerHTML = '';
      document.getElementById('path-count').textContent = `${redirects.length} hop${redirects.length !== 1 ? 's' : ''}`;
      redirects.forEach((hop, i) => {
        const div = document.createElement('div');
        div.className = 'path-hop';
        const flag = hop.malicious ? 'malicious' : hop.suspicious ? 'suspicious' : 'clean';
        div.innerHTML = `
          <span class="path-hop-num">${i + 1}</span>
          <span class="path-hop-url">${hop.url || hop}</span>
          <span class="path-hop-flag ${flag}">${flag.toUpperCase()}</span>
        `;
        chainEl.appendChild(div);
        this.log(`Hop ${i+1}: ${hop.url || hop}`, hop.malicious ? 'error' : 'info');
      });
    }

    // Crypto findings
    const crypto = data.crypto_findings || data.crypto || {};
    const aesKeys = crypto.aes_keys || data.aes_keys || [];
    const ivs     = crypto.ivs     || data.ivs     || [];
    const payloads = crypto.decrypted_payloads || data.decrypted_payloads || [];
    const adnets   = data.ad_networks || data.flagged_networks || [];

    document.getElementById('aes-count').textContent   = aesKeys.length;
    document.getElementById('iv-count').textContent    = ivs.length;
    document.getElementById('payload-count').textContent = payloads.length;
    document.getElementById('adnet-count').textContent   = adnets.length;

    if (aesKeys.length)   this.log(`Found ${aesKeys.length} AES key(s).`, 'warn');
    if (payloads.length)  this.log(`Decrypted ${payloads.length} payload(s).`, 'error');
    if (adnets.length)    this.log(`Flagged ${adnets.length} malicious ad network(s).`, 'error');

    // Decrypted payloads
    const dpEl = document.getElementById('decrypted-payloads');
    payloads.forEach(p => {
      const div = document.createElement('div');
      div.className = 'decrypted-item';
      div.textContent = typeof p === 'string' ? p : JSON.stringify(p);
      dpEl.appendChild(div);
    });

    // Logs from backend
    const logs = data.logs || [];
    logs.forEach(l => this.log(l.msg || l, l.level || 'info'));
  },
};

/* ── BOOT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  TorMonitor.start();
  adwareScan.init();
});