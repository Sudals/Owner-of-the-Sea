import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiError, internalError } from "./http";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { saveRoutes } from "./routes/save";
import { sessionRoutes } from "./routes/session";
import { triggerRoutes } from "./routes/triggers";

// 바다의 주인 API — Hono on Neon Functions (design §7, §10-0). A Hono app is a
// web-standard `fetch` handler, so the default export is the function itself.

// CORS (design §7-2): the Electron app (app:// origin), local Vite dev, and later the
// static web domain for public ranking reads. Auth is Bearer, so no cookies/credentials.
const ALLOWED = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
const allowOrigin = (origin: string) => (origin.startsWith("app://") || ALLOWED.has(origin) ? origin : null);

// strict: false → "/api" and "/api/" (and other trailing slashes) route the same
const app = new Hono({ strict: false }).basePath("/api");

app.use(
  "*",
  cors({
    origin: (origin) => allowOrigin(origin ?? ""),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    maxAge: 600,
  }),
);

app.get("/", (c) => c.json({ name: "바다의 주인 API", branch: process.env.NEON_BRANCH ?? null }));
app.route("/auth", authRoutes);
app.route("/me", meRoutes);
app.route("/session", sessionRoutes);
app.route("/save", saveRoutes);
app.route("/health", healthRoutes);
app.route("/triggers", triggerRoutes);

app.notFound(() => apiError(404, "not_found", "없는 경로예요."));
app.onError((e) => internalError("unhandled", e));

export default app;
