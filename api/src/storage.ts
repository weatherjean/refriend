/**
 * Storage module for file uploads (avatars, media)
 *
 * Uses AWS S3 or S3-compatible storage (MinIO for local dev).
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// S3 configuration from environment
const S3_BUCKET = Deno.env.get("S3_BUCKET") || "";
const S3_REGION = Deno.env.get("S3_REGION") || "us-east-1";
const S3_ENDPOINT = Deno.env.get("S3_ENDPOINT"); // For S3-compatible services like MinIO
const S3_PUBLIC_URL = Deno.env.get("S3_PUBLIC_URL"); // CDN or custom domain for public URLs

let s3Client: S3Client | null = null;

/**
 * Get or create S3 client
 */
function getS3Client(): S3Client {
  if (!s3Client) {
    const config: ConstructorParameters<typeof S3Client>[0] = {
      region: S3_REGION,
    };
    if (S3_ENDPOINT) {
      config.endpoint = S3_ENDPOINT;
      config.forcePathStyle = true; // Required for MinIO and most S3-compatible services
    }
    s3Client = new S3Client(config);
  }
  return s3Client;
}

/**
 * Get the public URL for an S3 object
 */
function getS3Url(key: string): string {
  if (S3_PUBLIC_URL) {
    return `${S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  if (S3_ENDPOINT) {
    return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
  }
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

/**
 * Get content type from filename
 */
function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    webp: "image/webp",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  return types[ext || ""] || "application/octet-stream";
}

/**
 * Initialize storage - validates S3 config
 */
export async function initStorage(): Promise<void> {
  if (!S3_BUCKET) {
    throw new Error("S3_BUCKET environment variable is required");
  }
  console.log(`[Storage] S3 bucket=${S3_BUCKET}, region=${S3_REGION}`);
  if (S3_ENDPOINT) {
    console.log(`[Storage] S3 endpoint: ${S3_ENDPOINT}`);
  }
  if (S3_PUBLIC_URL) {
    console.log(`[Storage] S3 public URL: ${S3_PUBLIC_URL}`);
  }
}

/**
 * Save an avatar image
 */
export async function saveAvatar(filename: string, data: Uint8Array): Promise<string> {
  const key = `avatars/${filename}`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: getContentType(filename),
      CacheControl: "public, max-age=31536000",
    })
  );
  return getS3Url(key);
}

/**
 * Delete an avatar image
 */
export async function deleteAvatar(filename: string): Promise<void> {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: `avatars/${filename}`,
      })
    );
  } catch {
    // Ignore errors - file may not exist
  }
}

/**
 * Save a media file (post attachment)
 */
export async function saveMedia(filename: string, data: Uint8Array): Promise<string> {
  const key = `media/${filename}`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: getContentType(filename),
      CacheControl: "public, max-age=31536000",
    })
  );
  return getS3Url(key);
}

/**
 * Delete a media file
 */
export async function deleteMedia(filename: string): Promise<void> {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: `media/${filename}`,
      })
    );
  } catch {
    // Ignore errors - file may not exist
  }
}
