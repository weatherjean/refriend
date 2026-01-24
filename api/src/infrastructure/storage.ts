/**
 * Storage module for file uploads (avatars, etc.)
 *
 * Currently uses local filesystem storage.
 *
 * TODO: Implement S3 storage for production:
 * - Add S3 client (e.g., @aws-sdk/client-s3)
 * - Create S3Storage class implementing same interface
 * - Switch based on environment variable (STORAGE_TYPE=s3)
 * - Required S3 config: AWS_REGION, AWS_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * - Consider using presigned URLs for direct uploads from client
 */

import { join } from "@std/path";
import { ensureDir } from "@std/fs";

// Local storage directory (gitignored)
const UPLOADS_DIR = "./uploads";

export interface StorageConfig {
  type: "local" | "s3";
  // TODO: Add S3 config options
  // s3Bucket?: string;
  // s3Region?: string;
}

/**
 * Initialize storage - creates uploads directory if needed
 */
export async function initStorage(): Promise<void> {
  await ensureDir(join(UPLOADS_DIR, "avatars"));
  await ensureDir(join(UPLOADS_DIR, "media"));
  console.log("[Storage] Initialized local storage at:", UPLOADS_DIR);
}

/**
 * Save an avatar image
 * @param filename - The filename to save as (e.g., "user-123.webp")
 * @param data - The image data as Uint8Array
 * @returns The public URL path to the image
 *
 * TODO: For S3 implementation:
 * - Use PutObjectCommand to upload to S3
 * - Return the S3 URL or CloudFront URL
 * - Set appropriate Content-Type and Cache-Control headers
 */
export async function saveAvatar(filename: string, data: Uint8Array): Promise<string> {
  const filepath = join(UPLOADS_DIR, "avatars", filename);
  await Deno.writeFile(filepath, data);

  // Return URL path (relative to server root)
  return `/uploads/avatars/${filename}`;
}

/**
 * Delete an avatar image
 * @param filename - The filename to delete
 *
 * TODO: For S3 implementation:
 * - Use DeleteObjectCommand to remove from S3
 */
export async function deleteAvatar(filename: string): Promise<void> {
  try {
    const filepath = join(UPLOADS_DIR, "avatars", filename);
    await Deno.remove(filepath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Save a media file (post attachment)
 * @param filename - The filename to save as (e.g., "uuid.webp")
 * @param data - The file data as Uint8Array
 * @returns The public URL path to the file
 */
export async function saveMedia(filename: string, data: Uint8Array): Promise<string> {
  const filepath = join(UPLOADS_DIR, "media", filename);
  await Deno.writeFile(filepath, data);

  // Return URL path (relative to server root)
  return `/uploads/media/${filename}`;
}

/**
 * Delete a media file
 * @param filename - The filename to delete
 */
export async function deleteMedia(filename: string): Promise<void> {
  try {
    const filepath = join(UPLOADS_DIR, "media", filename);
    await Deno.remove(filepath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Get the full filesystem path for serving static files
 */
export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
