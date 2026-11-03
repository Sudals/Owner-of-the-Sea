import { useEffect, useState } from "react";

// /dev/sprites (design §6-1): every built sheet, frame by frame, enlarged — for screenshot review.
const SHEETS = ["fish", "angler", "boat", "props", "ui", "pollutants", "owner", "sky"] as const;
const BACKGROUNDS = ["bg_dock", "bg_sea_jade", "bg_sea_azure", "bg_sea_indigo", "bg_sea_ink"];

type Frame = { x: number; y: number; w: number; h: number };
type Sheet = { name: string; url: string; w: number; h: number; frames: [string, Frame][] };

const base = `${import.meta.env.BASE_URL}assets/`;

async function loadSheet(name: string): Promise<Sheet> {
  const json = (await (await fetch(`${base}${name}.json`)).json()) as { image: string; frames: Record<string, Frame> };
  const url = `${base}${json.image}`;
  const img = new Image();
  img.src = url;
  await img.decode();
  return { name, url, w: img.naturalWidth, h: img.naturalHeight, frames: Object.entries(json.frames) };
}

export function SpritePreview() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [scale, setScale] = useState(3);

  useEffect(() => {
    Promise.all(SHEETS.map(loadSheet)).then(setSheets).catch((e) => console.error(e));
  }, []);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 16, background: "#13314b" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>스프라이트 미리보기</h1>
      <label style={{ color: "#93dadc" }}>
        배율 ×{scale}{" "}
        <input type="range" min={1} max={6} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
      </label>
      {sheets.map((s) => (
        <section key={s.name} data-sheet={s.name} style={{ margin: "20px 0" }}>
          <h2 style={{ fontSize: 16, color: "#f1d08b", margin: "0 0 8px" }}>
            {s.name} · {s.frames.length}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            {s.frames.map(([name, f]) => (
              <figure key={name} style={{ margin: 0, textAlign: "center" }}>
                <div
                  title={`${name} ${f.w}×${f.h}`}
                  style={{
                    width: f.w * scale,
                    height: f.h * scale,
                    backgroundImage: `url(${s.url})`,
                    backgroundPosition: `${-f.x * scale}px ${-f.y * scale}px`,
                    backgroundSize: `${s.w * scale}px ${s.h * scale}px`,
                    imageRendering: "pixelated",
                    backgroundColor: "#1b4b6c",
                  }}
                />
                <figcaption style={{ fontSize: 11, color: "#8b94a7", maxWidth: Math.max(60, f.w * scale) }}>{name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      <section style={{ margin: "20px 0" }}>
        <h2 style={{ fontSize: 16, color: "#f1d08b" }}>backgrounds</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {BACKGROUNDS.map((b) => (
            <img key={b} src={`${base}${b}.png`} alt={b} width={640} height={360} style={{ imageRendering: "pixelated" }} />
          ))}
        </div>
      </section>
    </div>
  );
}
