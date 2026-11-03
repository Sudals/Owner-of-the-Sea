import { Hono } from "hono";
import { internalError } from "../http";
import { balanceAt, latestBalance } from "../logic/config";

// GET /api/config            → the current balance { version, data } (the full build loads it at start)
// GET /api/config?version=N  → an older one (a fishing session that opened under it)
export const configRoutes = new Hono();

configRoutes.get("/", async (c) => {
  try {
    const v = Number(c.req.query("version"));
    if (Number.isInteger(v) && v >= 0 && c.req.query("version") !== undefined) {
      c.header("Cache-Control", "public, max-age=3600, immutable");
      return c.json({ version: v, data: await balanceAt(v) });
    }
    const cur = await latestBalance();
    c.header("Cache-Control", "public, max-age=30");
    return c.json(cur);
  } catch (e) {
    return internalError("config", e);
  }
});
