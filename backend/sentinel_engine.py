import requests
import re
import sys
import whois
import base64
import csv
import json
import math
import tldextract
from urllib.parse import urlparse, urljoin, unquote
from bs4 import BeautifulSoup
from datetime import datetime

# Coba import library kripto
try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad
except ImportError:
    pass # Jalan terus meski tanpa crypto (untuk scanning tracker)

# === KONFIGURASI ===
PROXIES = {
    'http': 'socks5h://127.0.0.1:9050',
    'https': 'socks5h://127.0.0.1:9050'
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
}

class Sentinel:

                ## TOOLS ANTI ADWARE

    def __init__(self, target_url):
        if not target_url.startswith(('http://', 'https://')):
            target_url = 'http://' + target_url
        self.target_url = target_url
        self.domain = urlparse(target_url).netloc
        self.session = requests.Session()
        self.session.proxies.update(PROXIES)
        self.session.headers.update(HEADERS)
        
        self.found_keys = set()
        self.found_ivs = set()
        self.payloads = []
        self.js_links = []
        self.html_content = "" # Simpan HTML utama
        self.phising_database = []
        self.load_threat_database('Daph/Phishing_category_detection.csv')

    def init_connection(self):
        print(f"\n[*] [PHASE 1] Establishing Session with {self.target_url}...")
        try:
            res = self.session.get(self.target_url, timeout=20)
            self.html_content = res.text # Simpan untuk scan tracker nanti
            
            print(f"    Status Code: {res.status_code}")
            if self.session.cookies:
                print(f"    Cookies Acquired: {len(self.session.cookies)}")
            
            self._scan_text_for_payloads(res.text, "Main HTML")
            
            soup = BeautifulSoup(res.text, 'html.parser')
            scripts = soup.find_all('script', src=True)
            for s in scripts:
                full_url = urljoin(self.target_url, s['src'])
                if not any(x in full_url for x in ['jquery', 'bootstrap']):
                    self.js_links.append(full_url)
            
            print(f"    Found {len(self.js_links)} suspicious JS files.")

        except Exception as e:
            print(f"    Connection Failed: {e}")
            sys.exit(1)

    def scan_assets(self):
        print(f"\n[*] [PHASE 2] Scanning Assets & Extracting Keys...")
        self.session.headers.update({'Referer': self.target_url})

        for js_url in self.js_links:
            try:
                # print(f"    -> Scanning: {js_url} ...", end="\r")
                res = self.session.get(js_url, timeout=15)
                if res.status_code == 200:
                    content = res.text
                    if content.startswith('\x8b\xff') or len(content) < 10:
                        continue
                        
                    # Regex cari Key 32 char & IV 16 char
                    keys = re.findall(r'["\']([a-zA-Z0-9]{32})["\']', content)
                    self.found_keys.update(keys)
                    
                    ivs = re.findall(r'["\']([a-zA-Z0-9]{16})["\']', content)
                    self.found_ivs.update(ivs)
                    
                    self._scan_text_for_payloads(content, "JS File")
            except:
                pass
        
        print(f"    Intelijen Terkumpul:")
        print(f"        - Potential Keys : {len(self.found_keys)}")
        print(f"        - Potential IVs  : {len(self.found_ivs)}")
        print(f"        - Payloads Found : {len(self.payloads)}")

    def _scan_text_for_payloads(self, text, source):
        matches = re.findall(r'(code|data|token|p)=([a-zA-Z0-9%]+(?:%3D|=)+)', text)
        for param, val in matches:
            clean_val = unquote(val)
            if len(clean_val) > 20:
                self.payloads.append({'source': source, 'param': param, 'data': clean_val})

    def crack_payloads(self):
        print(f"\n[*] [PHASE 3] Attempting Auto-Decryption...")
        if not self.payloads or not self.found_keys:
            print("    Skipping decryption (No payloads/keys).")
            return

        try:
            from Crypto.Cipher import AES
            from Crypto.Util.Padding import unpad
        except:
            return

        candidate_ivs = list(self.found_ivs)
        candidate_ivs.append("\x00" * 16)

        for p in self.payloads:
            print(f"    [?] Target: {p['data'][:20]}... ({p['param']})")
            decrypted = False
            for key_str in self.found_keys:
                for iv_str in candidate_ivs:
                    if self._try_decrypt(key_str, iv_str, p['data']):
                        decrypted = True; break
                if decrypted: break
            if not decrypted: print("       Decryption failed.")

    def _try_decrypt(self, key_str, iv_str, b64_data):
        try:
            # Import di sini biar tidak error kalau library tidak ada
            from Crypto.Cipher import AES
            from Crypto.Util.Padding import unpad
            
            key = key_str.encode('utf-8')
            iv = iv_str.encode('utf-8')
            encrypted_data = base64.b64decode(b64_data)
            cipher = AES.new(key, AES.MODE_CBC, iv)
            result = unpad(cipher.decrypt(encrypted_data), AES.block_size).decode('utf-8')
            if "{" in result or result.isprintable():
                print(f"       CRACKED! Key: {key_str}")
                print(f"       Content: {result}")
                return True
        except:
            pass
        return False

    def scan_ad_networks(self):
        """Langkah 4: Analisis Koneksi Eksternal (Domain Intelligence)"""
        print(f"\n[*] [PHASE 4] Analyzing External Connections (Ad-Networks)...")
        
        all_text = self.html_content + str(self.js_links)
        
        # Regex mencari domain (example.com)
        domains = set(re.findall(r'https?://([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', all_text))
        
        # Buang domain sendiri dari daftar
        external_domains = [d for d in domains if self.domain not in d]
        
        # Filter Tracker Terkenal
        trackers = {
            'Google Analytics': ['google-analytics.com', 'googletagmanager.com'],
            'Sentry (Error Logs)': ['sentry.io', 'ingest.sentry'],
            'Facebook/Meta': ['facebook.net', 'connect.facebook'],
            'Cloudflare Insights': ['cloudflareinsights.com'],
            'PopAds/AdNetworks': ['popads', 'exoclick', 'juicyads', 'doubleclick', 'adservice']
        }
        
        detected = []
        print(f"    Total External Domains Found: {len(external_domains)}")
        
        for d in external_domains:
            # Cek keywords umum
            if any(k in d for k in ['ad', 'track', 'pixel', 'stat', 'click', 'measure']):
                detected.append(f"[General Ad/Tracker] {d}")
                continue
            
            # Cek Brand spesifik
            for name, keywords in trackers.items():
                if any(k in d for k in keywords):
                    detected.append(f"[{name}] {d}")
        
        if detected:
            print("    [!] SUSPICIOUS / TRACKING CONNECTIONS:")
            for d in list(set(detected))[:15]: # Tampilkan max 15 unik
                print(f"        -> {d}")
        else:
            print("    No aggressive ad-networks detected by keyword.")

                        ## TOOLS ANTI PHISING

    def calculate_entropy(self, text):
        """Menghitung Shannon Entropy untuk mendeteksi domain acak/generated."""
        if not text: return 0
        probs = [float(text.count(c)) / len(text) for c in set(text)]
        return -sum(p * math.log(p, 2) for p in probs)

    def analyze_phishing_heuristics(self):
        print(f"\n[*] [PHASE 5] Heuristic Phishing Analysis...")
        
        url_path = urlparse(self.target_url)
        netloc = url_path.netloc
        
        # Indikator Penilaian
        score = 0
        flags = []

        # 1. Analisis Punycode (Homograph Attack)
        if netloc.startswith("xn--"):
            score += 40
            flags.append("Punycode/Homograph Domain Detected")

        # 2. Analisis Entropy (DGA - Domain Generation Algorithm)
        # Gunakan LaTeX untuk rumus formal: $$H(X) = -\sum_{i=1}^{n} P(x_i) \log_2 P(x_i)$$
        entropy = self.calculate_entropy(netloc.split('.')[0])
        if entropy > 3.5:
            score += 25
            flags.append(f"High Domain Entropy ({entropy:.2f})")

        # 3. Subdomain Depth (Sering digunakan phishing untuk masking)
        subdomains = netloc.split('.')
        if len(subdomains) > 3:
            score += 20
            flags.append(f"Excessive Subdomain Depth ({len(subdomains)})")

        # 4. Keyword Masking
        # Mencari keyword sensitif yang muncul di subdomain atau path
        sensitive_keywords = ['login', 'verify', 'secure', 'account', 'update', 'banking', 'wallet']
        found_keywords = [k for k in sensitive_keywords if k in self.target_url.lower()]
        if found_keywords:
            score += 20
            flags.append(f"Sensitive Keywords Found: {found_keywords}")

        # 5. TLD Risk Assessment
        suspicious_tlds = ['.zip', '.top', '.xyz', '.monster', '.icu', '.tk']
        if any(self.target_url.endswith(tld) for tld in suspicious_tlds):
            score += 15
            flags.append("High-Risk TLD Detected")

        # Output Hasil Analisis
        print(f"    Phishing Risk Score: {score}/100")
        if flags:
            print("    Indikator Terdeteksi:")
            for f in flags:
                print(f"        [!] {f}")
        
        if score >= 60:
            print("    [RESULT] HIGH PROBABILITY OF PHISHING")
        elif score >= 30:
            print("    [RESULT] SUSPICIOUS ACTIVITY")
        else:
            print("    [RESULT] CLEAN / LOW RISK")

    def check_hsts_policy(self, headers):
        """ Checking HSTS Policy """
        hsts = headers.get('Strict-Transport-Security')

        if not hsts:
            return {"score": 25, "reason": "Missing HSTS Header"}
        
        max_age_match = re.search(r'max-age=(\d+)', hsts)
        if max_age_match:
            age = int(max_age_match.group(1))
            if age < 31536000: # kurang dari 1 tahun
                return {"score": 15, "reason": f"HSTS max-age too low ({age} seconds)"}
            
            return {"score": 0, "reason": "HSTS Header Present with Adequate max-age"}
        
    def check_domain_age(self, domain):
        """ Checking Domain Age """
        print(f"[*] [PHASE 6] Checking Domain Age for {domain}...")
        try:
            w = whois.whois(domain)
            creation_date = w.creation_date

            if isinstance(creation_date, list):
                creation_date = creation_date[0]

            if creation_date:
                age_days = (datetime.now() - creation_date).days

                if age_days < 30:
                    return {"score": 50, "flag": f"extremely new domain ({age_days} days old)"}
                
                elif age_days < 180:
                    return {"score": 20, "flag": f"new domain ({age_days} days old)"}
                
            return {"score": 0, "flag": f"domain age is {age_days} days"}
        except Exception as e:
            return {"score": 15, "flag": "WHOIS Lookup Failed (Potentially hidden/new)"}
        
    def load_threat_database(self, file_path):
        """ Loading Phising Keyword Database """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    self.phising_database.append({
                        'keyword': row['keyword'].lower(),
                        'category': row['metadata_category']
                    })
            print(f"[*] Database Loaded: {len(self.phising_database)} threat keywords.")
        except FileNotFoundError:
            print("[!] Warning: Phising category not found. Phishing heuristics will be limited.")

    def scan_phising_keywords(self):
        """ Scanning Phising Keywords in URL and Content """
        print(f"\n[*] [PHASE 7] Scanning for Phishing Keywords...")

        detected_threats = []
        target_string = self.target_url.lower() + " " + self.html_content.lower()

        for entry in self.phising_database:
            if entry['keyword'] in target_string:
                detected_threats.append(f"{entry['category']} keyword detected: '{entry['keyword']}'")

        if detected_threats:
            print("    Detected Phishing Indicators:")
            for t in detected_threats[:10]: # Tampilkan max 10
                print(f"        [!] {t}")
            return True
            
        print("    No known phishing keywords detected.")
        return False

            
if __name__ == "__main__":
    print("="*50)
    print("      RED TEAM SENTINEL v2 - FULL SUITE")
    print("="*50)
    
    url = input("Target URL: ").strip()
    
    bot = Sentinel(url)
    bot.init_connection()
    bot.scan_assets()
    bot.crack_payloads()
    bot.scan_ad_networks()
    bot.analyze_phishing_heuristics()
    
    print("\n[*] Mission Complete.")