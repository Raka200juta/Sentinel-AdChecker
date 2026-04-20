/* ═══════════════════════════════════════════════════════════
   SENTINEL DESKTOP — PHISHING ENGINE (Frontend)
   Loads Phishing_category_detection.csv, scores URLs,
   and renders MobSF-style report in the phishing dashboard.
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ── CATEGORY DATABASE ───────────────────────────────────── */
const PhishingDB = {
  categories: [],  // Loaded from CSV
  loaded: false,

  /**
   * Load and parse Phishing_category_detection.csv
   * Tries: electronAPI path → HTTP relative → bundled fallback
   */
  async load() {
    if (this.loaded) return;
    try {
      let csvText = '';

      if (window.electronAPI?.readPhishingDB) {
        csvText = await window.electronAPI.readPhishingDB();
      } else {
        // Try loading via HTTP (when served) or relative path
        const paths = [
          '../Daph/Phishing_category_detection.csv',
          './Phishing_category_detection.csv',
          'http://127.0.0.1:5000/phishing_db',
        ];
        for (const p of paths) {
          try {
            const r = await fetch(p, { signal: AbortSignal.timeout(3000) });
            if (r.ok) { csvText = await r.text(); break; }
          } catch { /* try next */ }
        }
      }

      if (csvText) {
        this.categories = this._parseCSV(csvText);
        console.log(`[PhishingDB] Loaded ${this.categories.length} entries`);
      } else {
        // Use built-in fallback database
        this.categories = BUILTIN_CATEGORIES;
        console.warn('[PhishingDB] Using built-in fallback category list');
      }
      this.loaded = true;
    } catch (e) {
      console.error('[PhishingDB] Load error:', e);
      this.categories = BUILTIN_CATEGORIES;
      this.loaded = true;
    }
  },

  _parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return BUILTIN_CATEGORIES;
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = this._splitCSVLine(lines[i]);
      if (vals.length < 2) continue;
      const row = {};
      headers.forEach((h, j) => row[h] = (vals[j] || '').replace(/^"|"$/g, '').trim());
      results.push(row);
    }
    return results;
  },

  _splitCSVLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += ch;
    }
    result.push(cur);
    return result;
  },

  /**
   * Match a URL against the category database.
   * Returns array of matched categories with confidence.
   */
  matchURL(url) {
    if (!this.loaded || !this.categories.length) return [];
    const urlLower = url.toLowerCase();
    const matches = [];

    for (const row of this.categories) {
      // Detect column names (flexible CSV structure)
      const keyword  = row.keyword  || row.pattern    || row.indicator || row.domain   || '';
      const category = row.category || row.type       || row.label     || row.class    || 'Unknown';
      const severity = row.severity || row.risk_level || row.risk      || row.score    || '';
      const description = row.description || row.desc || '';

      if (!keyword) continue;

      const kwLower = keyword.toLowerCase();
      if (urlLower.includes(kwLower) || this._fuzzyMatch(urlLower, kwLower)) {
        // Confidence: exact domain match = high, keyword match = medium
        const exactDomain = urlLower.split('/')[2]?.includes(kwLower);
        const confidence = exactDomain ? 'HIGH' : 'MEDIUM';
        matches.push({ category, keyword, severity, description, confidence });
      }
    }

    // Deduplicate by category
    const seen = new Set();
    return matches.filter(m => {
      if (seen.has(m.category)) return false;
      seen.add(m.category);
      return true;
    }).slice(0, 6);
  },

  _fuzzyMatch(url, keyword) {
    if (keyword.length < 4) return false;
    // Check for typosquatting (edit distance ≤ 2 for domain segment)
    const domain = url.split('/')[2] || '';
    const segments = domain.split('.');
    for (const seg of segments) {
      if (seg.length > 3 && this._editDistance(seg, keyword) <= 2) return true;
    }
    return false;
  },

  _editDistance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] :
          1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[a.length][b.length];
  },
};

/* ── BUILT-IN FALLBACK CATEGORY DB ───────────────────────── */
const BUILTIN_CATEGORIES = [
  { keyword: 'login',    category: 'Credential Harvesting', severity: 'HIGH',   description: 'Fake login page to steal credentials' },
  { keyword: 'signin',   category: 'Credential Harvesting', severity: 'HIGH',   description: 'Sign-in lure page' },
  { keyword: 'verify',   category: 'Account Verification',  severity: 'HIGH',   description: 'Account verification phishing' },
  { keyword: 'update',   category: 'Account Update Lure',   severity: 'MEDIUM', description: 'Fake account update request' },
  { keyword: 'secure',   category: 'Banking/Finance',       severity: 'HIGH',   description: 'Fake security page' },
  { keyword: 'banking',  category: 'Banking/Finance',       severity: 'HIGH',   description: 'Banking phishing' },
  { keyword: 'paypal',   category: 'Payment Service Spoof', severity: 'CRITICAL', description: 'PayPal brand impersonation' },
  { keyword: 'amazon',   category: 'E-Commerce Spoof',      severity: 'HIGH',   description: 'Amazon brand impersonation' },
  { keyword: 'apple',    category: 'Tech Brand Spoof',      severity: 'HIGH',   description: 'Apple ID phishing' },
  { keyword: 'microsoft',category: 'Tech Brand Spoof',      severity: 'HIGH',   description: 'Microsoft account phishing' },
  { keyword: 'google',   category: 'Tech Brand Spoof',      severity: 'HIGH',   description: 'Google account phishing' },
  { keyword: 'netflix',  category: 'Streaming Spoof',       severity: 'MEDIUM', description: 'Netflix billing phishing' },
  { keyword: 'account',  category: 'Account Takeover',      severity: 'MEDIUM', description: 'Account-themed lure' },
  { keyword: 'confirm',  category: 'Confirmation Scam',     severity: 'MEDIUM', description: 'Fake confirmation page' },
  { keyword: 'invoice',  category: 'Business Email Compromise', severity: 'HIGH', description: 'Fake invoice lure' },
  { keyword: 'prize',    category: 'Scam/Giveaway',         severity: 'MEDIUM', description: 'Fake prize notification' },
  { keyword: 'free',     category: 'Scam/Giveaway',         severity: 'LOW',    description: 'Free offer lure' },
  { keyword: 'crypto',   category: 'Crypto Scam',           severity: 'HIGH',   description: 'Cryptocurrency phishing' },
  { keyword: 'wallet',   category: 'Crypto Scam',           severity: 'HIGH',   description: 'Crypto wallet drainer' },
  { keyword: 'support',  category: 'Tech Support Scam',     severity: 'MEDIUM', description: 'Fake tech support page' },
  { keyword: 'helpdesk', category: 'Tech Support Scam',     severity: 'MEDIUM', description: 'Helpdesk impersonation' },
  { keyword: 'refund',   category: 'Refund Scam',           severity: 'MEDIUM', description: 'Fake refund page' },
  { keyword: 'tracking', category: 'Parcel Delivery Scam',  severity: 'MEDIUM', description: 'Fake delivery tracking' },
  { keyword: 'delivery', category: 'Parcel Delivery Scam',  severity: 'MEDIUM', description: 'Parcel delivery phishing' },
  { keyword: 'covid',    category: 'Health Scam',           severity: 'HIGH',   description: 'Health crisis phishing' },
  { keyword: 'gov',      category: 'Government Impersonation', severity: 'HIGH', description: 'Government site spoof' },
  { keyword: 'irs',      category: 'Tax Scam',              severity: 'CRITICAL', description: 'Tax authority impersonation' },
];

/* ── HEURISTIC SCORING ENGINE ────────────────────────────── */
const PhishingScorer = {
  /**
   * Score a URL and return detailed breakdown.
   * Mimics MobSF-style risk quantification.
   */
  score(url) {
    let parsed;
    try {
      parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      return null;
    }

    const domain   = parsed.hostname;
    const fullURL  = parsed.href;
    const path     = parsed.pathname;
    const params   = parsed.search;

    const breakdown = {
      url_structure: 0,
      domain_reputation: 0,
      keyword_matching: 0,
      tld_risk: 0,
      category_db: 0,
    };
    const iocs = [];

    /* ── 1. URL STRUCTURE ANALYSIS ── */
    // Long URLs
    if (fullURL.length > 75)  { breakdown.url_structure += 15; iocs.push({ sev: 'medium', text: `Suspicious URL length: ${fullURL.length} chars` }); }
    if (fullURL.length > 120) { breakdown.url_structure += 15; }

    // IP address as host
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) {
      breakdown.url_structure += 25;
      breakdown.domain_reputation += 20;
      iocs.push({ sev: 'high', text: `IP address used as host: ${domain}` });
    }

    // Multiple subdomains
    const subCount = domain.split('.').length - 2;
    if (subCount >= 3) { breakdown.url_structure += 10 * (subCount - 2); iocs.push({ sev: 'medium', text: `Excessive subdomain depth: ${subCount}` }); }
    if (subCount >= 5) iocs.push({ sev: 'high', text: 'Very deep subdomain nesting (obfuscation technique)' });

    // @ in URL (obfuscation)
    if (fullURL.includes('@')) { breakdown.url_structure += 25; iocs.push({ sev: 'high', text: 'URL contains @ character (domain obfuscation)' }); }

    // Double slash in path
    if (path.includes('//')) { breakdown.url_structure += 10; iocs.push({ sev: 'medium', text: 'Double slash in URL path' }); }

    // Hex encoding
    if (/%[0-9a-f]{2}/i.test(fullURL)) { breakdown.url_structure += 8; iocs.push({ sev: 'low', text: 'URL percent-encoding detected' }); }

    // Port anomaly
    if (parsed.port && !['80','443','8080','8443'].includes(parsed.port)) {
      breakdown.url_structure += 15;
      iocs.push({ sev: 'medium', text: `Non-standard port: ${parsed.port}` });
    }

    // No HTTPS
    if (parsed.protocol !== 'https:') { breakdown.domain_reputation += 15; iocs.push({ sev: 'medium', text: 'No HTTPS — plaintext connection' }); }

    /* ── 2. DOMAIN REPUTATION ── */
    // Suspicious TLDs
    const tld = domain.split('.').pop().toLowerCase();
    const highRiskTLDs = ['tk','ml','ga','cf','gq','xyz','top','club','online','site','icu','buzz','link','work','click'];
    const medRiskTLDs  = ['info','biz','mobi','name','pro','cc','ws','pw'];
    if (highRiskTLDs.includes(tld)) {
      breakdown.tld_risk += 25; breakdown.domain_reputation += 10;
      iocs.push({ sev: 'high', text: `High-risk TLD: .${tld}` });
    } else if (medRiskTLDs.includes(tld)) {
      breakdown.tld_risk += 12;
      iocs.push({ sev: 'medium', text: `Elevated-risk TLD: .${tld}` });
    }

    // Dashes in domain (typosquatting)
    const domainMain = domain.split('.').slice(-2, -1)[0] || '';
    const dashCount = (domainMain.match(/-/g) || []).length;
    if (dashCount >= 2) { breakdown.domain_reputation += 12 * dashCount; iocs.push({ sev: 'medium', text: `Multiple hyphens in domain: ${dashCount}` }); }

    // Brand keyword in subdomain (lookalike)
    const brands = ['paypal','amazon','apple','google','microsoft','netflix','facebook','instagram','twitter','linkedin','ebay','chase','wellsfargo','bankofamerica'];
    for (const brand of brands) {
      if (domain.includes(brand) && !domain.endsWith(`${brand}.com`) && !domain.endsWith(`${brand}.co`)) {
        breakdown.domain_reputation += 30;
        breakdown.keyword_matching  += 20;
        iocs.push({ sev: 'high', text: `Brand impersonation: "${brand}" in non-official domain` });
        break;
      }
    }

    /* ── 3. KEYWORD MATCHING ── */
    const suspKeywords = [
      { kw: 'login',    score: 10 }, { kw: 'signin',   score: 10 },
      { kw: 'verify',   score: 12 }, { kw: 'confirm',  score: 8  },
      { kw: 'account',  score: 8  }, { kw: 'secure',   score: 8  },
      { kw: 'update',   score: 8  }, { kw: 'password', score: 15 },
      { kw: 'banking',  score: 15 }, { kw: 'wallet',   score: 15 },
      { kw: 'crypto',   score: 12 }, { kw: 'invoice',  score: 10 },
      { kw: 'support',  score: 8  }, { kw: 'helpdesk', score: 8  },
      { kw: '0fficial', score: 20 }, { kw: '1ogin',    score: 20 },
    ];
    const urlLower = fullURL.toLowerCase();
    let kwScore = 0;
    for (const { kw, score } of suspKeywords) {
      if (urlLower.includes(kw)) kwScore += score;
    }
    breakdown.keyword_matching += Math.min(kwScore, 40);
    if (kwScore >= 20) iocs.push({ sev: 'high', text: `Multiple phishing keywords detected in URL` });

    /* ── 4. CAT DB MATCH (done externally, placeholder) ── */
    // Will be filled after PhishingDB.matchURL()

    // Normalize each dimension to 0-100
    const cap = v => Math.min(Math.round(v), 100);
    const dims = {
      url_structure:     cap(breakdown.url_structure),
      domain_reputation: cap(breakdown.domain_reputation),
      keyword_matching:  cap(breakdown.keyword_matching),
      tld_risk:          cap(breakdown.tld_risk),
      category_db:       0, // filled after DB match
    };

    return {
      dims,
      iocs,
      parsed,
      domain,
      tld,
      subCount,
      hasIP: /^\d{1,3}(\.\d{1,3}){3}$/.test(domain),
      hasHTTPS: parsed.protocol === 'https:',
      urlLength: fullURL.length,
      port: parsed.port,
      hasSuspChars: fullURL.includes('@') || fullURL.includes('//'),
    };
  },

  computeTotal(dims) {
    // Weighted average (MobSF-style composite)
    const weights = { url_structure: 0.25, domain_reputation: 0.30, keyword_matching: 0.20, tld_risk: 0.10, category_db: 0.15 };
    return Math.min(Math.round(
      Object.entries(weights).reduce((acc, [k, w]) => acc + (dims[k] || 0) * w, 0)
    ), 100);
  },

  verdict(score) {
    if (score >= 80) return { label: 'CRITICAL THREAT', cls: 'verdict-critical', color: '#ff2222' };
    if (score >= 60) return { label: 'HIGH RISK',       cls: 'verdict-high',     color: '#ff4444' };
    if (score >= 35) return { label: 'MEDIUM RISK',     cls: 'verdict-medium',   color: '#f0a500' };
    return               { label: 'LOW RISK',           cls: 'verdict-low',      color: '#00ff9d' };
  },
};

/* ── PHISHING SCAN CONTROLLER ────────────────────────────── */
window.phishingScan = {
  running: false,

  phishLog(msg, type = 'info') {
    const el = document.getElementById('phish-log-terminal');
    if (!el) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const ts = new Date().toTimeString().slice(0, 8);
    entry.textContent = `[${ts}] ${msg}`;
    el.appendChild(entry);
    el.scrollTop = el.scrollHeight;
  },

  setStatus(st) {
    const chip = document.getElementById('status-phishing');
    if (!chip) return;
    const map = { idle: '● IDLE', scanning: '● ANALYZING', done: '● COMPLETE', error: '● ERROR' };
    chip.textContent = map[st] || '● IDLE';
    chip.className = `status-chip status-${st === 'done' ? 'done' : st === 'error' ? 'error' : st === 'scanning' ? 'scanning' : 'idle'}`;
  },

  toggleButton(busy) {
    const btn = document.getElementById('phishing-scan-btn');
    if (!btn) return;
    btn.querySelector('.scan-btn-text').style.display = busy ? 'none' : '';
    btn.querySelector('.scan-btn-loader').style.display = busy ? 'flex' : 'none';
    btn.disabled = busy;
  },

  async start() {
    if (this.running) return;
    const urlEl = document.getElementById('phishing-url-input');
    const url = urlEl?.value?.trim();
    if (!url) { this.phishLog('ERROR: No URL entered.', 'error'); return; }

    this.running = true;
    this.toggleButton(true);
    this.setStatus('scanning');

    // Show results area, hide empty state
    document.getElementById('phishing-results').style.display = 'block';
    document.getElementById('phishing-empty').style.display = 'none';

    // Reset score ring
    document.getElementById('score-ring-bar').style.strokeDashoffset = '314';
    document.getElementById('score-ring-bar').style.stroke = '#00ff9d';
    document.getElementById('score-value').textContent = '—';
    document.getElementById('score-verdict').textContent = 'Analyzing…';
    document.getElementById('verdict-badge').className = 'verdict-badge';
    document.getElementById('verdict-badge').textContent = '';
    document.getElementById('category-match').innerHTML = '<div class="cat-empty">Matching categories…</div>';
    document.getElementById('ioc-list').innerHTML = '<div class="ioc-placeholder">Detecting indicators…</div>';
    document.getElementById('phish-log-terminal').innerHTML = '';

    this.phishLog(`Target URL: ${url}`, 'info');
    this.phishLog('Loading phishing category database…', 'debug');

    try {
      // 1. Load DB
      await PhishingDB.load();
      this.phishLog(`Category DB loaded: ${PhishingDB.categories.length} entries`, 'success');

      // 2. Heuristic scoring
      this.phishLog('Running heuristic URL analysis…', 'debug');
      const scoreData = PhishingScorer.score(url);
      if (!scoreData) throw new Error('Invalid URL format');

      // 3. Category DB match
      this.phishLog('Matching against threat category database…', 'debug');
      const catMatches = PhishingDB.matchURL(url);
      scoreData.dims.category_db = catMatches.length > 0 ? Math.min(catMatches.length * 20, 80) : 0;

      // 4. Compute total
      const totalScore = PhishingScorer.computeTotal(scoreData.dims);
      const verdict    = PhishingScorer.verdict(totalScore);

      this.phishLog(`Analysis complete. Risk score: ${totalScore}/100`, totalScore >= 60 ? 'error' : totalScore >= 35 ? 'warn' : 'success');

      // 5. Try backend for deeper analysis (optional)
      let backendData = null;
      try {
        backendData = await this._callBackend(url);
        this.phishLog('Backend deep analysis complete.', 'success');
      } catch {
        this.phishLog('Backend analysis unavailable — using local engine only.', 'warn');
      }

      // Merge backend data if available
      if (backendData) {
        if (backendData.iocs) scoreData.iocs.push(...backendData.iocs);
        if (backendData.score !== undefined) {
          // Average with backend score
          const merged = Math.round((totalScore + backendData.score) / 2);
          this._render(merged, verdict, scoreData, catMatches, backendData);
        } else {
          this._render(totalScore, verdict, scoreData, catMatches, null);
        }
      } else {
        this._render(totalScore, verdict, scoreData, catMatches, null);
      }

      this.setStatus('done');

    } catch (err) {
      this.phishLog(`ANALYSIS FAILED: ${err.message}`, 'error');
      this.setStatus('error');
    } finally {
      this.running = false;
      this.toggleButton(false);
    }
  },

  async _callBackend(url) {
    if (window.electronAPI?.analyzePhishing) {
      return await window.electronAPI.analyzePhishing(url);
    }
    const res = await fetch('http://127.0.0.1:5000/analyze/phishing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  _render(score, verdict, scoreData, catMatches, backendData) {
    /* SCORE RING */
    const ringEl = document.getElementById('score-ring-bar');
    const circ   = 2 * Math.PI * 50; // r=50 → 314.16
    const offset = circ - (score / 100) * circ;
    ringEl.style.strokeDashoffset = offset.toFixed(1);
    ringEl.style.stroke = verdict.color;
    document.getElementById('score-value').textContent = score;
    document.getElementById('score-verdict').textContent = verdict.label;
    document.getElementById('score-verdict').style.color = verdict.color;
    const badgeEl = document.getElementById('verdict-badge');
    badgeEl.className = `verdict-badge ${verdict.cls}`;
    badgeEl.textContent = verdict.label;

    /* RISK BARS */
    const bars = [
      ['rb-url',     'url_structure'],
      ['rb-domain',  'domain_reputation'],
      ['rb-keyword', 'keyword_matching'],
      ['rb-tld',     'tld_risk'],
      ['rb-catdb',   'category_db'],
    ];
    bars.forEach(([prefix, key]) => {
      const val = scoreData.dims[key] || 0;
      const fill = document.getElementById(prefix);
      const pct  = document.getElementById(`${prefix}-pct`);
      if (fill) { fill.style.width = `${val}%`; fill.style.background = this._barColor(val); }
      if (pct)  pct.textContent = `${val}%`;
    });

    /* DOMAIN INTEL */
    const di = (id, val, cls) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = val; el.className = `intel-val ${cls || ''}`; }
    };
    di('di-domain',    scoreData.domain);
    di('di-tld',       `.${scoreData.tld}`, scoreData.dims.tld_risk >= 20 ? 'risk-high' : scoreData.dims.tld_risk >= 10 ? 'risk-medium' : 'risk-low');
    di('di-length',    `${scoreData.urlLength} chars`, scoreData.urlLength > 120 ? 'risk-high' : scoreData.urlLength > 75 ? 'risk-medium' : '');
    di('di-subdomain', `${scoreData.subCount} level(s)`, scoreData.subCount >= 4 ? 'risk-high' : scoreData.subCount >= 3 ? 'risk-medium' : '');
    di('di-hasip',     scoreData.hasIP ? 'YES ⚠' : 'No', scoreData.hasIP ? 'risk-high' : '');
    di('di-chars',     scoreData.hasSuspChars ? 'YES ⚠' : 'None', scoreData.hasSuspChars ? 'risk-high' : '');
    di('di-port',      scoreData.port ? `Non-standard (:${scoreData.port})` : 'Normal', scoreData.port ? 'risk-medium' : '');
    di('di-https',     scoreData.hasHTTPS ? 'Yes ✓' : 'NO ⚠', scoreData.hasHTTPS ? 'risk-low' : 'risk-high');

    /* CATEGORY MATCHES */
    const catEl = document.getElementById('category-match');
    if (catMatches.length === 0) {
      catEl.innerHTML = '<div class="cat-empty">No category match in database</div>';
    } else {
      catEl.innerHTML = '';
      catMatches.forEach(m => {
        const sev = (m.severity || '').toUpperCase();
        const col = sev === 'CRITICAL' ? '#ff2222' : sev === 'HIGH' ? '#ff4444' : sev === 'MEDIUM' ? '#f0a500' : '#00ff9d';
        const div = document.createElement('div');
        div.className = 'cat-item';
        div.style.borderLeftColor = col;
        div.innerHTML = `
          <div style="flex:1">
            <div class="cat-item-name" style="color:${col}">${m.category}</div>
            <div class="cat-item-desc">${m.description || ''} — matched: <code>${m.keyword}</code></div>
          </div>
          <div class="cat-item-conf" style="color:${col}">${m.confidence || sev}</div>
        `;
        catEl.appendChild(div);
        this.phishLog(`Category match: ${m.category} (${m.confidence || sev})`, sev === 'HIGH' || sev === 'CRITICAL' ? 'error' : 'warn');
      });
    }

    /* IOCs */
    const iocEl = document.getElementById('ioc-list');
    if (scoreData.iocs.length === 0) {
      iocEl.innerHTML = '<div class="ioc-placeholder">No indicators detected</div>';
    } else {
      iocEl.innerHTML = '';
      scoreData.iocs.forEach(ioc => {
        const div = document.createElement('div');
        div.className = 'ioc-item';
        div.innerHTML = `<span class="ioc-severity ioc-sev-${ioc.sev}">${ioc.sev.toUpperCase()}</span><span class="ioc-text">${ioc.text}</span>`;
        iocEl.appendChild(div);
        this.phishLog(`IOC [${ioc.sev.toUpperCase()}]: ${ioc.text}`, ioc.sev === 'high' ? 'error' : ioc.sev === 'medium' ? 'warn' : 'info');
      });
    }

    // Backend extra logs
    if (backendData?.logs) {
      backendData.logs.forEach(l => this.phishLog(l.msg || l, l.level || 'info'));
    }
  },

  _barColor(val) {
    if (val >= 70) return '#ff4444';
    if (val >= 40) return '#f0a500';
    return '#00ff9d';
  },
};