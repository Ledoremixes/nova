// electron/main.cjs
const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow = null;
let backendProcess = null;

const BACKEND_PORT = process.env.BACKEND_PORT || "4010";
const isDev = !app.isPackaged;

// ✅ Blocca istanze multiple (evita finestre infinite)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  if (mainWindow) return; // sicurezza extra

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // se l’utente chiude la finestra, la variabile torna null
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // ✅ In prod, con Vite base "./", carichiamo il file buildato
    const indexPath = path.join(__dirname, "..", "frontend", "dist", "index.html");
    mainWindow.loadFile(indexPath);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function startBackend() {
  const backendEntry = isDev
    ? path.join(process.cwd(), "backend", "server.js")
    : path.join(process.resourcesPath, "backend", "server.js");

  backendProcess = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      NODE_ENV: isDev ? "development" : "production",
      PORT: BACKEND_PORT,
      HOST: "127.0.0.1"
    },
    stdio: "inherit"
  });

  backendProcess.on("close", (code) => {
    console.log("Backend exited with code:", code);
  });
}

async function waitForBackend() {
  const waitOn = require("wait-on");
  await waitOn({
    resources: [`http://127.0.0.1:${BACKEND_PORT}/api/health`],
    timeout: 30000,
    interval: 250
  });
}

app.whenReady().then(async () => {
  startBackend();

  try {
    await waitForBackend();
  } catch (e) {
    console.error("Backend non raggiungibile:", e);
    // anche se non risponde, apriamo comunque la finestra (per mostrare eventuali errori UI)
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== "darwin") app.quit();
});