import { contextBridge, ipcRenderer } from "electron";

// The only bridge between the page and the OS (design §7-2): `window.desktop`.
// Shape matches apps/client/src/backend/stores.ts (DesktopApi).

contextBridge.exposeInMainWorld("desktop", {
  getToken: (): Promise<string | null> => ipcRenderer.invoke("token:get"),
  setToken: (token: string): Promise<void> => ipcRenderer.invoke("token:set", token),
  clearToken: (): Promise<void> => ipcRenderer.invoke("token:clear"),
  readJournal: (): Promise<string | null> => ipcRenderer.invoke("journal:read"),
  writeJournal: (data: string): Promise<void> => ipcRenderer.invoke("journal:write", data),
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  setFullscreen: (on: boolean): Promise<void> => ipcRenderer.invoke("app:fullscreen", on),
  quit: (): void => ipcRenderer.send("app:quit"),
  onCloseRequest: (cb: () => void): void => {
    ipcRenderer.on("app:close-request", () => cb());
  },
});
