// Name-only identity check against the API (design v12 §5).
//   node scripts/e2e-api.mjs [baseUrl]   (default http://localhost:8787 = `pnpm dev:api`)
// Creates one test player named 시험xxxxxx in the branch database; the name is printed at the end.
const BASE = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const stamp = Date.now().toString(36).slice(-6);
const name = `시험${stamp}`;
let failed = 0;

async function call(method, path, { body, token, headers } = {}) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, ms: Date.now() - t0, headers: res.headers };
}
const redact = (s) => s.replace(/"token":"[^"]+"/g, '"token":"<redacted>"').replace(/"recoveryCode":"[^"]+"/g, '"recoveryCode":"<redacted>"');
function expect(label, r, status, pick = (j) => j) {
  const ok = r.status === status;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label.padEnd(36)} HTTP ${r.status} (want ${status}) ${String(r.ms).padStart(5)}ms  ${redact(JSON.stringify(pick(r.json))).slice(0, 170)}`);
  return r;
}

expect("GET /api", await call("GET", "/api/"), 200);
expect("GET /api/health/db", await call("GET", "/api/health/db"), 200, (j) => ({ ok: j.ok }));

const st = expect("POST start", await call("POST", "/api/auth/start", { body: { name: ` ${name} ` } }), 201, (j) => ({ token: j.token, account: j.account, recoveryCode: j.recoveryCode }));
const tok1 = st.json.token, code1 = st.json.recoveryCode;
const codeShapeOk = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/.test(code1 ?? "");
if (!codeShapeOk) failed++;
console.log(`${codeShapeOk ? "PASS" : "FAIL"} recovery code shape XXXX-XXXX-XXXX-XXXX`);
expect("POST start (same name, other case)", await call("POST", "/api/auth/start", { body: { name: name.toUpperCase() } }), 409, (j) => j.error?.code);
expect("POST start (bad name)", await call("POST", "/api/auth/start", { body: { name: "가" } }), 400, (j) => j.error?.fields);
expect("POST start (old signup body)", await call("POST", "/api/auth/signup", { body: { username: "x", password: "y" } }), 404, (j) => j.error?.code);

expect("GET /api/me (device token)", await call("GET", "/api/me", { token: tok1 }), 200, (j) => ({ name: j.account?.name, gold: j.player?.gold, location: j.player?.locationId, unlocks: j.unlocks?.map((u) => u.islandId) }));
expect("GET /api/me (no token)", await call("GET", "/api/me"), 401, (j) => j.error?.code);

// another PC: lowercase, spaces instead of dashes, look-alike letters
const typed = code1.toLowerCase().replace(/-/g, " ").replace(/1/g, "l").replace(/0/g, "o");
const rc = expect("POST recover (typed loosely)", await call("POST", "/api/auth/recover", { body: { code: typed } }), 200, (j) => ({ token: j.token, name: j.account?.name }));
const tok2 = rc.json.token;
expect("GET /api/me (2nd device)", await call("GET", "/api/me", { token: tok2 }), 200, (j) => ({ name: j.account?.name }));
expect("POST recover (wrong code)", await call("POST", "/api/auth/recover", { body: { code: "0000-0000-0000-0000" } }), 401, (j) => j.error?.code);
expect("POST recover (malformed)", await call("POST", "/api/auth/recover", { body: { code: "abc" } }), 400, (j) => j.error?.fields);

const nc = expect("POST recovery-code (rotate)", await call("POST", "/api/auth/recovery-code", { token: tok1 }), 200, (j) => ({ recoveryCode: j.recoveryCode }));
expect("POST recover (old code after rotate)", await call("POST", "/api/auth/recover", { body: { code: code1 } }), 401, (j) => j.error?.code);
expect("POST recover (new code)", await call("POST", "/api/auth/recover", { body: { code: nc.json.recoveryCode } }), 200, (j) => ({ name: j.account?.name }));

expect("POST logout (2nd device)", await call("POST", "/api/auth/logout", { token: tok2 }), 200);
expect("GET /api/me (2nd device, after logout)", await call("GET", "/api/me", { token: tok2 }), 401, (j) => j.error?.code);
expect("GET /api/me (1st device still in)", await call("GET", "/api/me", { token: tok1 }), 200, (j) => ({ name: j.account?.name }));

const pre = await call("OPTIONS", "/api/auth/start", { headers: { origin: "app://bundle", "access-control-request-method": "POST" } });
const corsOk = pre.status === 204 && pre.headers.get("access-control-allow-origin") === "app://bundle";
if (!corsOk) failed++;
console.log(`${corsOk ? "PASS" : "FAIL"} CORS preflight (app://bundle)         HTTP ${pre.status} allow-origin=${pre.headers.get("access-control-allow-origin")}`);

console.log(`\nCREATED ${name}`);
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
