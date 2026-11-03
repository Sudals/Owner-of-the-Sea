import { createGame, type Engine, type GameBackend } from "@sea/game";
import { useEffect, useRef, useState } from "react";
import { LocalBackend } from "./backend/LocalBackend";
import { RemoteBackend } from "./backend/RemoteBackend";
import { desktop } from "./backend/stores";
import { loadFonts } from "./fonts";

/** The API the full build saves to (design §10-2: VITE_API_BASE). Dev talks to `neon dev`. */
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  (import.meta.env.DEV ? "http://localhost:8787/api" : "https://br-wandering-mud-b3h5v0u5-api.compute.c-4.ap-southeast-1.aws.neon.tech/api");

/** demo → localStorage; full → the server. In dev, `?local` forces the local backend (offline tests). */
async function pickBackend(): Promise<GameBackend> {
  const forceLocal = import.meta.env.DEV && new URLSearchParams(window.location.search).has("local");
  if (__BUILD_MODE__ === "demo" || forceLocal) return new LocalBackend();
  return RemoteBackend.create(API_BASE);
}

// Mounts the pure-TS engine (packages/game) and tears it down on unmount (design §9).
export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<string>("불러오는 중…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let engine: Engine | null = null;
    let cancelled = false;
    (async () => {
      try {
        await loadFonts();
        const backend = await pickBackend();
        if (cancelled) return;
        const app = desktop();
        const { engine: e, game } = await createGame(host.current!, {
          backend,
          mode: __BUILD_MODE__,
          // the web can't close its own tab; the desktop app can
          quit: app ? () => app.quit() : undefined,
          assetBase: `${import.meta.env.BASE_URL}assets/`,
          dev: import.meta.env.DEV,
          // a cancelled (StrictMode double-mount) load must not overwrite the live one's state
          onProgress: (done, total) => !cancelled && setProgress(`불러오는 중… ${done}/${total}`),
        });
        if (cancelled) return e.destroy();
        engine = e;
        // the window's close button goes through the save dialog (design §11-2)
        app?.onCloseRequest(() => game.leave("quit"));
        setProgress("");
        // test hook for the Playwright smoke/screenshot script
        (window as unknown as { __sea?: unknown }).__sea = { engine: e, game, backend, ready: true };
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      engine?.destroy();
    };
  }, []);

  return (
    <>
      <div ref={host} className="game-host" />
      {progress && !error && <div className="loading">{progress}</div>}
      {error && <div className="loading error">{error}</div>}
    </>
  );
}
