# 🛡️ Sentinel Desktop

**Automated Red Team Adware Analyzer & Payload Decryptor.**

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)](https://github.com/Raka200juta/Sentinel-AdChecker/releases)
[![License](https://img.shields.io/badge/license-ISC-green)](LICENSE)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()

**Sentinel Desktop** is a cross-platform security utility designed to automate the analysis of malicious advertising networks. It uses a hybrid **Electron + Python** engine to scan target websites via **Tor**, extract obfuscated AES encryption keys using regex, and attempt payload decryption to reveal exfiltrated data.

---

## ⚡ Key Features

* **🕵️‍♂️ Anonymous Scanning:** Routes all traffic through a **bundled, standalone Tor process**. No external VPN or Tor Browser installation required.
* **🔓 Automated Cryptanalysis:** Scans obfuscated JavaScript for potential AES Keys (32-char) and IVs (16-char) using advanced pattern matching.
* **💥 Payload Decryption:** Automatically attempts to decrypt suspicious base64 strings found in the DOM using extracted keys.
* **📡 Ad-Network Intelligence:** Detects and flags connections to known malicious ad exchanges and tracking pixels.
* **🖥️ Cross-Platform:** Native support for Windows (`.exe`), Linux (`.deb`), and macOS (`.dmg`).

---

## 📥 Installation

Download the latest version for your operating system from the **[Releases Page](../../releases)**.

### Windows
1.  Download `Sentinel.Desktop.Setup.x.x.x.exe`.
2.  Run the installer.
3.  *Note:* You may need to bypass Windows SmartScreen ("Run Anyway") as this is an unsigned security tool.

### Linux (Debian/Ubuntu/Kali)
1.  Download `sentinel-desktop_x.x.x_amd64.deb`.
2.  Install via terminal:
    ```bash
    sudo dpkg -i sentinel-desktop_*.deb
    ```

### macOS
1.  Download `Sentinel.Desktop.x.x.x.dmg`.
2.  Drag the app to your **Applications** folder.
3.  *Note:* You may need to right-click -> Open to bypass Apple's unidentified developer warning.

---

## 🚀 Usage

1.  **Launch Sentinel.**
2.  **Wait for Status:** Look at the status bar at the bottom. Wait until it says **"IDLE"**.
    * *This means the internal Tor background process has successfully bootstrapped.*
3.  **Enter Target:** Input the URL (e.g., `vidcloudmv.net`) into the input field.
4.  **Initiate Scan:** Click the button. The terminal window will display real-time logs of the analysis process.

---

## 🛠️ Development (Build from Source)

If you want to modify the code or build it yourself:

### Prerequisites
* Node.js (v18+)
* Python 3.10+
* Tor Binary (See structure below)

### 1. Clone & Install
```bash
git clone [https://github.com/YOUR_USERNAME/SentinelDesktop.git](https://github.com/YOUR_USERNAME/SentinelDesktop.git)
cd SentinelDesktop

# Install Node dependencies
npm install

# Install Python dependencies
pip install requests beautifulsoup4 pycryptodome packaging

---
### ☕ Support the Project

If this tool helped you in your Red Team engagement, consider buying me a coffee.
Feature requests from supporters are prioritized!

[Trakteer] (teer.id/r4kiya)
[Ko-fi] (https://ko-fi.com/rak1ya)