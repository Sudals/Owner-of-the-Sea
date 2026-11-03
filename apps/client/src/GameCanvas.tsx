import { createGame, type Engine } from "@sea/game";
import { useEffect, useRef, useState } from "react";
import { loadFonts } from "./fonts";

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
        const e = await createGame(host.current!, {
          assetBase: `${import.meta.env.BASE_URL}assets/`,
          dev: import.meta.env.DEV,
          // a cancelled (StrictMode double-mount) load must not overwrite the live one's state
          onProgress: (done, total) => !cancelled && setProgress(`불러오는 중… ${done}/${total}`),
        });
        if (cancelled) return e.destroy();
        engine = e;
        setProgress("");
        // test hook for the Playwright smoke/screenshot script
        (window as unknown as { __sea?: unknown }).__sea = { engine: e, ready: true };
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
