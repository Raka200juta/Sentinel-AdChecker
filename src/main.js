const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        backgroundColor: '#0a0a0a',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // Memudahkan komunikasi utk project simpel
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    // mainWindow.webContents.openDevTools(); // Buka ini kalau mau debug
}

app.whenReady().then(createWindow);

// Listener: Menerima perintah Scan dari UI
ipcMain.on('start-scan', (event, targetUrl) => {
    console.log(`Starting scan for: ${targetUrl}`);
    
    // Tentukan path python. 
    // Saat development: gunakan 'python' atau 'python3'.
    // Saat production (.exe): kita akan bundle binary python sendiri nanti.
    let pythonExecutable = 'python3'; // Ganti 'python' jika di Windows
    let scriptPath = path.join(__dirname, '../backend/bridge.py');

    // Spawn Python Process
    const pythonProcess = spawn(pythonExecutable, [scriptPath, targetUrl]);

    // Tangkap Output (Stdout) dari Python
    pythonProcess.stdout.on('data', (data) => {
        const message = data.toString();
        // Kirim log ke UI (Renderer)
        event.sender.send('scan-log', message);
    });

    // Tangkap Error (Stderr)
    pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        event.sender.send('scan-log', `[ERROR] ${data.toString()}`);
    });

    // Selesai
    pythonProcess.on('close', (code) => {
        event.sender.send('scan-finished', code);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});