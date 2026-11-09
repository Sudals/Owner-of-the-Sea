// Publish the desktop installers as a GitHub Release, using the GitHub login git already has
// (Windows Credential Manager) — no gh CLI needed. The token is never printed.
//   node scripts/release-github.mjs [version]        (default: apps/desktop/package.json)
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const REPO = "Sudals/Owner-of-the-Sea";
const version = process.argv[2] ?? JSON.parse(readFileSync(join(ROOT, "apps/desktop/package.json"), "utf8")).version;
const tag = `v${version}`;
const files = [`OwnerOfTheSea-Setup-${version}.exe`, `OwnerOfTheSea-${version}-portable.exe`].map((f) => join(ROOT, "apps/desktop/release", f));
const notes = readFileSync(join(ROOT, `apps/desktop/release-notes/${tag}.md`), "utf8");
for (const f of files) statSync(f); // both must exist

const cred = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
const token = /^password=(.+)$/m.exec(cred)?.[1]?.trim();
if (!token) throw new Error("git has no GitHub login for github.com");
const gh = async (method, url, body, headers = {}) => {
  const res = await fetch(url.startsWith("http") ? url : `https://api.github.com${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...headers },
    body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) throw new Error(`${method} ${url.split("?")[0]} → ${res.status} ${json?.message ?? text.slice(0, 200)}`);
  return json;
};

const repo = await gh("GET", `/repos/${REPO}`);
console.log(`repo ${REPO} · ${repo.private ? "private" : "public"} · default ${repo.default_branch}`);
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
let rel = await gh("GET", `/repos/${REPO}/releases/tags/${tag}`).catch(() => null);
if (!rel) {
  rel = await gh("POST", `/repos/${REPO}/releases`, JSON.stringify({ tag_name: tag, target_commitish: sha, name: `바다의 주인 ${tag}`, body: notes, draft: false, prerelease: false, make_latest: "true" }), { "content-type": "application/json" });
  console.log(`created release ${tag} at ${sha.slice(0, 7)}`);
} else console.log(`release ${tag} exists — adding missing files`);
const have = new Set((rel.assets ?? []).map((a) => a.name));
for (const f of files) {
  const name = basename(f);
  if (have.has(name)) {
    console.log(`  ${name} already uploaded`);
    continue;
  }
  const data = readFileSync(f);
  const url = rel.upload_url.replace(/\{.*\}$/, `?name=${encodeURIComponent(name)}`);
  const t0 = Date.now();
  await gh("POST", url, data, { "content-type": "application/octet-stream", "content-length": String(data.length) });
  console.log(`  uploaded ${name} (${(data.length / 1e6).toFixed(0)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
console.log(rel.html_url);
