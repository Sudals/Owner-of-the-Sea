import { lazy, Suspense } from "react";
import { GameCanvas } from "./GameCanvas";

// Dev-only tools are lazy-loaded and never reachable in production builds (design §9 dev/).
const SpritePreview = import.meta.env.DEV ? lazy(() => import("./dev/SpritePreview").then((m) => ({ default: m.SpritePreview }))) : null;

export function App() {
  if (SpritePreview && window.location.pathname === "/dev/sprites") {
    return (
      <Suspense fallback={null}>
        <SpritePreview />
      </Suspense>
    );
  }
  return <GameCanvas />;
}
