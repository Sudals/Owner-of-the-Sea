import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

// 바다의 주인 desktop shell (design §7-2):
//   · the renderer is the client's full build, served from app:// (not file://)
//   · contextIsolation + sandbox, no Node in the page; the page gets only `window.desktop`
//   · the device token is encrypted with safeStorage (OS keychain) in userData (design §5-1)
//   · the unsaved journal lives in userData/journal.json so a crash loses nothing (design §11-5)
//   · closing the window asks the game first (save dialog), then quits

const DEV_URL = process.env.SEA_DEV_URL; // e.g. http://localhost:5173 (pnpm dev)
const CLIENT_DIR = app.isPackaged ? join(process.resourcesPath, "client") : resolve(__dirname, "../../client/dist/full");
const ORIGIN = "app://bundle";

// Only the API may be reached from the page (design §7-2 CSP connect-src).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.neon.tech http://localhost:8787",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// a game may play its music from the lobby on (a browser waits for the first key or click)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// tests point userData somewhere disposable
if (process.env.SEA_USER_DATA) app.setPath("userData", process.env.SEA_USER_DATA);

const userFile = (name: string) => join(app.getPath("userData"), name);

/** Write via a temp file + rename, so a crash mid-write never leaves half a file. */
function writeAtomic(path: string, data: string | Buffer): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function serveClient(): void {
  const root = normalize(CLIENT_DIR);
  protocol.handle("app", async (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep)) return new Response("forbidden", { status: 403 });
    if (!existsSync(file)) return new Response("not found", { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    if (rel.endsWith(".html")) headers.set("Content-Security-Policy", CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}

function registerIpc(win: BrowserWindow): void {
  const tokenPath = userFile("token.bin");
  ipcMain.handle("token:get", () => {
    if (!existsSync(tokenPath)) return null;
    const raw = readFileSync(tokenPath);
    try {
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
    } catch {
      return null; // written under another OS user / keychain: treat as no token
    }
  });
  ipcMain.handle("token:set", (_e, token: string) => {
    if (typeof token !== "string" || token.length > 200) throw new Error("bad token");
    writeAtomic(tokenPath, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token, "utf8"));
  });
  ipcMain.handle("token:clear", () => rmSync(tokenPath, { force: true }));

  const journalPath = userFile("journal.json");
  ipcMain.handle("journal:read", () => (existsSync(journalPath) ? readFileSync(journalPath, "utf8") || null : null));
  ipcMain.handle("journal:write", (_e, data: string) => {
    if (typeof data !== "string" || data.length > 5_000_000) throw new Error("bad journal");
    if (!data) rmSync(journalPath, { force: true });
    else writeAtomic(journalPath, data);
  });

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:fullscreen", (_e, on: boolean) => win.setFullScreen(!!on));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: "#0d0f1c",
    title: "바다의 주인",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.removeMenu();
  registerIpc(win);

  // the close button asks the game (save dialog); the game answers with app:quit
  let quitting = false;
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win.webContents.send("app:close-request");
  });
  ipcMain.on("app:quit", () => {
    quitting = true;
    win.close();
  });

  // nothing navigates away from the game; links open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(ORIGIN) && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault();
  });

  win.once("ready-to-show", () => win.show());
  void win.loadURL(DEV_URL ?? `${ORIGIN}/`);
}

app.whenReady().then(() => {
  serveClient();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
