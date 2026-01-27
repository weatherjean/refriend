/**
 * Storage module for file uploads (avatars, media)
 *
 * Uses AWS S3 or S3-compatible storage (MinIO for local dev).
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
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
 * Magic byte signatures for validating file types.
 * Each type can have multiple valid signatures.
 */
const MAGIC_BYTES: Record<string, number[][]> = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF header (WebP uses RIFF container)
  "video/mp4": [[0x00, 0x00, 0x00]], // ftyp box starts at offset 4, but first 3 bytes are size
  "video/webm": [[0x1a, 0x45, 0xdf, 0xa3]], // EBML header
};

/**
 * Validate that file content matches the expected type based on magic bytes.
 * Returns true if the file's magic bytes match the expected content type.
 */
function validateMagicBytes(data: Uint8Array, expectedType: string): boolean {
  const signatures = MAGIC_BYTES[expectedType];
  if (!signatures) {
    // Unknown type - allow it (will use extension-based type)
    return true;
  }

  for (const sig of signatures) {
    let match = true;
    for (let i = 0; i < sig.length; i++) {
      if (data[i] !== sig[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }

  return false;
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
  const contentType = getContentType(filename);

  // Validate magic bytes to prevent file type spoofing
  if (!validateMagicBytes(data, contentType)) {
    throw new Error("File content does not match extension");
  }

  const key = `avatars/${filename}`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
      ACL: "public-read",
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
  const contentType = getContentType(filename);

  // Validate magic bytes to prevent file type spoofing
  if (!validateMagicBytes(data, contentType)) {
    throw new Error("File content does not match extension");
  }

  const key = `media/${filename}`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
      ACL: "public-read",
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

/**
 * Generate a cache key from a remote URL (SHA-256 hash)
 * Key is URL-only (no extension) - Content-Type is set on the S3 object
 */
async function getCacheKey(url: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url)
  );
  const hashHex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `cache/${hashHex}`;
}

/**
 * Check if a cached version exists, return URL if so
 */
export async function getCachedMedia(url: string): Promise<string | null> {
  const key = await getCacheKey(url);
  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    );
    return getS3Url(key);
  } catch {
    return null;
  }
}

/**
 * Cache remote media to S3 (for proxy fallback)
 * Returns the cached URL
 */
export async function cacheRemoteMedia(
  remoteUrl: string,
  data: Uint8Array,
  contentType: string
): Promise<string> {
  const key = await getCacheKey(remoteUrl);

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
      CacheControl: "public, max-age=604800", // 7 days browser cache
      ACL: "public-read",
    })
  );
  return getS3Url(key);
}
