import subprocess
import os
import sys
import time
import socket
import tempfile
import shutil
import stat

class TorController:
    def __init__(self):
        self.process = None
        self.port = 9050 # Port standar Tor
        self.data_dir = tempfile.mkdtemp() # Folder sementara untuk cache Tor

    def get_tor_path(self):
        """
        Mencari lokasi binary Tor secara dinamis untuk Windows, Linux, dan Mac.
        """
        # Cek apakah Frozen (Exe/App)?
        if getattr(sys, 'frozen', False):
            base_path = sys._MEIPASS
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
        
        # Deteksi OS
        if sys.platform == 'win32' or os.name == 'nt':
            # WINDOWS
            tor_path = os.path.join(base_path, 'bin', 'tor_win', 'tor.exe')
            
        elif sys.platform == 'darwin':
            # MACOS
            tor_path = os.path.join(base_path, 'bin', 'tor_mac', 'tor')
            # Chmod execute untuk Mac
            try:
                if os.path.exists(tor_path):
                    st = os.stat(tor_path)
                    os.chmod(tor_path, st.st_mode | stat.S_IEXEC)
            except: pass

        else:
            # LINUX
            tor_path = os.path.join(base_path, 'bin', 'tor_linux', 'tor')
            # Chmod execute untuk Linux
            try:
                if os.path.exists(tor_path):
                    st = os.stat(tor_path)
                    os.chmod(tor_path, st.st_mode | stat.S_IEXEC)
            except: pass

        return tor_path

    def is_port_open(self, host, port):
        """Cek apakah port 9050 sudah aktif (artinya Tor sudah jalan)"""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.settimeout(1)
            s.connect((host, port))
            s.shutdown(2)
            return True
        except:
            return False
        finally:
            s.close()

    def start(self):
        tor_binary = self.get_tor_path()
        
        # 1. Validasi keberadaan file
        if not os.path.exists(tor_binary):
            print(f"CRITICAL: Tor binary not found at: {tor_binary}")
            print(f"    Make sure you have 'bin/tor_win' and 'bin/tor_linux' folders!")
            return False

        # 2. Cek apakah Tor sudah jalan duluan? (Misal user lupa mematikan scan sebelumnya)
        if self.is_port_open('127.0.0.1', self.port):
            print("[*] Tor is already active on port 9050. Using existing instance.")
            return True

        print(f"[*] Launching Tor from: {tor_binary}")
        
        # 3. Susun Perintah
        # --DataDirectory penting agar Tor tidak membuat file sampah di system folder
        cmd = [
            tor_binary,
            "--SocksPort", str(self.port),
            "--DataDirectory", self.data_dir
        ]

        # 4. Konfigurasi Khusus Windows (Sembunyikan Jendela CMD Hitam)
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        # 5. Eksekusi
        try:
            self.process = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                startupinfo=startupinfo
            )
        except Exception as e:
            print(f"Failed to execute Tor: {e}")
            return False

        # 6. Tunggu Bootstrap (Maksimal 20 detik)
        print("[*] Bootstrapping Tor Network... (Please wait)")
        for i in range(20):
            if self.is_port_open('127.0.0.1', self.port):
                print(f"Tor Connected! (Attempt {i+1})")
                return True
            time.sleep(1)
            # print(".", end="", flush=True) # Opsional: loading effect
        
        print("\nTor timed out. Check your internet connection.")
        return False

    def stop(self):
        """Mematikan proses Tor dan membersihkan file temp"""
        if self.process:
            print("[*] Stopping internal Tor process...")
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except:
                # Kalau bandel, paksa kill
                if self.process: self.process.kill()
        
        # Bersihkan folder cache sementara
        try:
            if os.path.exists(self.data_dir):
                shutil.rmtree(self.data_dir)
        except Exception as e:
            # Kadang file masih dikunci OS, biarkan saja
            pass