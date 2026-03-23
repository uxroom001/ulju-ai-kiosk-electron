const { app, BrowserWindow } = require("electron");

function createWindow() {
    const win = new BrowserWindow({
        width: 1080,
        height: 1920,
        fullscreen: true,
        autoHideMenuBar: true,
        kiosk: true,
    });

    win.loadURL("https://ulju-ai-kiosk.vercel.app/");
}

app.whenReady().then(createWindow);
