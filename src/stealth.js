// --- src/stealth.js ---
// Script ini berjalan OTOMATIS sebelum website target dimuat.
// Tujuannya untuk menghapus jejak robot (Selenium/WebDriver).

// 1. Hapus 'navigator.webdriver' (Paling Penting)
Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
});

// 2. Samarkan Chrome Runtime
window.navigator.chrome = {
    runtime: {},
    // Tambahkan properti lain biar mirip Chrome asli
    loadTimes: function() {},
    csi: function() {},
    app: {}
};

// 3. Tambahkan Plugins Palsu (Browser asli punya plugins, bot biasanya kosong)
Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
});

// 4. Tambahkan Languages (Biar kelihatan user beneran)
Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
});

console.log("[Stealth] Anti-Bot signatures removed.");