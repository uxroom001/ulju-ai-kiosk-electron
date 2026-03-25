const {
    app,
    BrowserWindow,
    dialog,
    session,
    systemPreferences,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { inspect } = require("node:util");
const { autoUpdater } = require("electron-updater");

const KIOSK_URL = "https://ulju-ai-kiosk.vercel.app/";
const CAMERA_PERMISSIONS = new Set(["media", "camera"]);

let logFilePath = null;

function serializeLogArg(arg) {
    if (typeof arg === "string") {
        return arg;
    }

    return inspect(arg, {
        depth: 6,
        breakLength: Infinity,
        compact: true,
    });
}

function getLogFilePath() {
    if (!logFilePath) {
        const logDir = path.join(app.getPath("userData"), "logs");
        fs.mkdirSync(logDir, { recursive: true });
        logFilePath = path.join(logDir, "main.log");
    }

    return logFilePath;
}

function writeLog(level, ...args) {
    const message = `${new Date().toISOString()} [${level}] ${args
        .map(serializeLogArg)
        .join(" ")}`;

    if (level === "ERROR") {
        console.error(...args);
    } else if (level === "WARN") {
        console.warn(...args);
    } else {
        console.log(...args);
    }

    try {
        fs.appendFileSync(getLogFilePath(), `${message}\n`, "utf8");
    } catch (error) {
        console.error("[log-write-failed]", error);
    }
}

function logInfo(...args) {
    writeLog("INFO", ...args);
}

function logWarn(...args) {
    writeLog("WARN", ...args);
}

function logError(...args) {
    writeLog("ERROR", ...args);
}

function isTrustedOrigin(origin) {
    try {
        const parsed = new URL(origin);
        return parsed.origin === new URL(KIOSK_URL).origin;
    } catch {
        return false;
    }
}

function resolveRequestOrigin(requestingOrigin, details = {}) {
    return (
        requestingOrigin ||
        details.requestingOrigin ||
        details.requestingUrl ||
        details.embeddingOrigin ||
        details.securityOrigin ||
        ""
    );
}

function registerMediaPermissionHandlers() {
    const defaultSession = session.defaultSession;

    defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (CAMERA_PERMISSIONS.has(permission)) {
            const resolvedOrigin = resolveRequestOrigin(requestingOrigin, details);
            const allowed = isTrustedOrigin(resolvedOrigin);
            logInfo(
                "[permission-check]",
                permission,
                resolvedOrigin,
                allowed,
                details,
            );
            return allowed;
        }

        return true;
    });

    defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback, details) => {
            if (CAMERA_PERMISSIONS.has(permission)) {
                const resolvedOrigin = resolveRequestOrigin(
                    details.requestingOrigin,
                    details,
                );
                const allowed = isTrustedOrigin(resolvedOrigin);
                logInfo(
                    "[permission-request]",
                    permission,
                    resolvedOrigin,
                    allowed,
                    details,
                );
                callback(allowed);
                return;
            }

            callback(true);
        },
    );

    defaultSession.setDevicePermissionHandler((details) => {
        const resolvedOrigin = resolveRequestOrigin(
            details.requestingOrigin,
            details,
        );
        const allowed =
            details.deviceType === "videoCapture" &&
            isTrustedOrigin(resolvedOrigin);

        logInfo(
            "[device-permission]",
            details.deviceType,
            resolvedOrigin,
            allowed,
            details,
        );

        return allowed;
    });
}

async function ensureCameraAccess() {
    if (process.platform !== "darwin") {
        return true;
    }

    const status = systemPreferences.getMediaAccessStatus("camera");
    logInfo("[camera-access-status]", status);

    if (status === "granted") {
        return true;
    }

    if (status === "not-determined") {
        const granted = await systemPreferences.askForMediaAccess("camera");
        logInfo("[camera-access-request-result]", granted);
        return granted;
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

    win.webContents.on("console-message", (event, details) => {
        if (details && typeof details === "object") {
            logInfo(
                `[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`,
            );
            return;
        }

        logInfo("[renderer] console-message event received without details object");
    });

    win.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
        logError(
            "[did-fail-load]",
            errorCode,
            errorDescription,
            validatedURL,
        );
    });

    win.webContents.on("render-process-gone", (event, details) => {
        logError("[render-process-gone]", details.reason, details.exitCode);
    });

    win.webContents.on("did-finish-load", () => {
        logInfo("[did-finish-load]", win.webContents.getURL());
    });

    logInfo("[load-url]", KIOSK_URL);
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
    logInfo("[app-ready]");
    logInfo("[log-file]", getLogFilePath());

    registerMediaPermissionHandlers();

    const hasCameraAccess = await ensureCameraAccess();
    if (!hasCameraAccess) {
        logWarn("[camera-access-denied]");
        return;
    }

    createWindow();

    autoUpdater.checkForUpdatesAndNotify();
});

process.on("uncaughtException", (error) => {
    logError("[uncaughtException]", error);
});

process.on("unhandledRejection", (reason) => {
    logError("[unhandledRejection]", reason);
});
