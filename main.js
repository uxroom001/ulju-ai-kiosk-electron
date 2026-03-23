const { app, BrowserWindow } = require("electron");
const { autoUpdater } = require("electron-updater");

function createWindow() {
    const win = new BrowserWindow({
        width: 1080,
        height: 1920,
        fullscreen: true,
        kiosk: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
        },
    });

    win.loadURL("https://ulju-ai-kiosk.vercel.app/");

    // 뒤로가기 차단
    win.webContents.on("before-input-event", (event, input) => {
        if (input.key === "BrowserBack") {
            event.preventDefault();
        }
    });

    // 개발자도구 막기
    win.webContents.on("devtools-opened", () => {
        win.webContents.closeDevTools();
    });
}

app.whenReady().then(() => {
    createWindow();

    autoUpdater.checkForUpdatesAndNotify();
});
