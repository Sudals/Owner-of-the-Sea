import { S3Client } from "@aws-sdk/client-s3";

// Neon Object Storage (S3-compatible). Neon injects AWS_ENDPOINT_URL_S3 / AWS_REGION /
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY into the function (and `neon dev` locally),
// so the SDK reads them from the environment. Path-style addressing is required.

export const BUCKET = "assets";

export const s3 = new S3Client({ forcePathStyle: true });
