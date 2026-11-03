import { defineConfig } from "@neon/config/v1";

// 바다의 주인 — Neon resources (design §7, §10-0, §12-3).
// Apply with `neon deploy --env .env.local` (function env reads process.env).

export default defineConfig({
  auth: false, // own name-only accounts until Steam (design §5), not Neon Auth
  buckets: {
    // 어탁(trophy card) images; private, served via presigned URLs
    assets: { access: "private" },
  },
  functions: {
    // slug is permanent: ^[a-z0-9]{1,20}$
    api: {
      name: "바다의 주인 API",
      source: "src/index.ts",
      env: {
        SESSION_PEPPER: process.env.SESSION_PEPPER!,
        SEED_HMAC_KEY: process.env.SEED_HMAC_KEY!,
      },
    },
  },
  triggers: {
    // Monday 00:05 KST = Sunday 15:05 UTC: close the weekly season, prune sessions/throttle rows
    weekly: { type: "schedule", function: "api", cron: "5 15 * * 0", functionPath: "/api/triggers/weekly" },
  },
  branch: (branch) => {
    if (branch.isDefault) {
      // Free-plan guard (design §12-3): pin compute at 0.25 CU so it never autoscales up
      return { postgres: { computeSettings: { autoscalingLimitMinCu: 0.25, autoscalingLimitMaxCu: 0.25 } } };
    }
    if (!branch.exists) {
      // New non-default branches (e.g. dev): auto-expire unless kept
      return { ttl: "7d" };
    }
    return {};
  },
});
