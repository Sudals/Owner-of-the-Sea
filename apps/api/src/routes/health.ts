import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/pool";
import { authThrottle } from "../db/schema";
import { errorMessage } from "../http";
import { BUCKET, s3 } from "../storage/client";

// Design §10-0 step 6: round-trip checks for Postgres and Object Storage.
export const healthRoutes = new Hono();

healthRoutes.get("/db", async (c) => {
  const started = Date.now();
  const key = `health:${crypto.randomUUID()}`;
  try {
    const ping = await db.execute<{ ok: number }>(sql`select 1 as ok`);
    await db.insert(authThrottle).values({ key, failCount: 0 });
    const [row] = await db.select().from(authThrottle).where(eq(authThrottle.key, key));
    await db.delete(authThrottle).where(eq(authThrottle.key, key));
    const left = await db.select({ key: authThrottle.key }).from(authThrottle).where(eq(authThrottle.key, key));
    const ok = ping.rows[0]?.ok === 1 && row?.key === key && left.length === 0;
    return c.json({ ok, select1: ping.rows[0], inserted: key, selectedBack: row?.key === key, deleted: left.length === 0, ms: Date.now() - started }, ok ? 200 : 500);
  } catch (e) {
    console.error("[health/db]", e);
    await db.delete(authThrottle).where(eq(authThrottle.key, key)).catch(() => undefined);
    return c.json({ ok: false, error: errorMessage(e), ms: Date.now() - started }, 500);
  }
});

healthRoutes.get("/storage", async (c) => {
  const started = Date.now();
  const key = `health/${crypto.randomUUID()}.txt`;
  const body = `바다의 주인 storage check ${new Date().toISOString()}`;
  try {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "text/plain; charset=utf-8" }));
    const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const getMatches = (await got.Body?.transformToString("utf-8")) === body;
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    let deleted = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (e) {
      deleted = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
      if (!deleted) throw e;
    }
    const ok = getMatches && deleted;
    return c.json({ ok, bucket: BUCKET, key, put: true, getMatches, deleted, ms: Date.now() - started }, ok ? 200 : 500);
  } catch (e) {
    console.error("[health/storage]", e);
    return c.json({ ok: false, bucket: BUCKET, key, error: errorMessage(e), ms: Date.now() - started }, 500);
  }
});
