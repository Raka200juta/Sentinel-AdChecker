import sys
import os

# Pastikan kita bisa import sentinel_engine dari folder yang sama
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sentinel_engine import Sentinel

# Kita override print agar outputnya langsung di-flush (dikirim ke Electron tanpa delay)
def unbuffered_print(text):
    print(text)
    sys.stdout.flush()

if __name__ == "__main__":
    # Ambil URL dari argumen command line (dikirim oleh Electron)
    if len(sys.argv) < 2:
        unbuffered_print("Error: No URL provided.")
        sys.exit(1)

    target_url = sys.argv[1]

    # Inisialisasi Sentinel
    try:
        # Kita monkey-patch fungsi print bawaan python agar real-time
        # (Atau kamu bisa modifikasi sentinel_engine.py untuk pakai logging)
        
        bot = Sentinel(target_url)
        
        # Override metode log internal jika ada, atau biarkan print bawaan
        # Sentinel v2 menggunakan print() biasa, jadi kita cukup flush stdout
        
        unbuffered_print(f"Starting Scan on: {target_url}")
        
        bot.init_connection()
        sys.stdout.flush()
        
        bot.scan_assets()
        sys.stdout.flush()
        
        bot.crack_payloads()
        sys.stdout.flush()
        
        bot.scan_ad_networks()
        sys.stdout.flush()
        
        unbuffered_print("\nMISSION COMPLETE.")
        
    except Exception as e:
        unbuffered_print(f"CRITICAL ERROR: {str(e)}")
        sys.exit(1)