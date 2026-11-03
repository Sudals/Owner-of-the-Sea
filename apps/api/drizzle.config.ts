import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env.local ourselves.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const raw = process.env.DATABASE_URL_UNPOOLED;
if (!raw) throw new Error("DATABASE_URL_UNPOOLED is not set (run `neon env pull`)");
// Same as src/db/client.ts: pg already treats require as verify-full; make it explicit.
const parsed = new URL(raw);
if (parsed.searchParams.get("sslmode") === "require") parsed.searchParams.set("sslmode", "verify-full");
const url = parsed.toString();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations must use the direct (non-pooled) connection.
  dbCredentials: { url },
  // neon_auth is managed by Neon Auth — never let drizzle-kit touch it.
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
