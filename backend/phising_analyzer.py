"""
═══════════════════════════════════════════════════════════════
SENTINEL — backend/phishing_analyzer.py
Phishing URL analysis engine with CSV category database.
Place in: backend/phishing_analyzer.py
═══════════════════════════════════════════════════════════════
"""

import re
import csv
import urllib.parse
import socket
from datetime import datetime


class PhishingAnalyzer:
    """
    MobSF-style phishing URL analyzer.
    Scores URLs across 5 risk dimensions and matches against
    the Phishing_category_detection.csv database.
    """

    HIGH_RISK_TLDS = {
        'tk','ml','ga','cf','gq','xyz','top','club','online',
        'site','icu','buzz','link','work','click','monster',
        'rest','fun','rocks','space','live','host','store',
    }
    MED_RISK_TLDS = {'info','biz','mobi','name','pro','cc','ws','pw','su'}

    BRAND_KEYWORDS = [
        'paypal','amazon','apple','google','microsoft','netflix',
        'facebook','instagram','twitter','linkedin','ebay','chase',
        'wellsfargo','bankofamerica','coinbase','binance','metamask',
    ]

    PHISHING_KEYWORDS = [
        ('login',    12), ('signin',   12), ('verify',   14),
        ('confirm',  10), ('account',  8),  ('secure',   8),
        ('update',   8),  ('password', 16), ('banking',  16),
        ('wallet',   16), ('crypto',   12), ('invoice',  10),
        ('support',  8),  ('helpdesk', 8),  ('webmail',  10),
        ('webscr',   18), ('cmd=_s-xclick', 20),
    ]

    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self.db = self._load_db()

    # ─── DB LOADING ────────────────────────────────────────

    def _load_db(self) -> list:
        entries = []
        try:
            with open(self.csv_path, newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Normalize keys to lowercase
                    entries.append({k.strip().lower(): v.strip() for k, v in row.items()})
            print(f"[PhishingAnalyzer] Loaded {len(entries)} DB entries from {self.csv_path}")
        except FileNotFoundError:
            print(f"[PhishingAnalyzer] WARNING: CSV not found at {self.csv_path}, using empty DB")
        except Exception as e:
            print(f"[PhishingAnalyzer] DB load error: {e}")
        return entries

    # ─── MAIN ANALYSIS ─────────────────────────────────────

    def analyze(self, url: str) -> dict:
        """Full phishing analysis. Returns structured report dict."""

        # Normalize URL
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url

        try:
            parsed = urllib.parse.urlparse(url)
        except Exception:
            return {'error': 'Cannot parse URL'}

        domain   = parsed.netloc or parsed.path
        tld      = domain.split('.')[-1].lower() if '.' in domain else ''
        sub_parts = domain.split('.')
        sub_depth = max(0, len(sub_parts) - 2)

        dims  = {}
        iocs  = []
        logs  = []

        def log(msg, level='info'):
            logs.append({'msg': msg, 'level': level})

        log(f"Analyzing: {url}")

        # ── DIMENSION 1: URL STRUCTURE ──────────────────────
        url_score = 0

        # Length
        if len(url) > 75:
            url_score += 15
            iocs.append({'sev': 'medium', 'text': f'Suspicious URL length: {len(url)} chars'})
        if len(url) > 120:
            url_score += 15
            iocs.append({'sev': 'high', 'text': 'Extremely long URL (obfuscation technique)'})

        # IP as host
        ip_pattern = r'^\d{1,3}(\.\d{1,3}){3}$'
        is_ip = bool(re.match(ip_pattern, domain.split(':')[0]))
        if is_ip:
            url_score += 25
            iocs.append({'sev': 'high', 'text': f'IP address used as host: {domain}'})
            log(f"IP host detected: {domain}", 'warn')

        # @ in URL
        if '@' in url:
            url_score += 25
            iocs.append({'sev': 'high', 'text': 'URL contains @ character (domain obfuscation)'})

        # Double slash in path
        if '//' in parsed.path:
            url_score += 10
            iocs.append({'sev': 'medium', 'text': 'Double slash in URL path'})

        # Subdomain depth
        if sub_depth >= 3:
            url_score += 10 * (sub_depth - 2)
            iocs.append({'sev': 'medium', 'text': f'Excessive subdomain depth: {sub_depth} levels'})
        if sub_depth >= 5:
            iocs.append({'sev': 'high', 'text': 'Very deep subdomain nesting — likely obfuscation'})

        # Non-standard port
        port = parsed.port
        has_port_anomaly = port and port not in (80, 443, 8080, 8443)
        if has_port_anomaly:
            url_score += 15
            iocs.append({'sev': 'medium', 'text': f'Non-standard port: {port}'})

        # Hex encoding
        if re.search(r'%[0-9a-fA-F]{2}', url):
            url_score += 8
            iocs.append({'sev': 'low', 'text': 'URL percent-encoding detected'})

        dims['url_structure'] = min(url_score, 100)
        log(f"URL structure score: {dims['url_structure']}")

        # ── DIMENSION 2: DOMAIN REPUTATION ─────────────────
        dom_score = 0

        # No HTTPS
        has_https = parsed.scheme == 'https'
        if not has_https:
            dom_score += 15
            iocs.append({'sev': 'medium', 'text': 'No HTTPS — connection is unencrypted'})
            log("HTTP only — no TLS", 'warn')

        # Hyphens in domain
        main_label = sub_parts[-2] if len(sub_parts) >= 2 else domain
        dash_count = main_label.count('-')
        if dash_count >= 2:
            dom_score += 12 * dash_count
            iocs.append({'sev': 'medium', 'text': f'Multiple hyphens in domain label: {dash_count}'})

        # Brand impersonation
        brand_hit = None
        for brand in self.BRAND_KEYWORDS:
            if brand in domain.lower():
                official_endings = (f'{brand}.com', f'{brand}.co', f'{brand}.net', f'{brand}.org')
                if not any(domain.lower().endswith(e) for e in official_endings):
                    dom_score += 35
                    iocs.append({'sev': 'high', 'text': f'Brand impersonation: "{brand}" in non-official domain'})
                    log(f"Brand spoof detected: {brand}", 'error')
                    brand_hit = brand
                    break

        # DNS resolve check (optional, may time out)
        try:
            socket.setdefaulttimeout(3)
            socket.gethostbyname(domain.split(':')[0])
            log(f"DNS resolved: {domain}")
        except socket.gaierror:
            dom_score += 10
            iocs.append({'sev': 'medium', 'text': f'Domain does not resolve: {domain}'})
            log(f"DNS resolution failed: {domain}", 'warn')

        dims['domain_reputation'] = min(dom_score, 100)
        log(f"Domain reputation score: {dims['domain_reputation']}")

        # ── DIMENSION 3: KEYWORD MATCHING ──────────────────
        kw_score = 0
        url_lower = url.lower()
        matched_kws = []
        for kw, weight in self.PHISHING_KEYWORDS:
            if kw in url_lower:
                kw_score += weight
                matched_kws.append(kw)

        if matched_kws:
            iocs.append({'sev': 'high' if kw_score >= 20 else 'medium',
                         'text': f'Phishing keywords in URL: {", ".join(matched_kws)}'})
            log(f"Keyword matches: {matched_kws}", 'warn')

        dims['keyword_matching'] = min(kw_score, 100)
        log(f"Keyword score: {dims['keyword_matching']}")

        # ── DIMENSION 4: TLD RISK ───────────────────────────
        tld_score = 0
        if tld in self.HIGH_RISK_TLDS:
            tld_score = 30
            iocs.append({'sev': 'high', 'text': f'High-risk TLD: .{tld}'})
            log(f"High-risk TLD: .{tld}", 'warn')
        elif tld in self.MED_RISK_TLDS:
            tld_score = 15
            iocs.append({'sev': 'medium', 'text': f'Elevated-risk TLD: .{tld}'})

        dims['tld_risk'] = min(tld_score, 100)

        # ── DIMENSION 5: CATEGORY DATABASE MATCH ───────────
        cat_matches = self._match_db(url)
        cat_score = min(len(cat_matches) * 20, 80) if cat_matches else 0
        if cat_matches:
            iocs.append({'sev': 'high', 'text': f'Matched {len(cat_matches)} phishing category/categories in database'})
            log(f"DB matches: {[m['category'] for m in cat_matches]}", 'error')

        dims['category_db'] = cat_score
        log(f"Category DB score: {dims['category_db']}")

        # ── COMPOSITE SCORE ─────────────────────────────────
        weights = {
            'url_structure':     0.25,
            'domain_reputation': 0.30,
            'keyword_matching':  0.20,
            'tld_risk':          0.10,
            'category_db':       0.15,
        }
        total = min(round(sum(dims[k] * w for k, w in weights.items())), 100)
        verdict = self._verdict(total)

        log(f"Final risk score: {total}/100 → {verdict['label']}", 'error' if total >= 60 else 'warn' if total >= 35 else 'info')

        return {
            'url':        url,
            'score':      total,
            'verdict':    verdict,
            'dims':       dims,
            'iocs':       iocs,
            'categories': cat_matches,
            'domain_info': {
                'domain':    domain,
                'tld':       tld,
                'sub_depth': sub_depth,
                'has_ip':    is_ip,
                'has_https': has_https,
                'url_length': len(url),
                'port':      port,
                'has_susp_chars': '@' in url or '//' in parsed.path,
                'brand_hit': brand_hit,
            },
            'logs':       logs,
            'timestamp':  datetime.utcnow().isoformat() + 'Z',
        }

    # ─── DB MATCHING ───────────────────────────────────────

    def _match_db(self, url: str) -> list:
        """Match URL against the phishing category CSV database."""
        if not self.db:
            return []

        url_lower = url.lower()
        matches   = []
        seen_cats = set()

        for row in self.db:
            # Flexible column mapping
            keyword  = row.get('keyword') or row.get('pattern') or row.get('indicator') or row.get('domain') or ''
            category = row.get('category') or row.get('type') or row.get('label') or row.get('class') or 'Unknown'
            severity = row.get('severity') or row.get('risk_level') or row.get('risk') or 'MEDIUM'
            desc     = row.get('description') or row.get('desc') or ''

            if not keyword:
                continue

            kw_lower = keyword.lower()
            matched  = False
            confidence = 'MEDIUM'

            # Direct substring match
            if kw_lower in url_lower:
                matched    = True
                confidence = 'HIGH' if kw_lower in (url_lower.split('/')[2] or '') else 'MEDIUM'

            # Typosquatting check (edit distance ≤ 2 on domain segment)
            if not matched and len(kw_lower) >= 5:
                try:
                    domain = url_lower.split('/')[2] or ''
                    for seg in domain.split('.'):
                        if len(seg) > 3 and self._edit_distance(seg, kw_lower) <= 2:
                            matched    = True
                            confidence = 'LOW'
                            break
                except Exception:
                    pass

            if matched and category not in seen_cats:
                seen_cats.add(category)
                matches.append({
                    'category':    category,
                    'keyword':     keyword,
                    'severity':    severity.upper(),
                    'description': desc,
                    'confidence':  confidence,
                })
                if len(matches) >= 6:
                    break

        return matches

    @staticmethod
    def _edit_distance(a: str, b: str) -> int:
        """Levenshtein distance."""
        la, lb = len(a), len(b)
        if abs(la - lb) > 3:
            return 99  # Fast bail-out
        dp = list(range(lb + 1))
        for i in range(1, la + 1):
            prev = dp[:]
            dp[0] = i
            for j in range(1, lb + 1):
                dp[j] = prev[j-1] if a[i-1] == b[j-1] else 1 + min(prev[j], dp[j-1], prev[j-1])
        return dp[lb]

    @staticmethod
    def _verdict(score: int) -> dict:
        if score >= 80:
            return {'label': 'CRITICAL THREAT', 'level': 'critical', 'color': '#ff2222'}
        if score >= 60:
            return {'label': 'HIGH RISK',       'level': 'high',     'color': '#ff4444'}
        if score >= 35:
            return {'label': 'MEDIUM RISK',     'level': 'medium',   'color': '#f0a500'}
        return     {'label': 'LOW RISK',         'level': 'low',      'color': '#00ff9d'}