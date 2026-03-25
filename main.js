const {
    app,
    BrowserWindow,
    dialog,
    session,
    systemPreferences,
} = require("electron");
const { autoUpdater } = require("electron-updater");

const KIOSK_URL = "https://ulju-ai-kiosk.vercel.app/";

function isTrustedOrigin(origin) {
    try {
        const parsed = new URL(origin);
        return parsed.origin === new URL(KIOSK_URL).origin;
    } catch {
        return false;
    }
}

function registerMediaPermissionHandlers() {
    const defaultSession = session.defaultSession;

    defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
        if (permission === "media") {
            console.log(
                "[permission-check]",
                permission,
                requestingOrigin,
                isTrustedOrigin(requestingOrigin),
            );
            return isTrustedOrigin(requestingOrigin);
        }

        return true;
    });

    defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback, details) => {
            if (permission === "media") {
                const allowed = isTrustedOrigin(details.requestingOrigin);
                console.log(
                    "[permission-request]",
                    permission,
                    details.requestingOrigin,
                    allowed,
                );
                callback(allowed);
                return;
            }

            callback(true);
        },
    );

    defaultSession.setDevicePermissionHandler((details) => {
        const allowed =
            details.deviceType === "videoCapture" &&
            isTrustedOrigin(details.requestingOrigin);

        console.log(
            "[device-permission]",
            details.deviceType,
            details.requestingOrigin,
            allowed,
        );

        return allowed;
    });
}

async function ensureCameraAccess() {
    if (process.platform !== "darwin") {
        return true;
    }

    const status = systemPreferences.getMediaAccessStatus("camera");
    if (status === "granted") {
        return true;
    }

    if (status === "not-determined") {
        return systemPreferences.askForMediaAccess("camera");
    }

    await dialog.showMessageBox({
        type: "warning",
        buttons: ["확인"],
        defaultId: 0,
        title: "카메라 권한 필요",
        message: "QR 인식을 위해 macOS의 카메라 권한이 필요합니다.",
        detail:
            "시스템 설정 > 개인정보 보호 및 보안 > 카메라에서 이 앱의 권한을 허용한 뒤 다시 실행해 주세요.",
    });

    return false;
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1080,
        height: 1920,
        fullscreen: true,
        kiosk: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    });

    win.webContents.on("console-message", (event, level, message, line, sourceId) => {
        console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });

    win.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
        console.error(
            "[did-fail-load]",
            errorCode,
            errorDescription,
            validatedURL,
        );
    });

    win.webContents.on("render-process-gone", (event, details) => {
        console.error("[render-process-gone]", details.reason, details.exitCode);
    });

    win.loadURL(KIOSK_URL);

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

app.whenReady().then(async () => {
    registerMediaPermissionHandlers();

    const hasCameraAccess = await ensureCameraAccess();
    if (!hasCameraAccess) {
        return;
    }

    createWindow();

    autoUpdater.checkForUpdatesAndNotify();
});
