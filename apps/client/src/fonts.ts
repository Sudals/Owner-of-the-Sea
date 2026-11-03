import galmuri11 from "galmuri/dist/Galmuri11.woff2?url";
import galmuri11Bold from "galmuri/dist/Galmuri11-Bold.woff2?url";

/** Register Galmuri (OFL) before the game draws canvas text — canvas won't wait for CSS fonts. */
export async function loadFonts(): Promise<void> {
  const faces = [
    new FontFace("Galmuri11", `url(${galmuri11})`, { weight: "400" }),
    new FontFace("Galmuri11", `url(${galmuri11Bold})`, { weight: "700" }),
  ];
  await Promise.all(
    faces.map(async (f) => {
      await f.load();
      document.fonts.add(f);
    }),
  );
}
