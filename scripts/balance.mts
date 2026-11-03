// balance.jsonc → checked → bundled default (+ DB).
//   pnpm balance:check                  validate, rewrite packages/shared/src/balance/balance.default.json
//   pnpm balance:apply "what changed"   …and store it in the DB (game_config) as a new version;
//                                       the API picks it up within 30 s, sessions keep their version
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import pg from "pg";
import { balanceSchema, type Balance } from "../packages/shared/src/balance/schema.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "balance.jsonc");
const OUT = resolve(ROOT, "packages/shared/src/balance/balance.default.json");
const [cmd = "check", ...noteParts] = process.argv.slice(2);
const note = noteParts.join(" ").trim();

const red = (s: string) => `\x1b[31m${s}\x1b[0m`, green = (s: string) => `\x1b[32m${s}\x1b[0m`, dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── 1. parse (comments allowed) ──
const text = readFileSync(SRC, "utf8");
const errors: ParseError[] = [];
const raw = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
if (errors.length) {
  const where = (off: number) => {
    const before = text.slice(0, off).split("\n");
    return `${before.length}:${before[before.length - 1]!.length + 1}`;
  };
  console.error(red(`balance.jsonc 문법 오류 ${errors.length}개:`));
  for (const e of errors) console.error(`  ${where(e.offset)}  ${printParseErrorCode(e.error)}`);
  process.exit(1);
}

// ── 2. validate ──
const checked = balanceSchema.safeParse(raw);
if (!checked.success) {
  console.error(red(`balance.jsonc 값 오류 ${checked.error.issues.length}개:`));
  for (const i of checked.error.issues) console.error(`  ${i.path.join(".") || "(전체)"}  ${i.message}`);
  process.exit(1);
}
const data: Balance = checked.data;
const json = JSON.stringify(data, null, 1);
const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
console.log(green("✓ balance.jsonc 검사 통과") + dim(`  (물고기 ${Object.keys(data.fish).length}종 · 섬 ${Object.keys(data.economy.markets).length}곳 · 아이템 ${Object.keys(data.economy.items).length}개 · hash ${hash})`));

// ── 3. the default bundled into the game ──
const prevDefault = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
if (prevDefault !== json + "\n") {
  writeFileSync(OUT, json + "\n");
  console.log(`  → ${dim("packages/shared/src/balance/balance.default.json")} 갱신 (다음 빌드부터 체험판·오프라인에 반영)`);
}
if (cmd === "check") process.exit(0);
if (cmd !== "apply") {
  console.error(`모르는 명령: ${cmd} (check | apply)`);
  process.exit(1);
}

// ── 4. apply: a new version in the DB ──
const envFile = resolve(ROOT, "apps/api/.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const rawUrl = process.env.DATABASE_URL_UNPOOLED;
if (!rawUrl) {
  console.error(red("DATABASE_URL_UNPOOLED가 없어요 (apps/api/.env.local — `neon env pull`)"));
  process.exit(1);
}
const url = new URL(rawUrl);
if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
try {
  const { rows } = await db.query<{ version: number; hash: string; data: Balance }>("select version, hash, data from game_config order by version desc limit 1");
  const last = rows[0];
  if (last?.hash === hash) {
    console.log(`DB는 이미 이 값이에요 (버전 ${last.version}). 바꿀 것이 없어요.`);
    process.exit(0);
  }
  if (last) {
    const changes = diff(last.data, data);
    console.log(`버전 ${last.version} → 바뀐 값 ${changes.length}개:`);
    for (const c of changes.slice(0, 40)) console.log(`  ${c}`);
    if (changes.length > 40) console.log(dim(`  … 외 ${changes.length - 40}개`));
  }
  const ins = await db.query<{ version: number }>("insert into game_config (data, hash, note) values ($1, $2, $3) returning version", [data, hash, note || null]);
  console.log(green(`✓ DB에 버전 ${ins.rows[0]!.version}로 저장했어요`) + (note ? dim(`  "${note}"`) : "") + dim("  — 서버는 30초 안에 새 값을 써요"));
} finally {
  await db.end();
}

/** Changed leaf paths between two balances, "a.b.c: old → new". */
function diff(a: unknown, b: unknown, path = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (isObj(a) && isObj(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], path ? `${path}.${k}` : k));
  const show = (v: unknown) => (v === undefined ? "(없음)" : JSON.stringify(v));
  return [`${path}: ${show(a)} → ${show(b)}`];
}
