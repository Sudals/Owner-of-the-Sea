// The static web site (design §2, §7, §10): landing page + the web 체험판 at /demo/.
//   node scripts/build-web.mjs            → apps/web/dist
//   RELEASE_URL=… node scripts/build-web.mjs   (where "Windows 정식판 받기" points)
// Deploy with `pnpm deploy:web` (Cloudflare Pages).
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");
const out = join(web, "dist");
const client = join(root, "apps/client");
const version = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8")).version;
const release = process.env.RELEASE_URL ?? "https://github.com/Sudals/Owner-of-the-Sea/releases/latest";

console.log("· building the web demo (client --mode demo)");
execSync("pnpm exec vite build --mode demo", { cwd: client, stdio: "inherit" });

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "img"), { recursive: true });
mkdirSync(join(out, "fonts"), { recursive: true });

// landing
const html = readFileSync(join(web, "site/index.html"), "utf8").replaceAll("__RELEASE_URL__", release).replaceAll("__VERSION__", `v${version}`);
writeFileSync(join(out, "index.html"), html);
cpSync(join(client, "public/assets/bg_dock.png"), join(out, "img/hero.png"));
cpSync(join(client, "public/assets/icon/icon-32.png"), join(out, "img/icon-32.png"));
const require = createRequire(join(client, "package.json"));
const galmuri = dirname(require.resolve("galmuri/dist/Galmuri11.woff2"));
for (const f of ["Galmuri11.woff2", "Galmuri11-Bold.woff2"]) cpSync(join(galmuri, f), join(out, "fonts", f));

// the game
cpSync(join(client, "dist/demo"), join(out, "demo"), { recursive: true });

// Cloudflare Pages: hashed bundles are immutable; sprite sheets change between versions
writeFileSync(
  join(out, "_headers"),
  ["/demo/static/*", "  Cache-Control: public, max-age=31536000, immutable", "/demo/assets/*", "  Cache-Control: public, max-age=3600", ""].join("\n"),
);
console.log(`✓ apps/web/dist (v${version}) — landing + /demo/ · 정식판 링크: ${release}`);
