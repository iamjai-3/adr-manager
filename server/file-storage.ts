import { Client } from "minio";
import { logger } from "./logger";

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: parseInt(process.env.MINIO_PORT || "9000"),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const BUCKET = process.env.MINIO_BUCKET || "adr-manager";

// Ensure bucket exists on startup
async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) {
      await minioClient.makeBucket(BUCKET, "us-east-1");
      logger.info(`Created MinIO bucket: ${BUCKET}`);
    }
  } catch (err) {
    logger.error("Failed to ensure MinIO bucket exists", {
      message: err instanceof Error ? err.message : String(err),
      bucket: BUCKET,
    });
  }
}

// Initialize bucket on module load
ensureBucket();

export const fileStorage = {
  /**
   * Upload a file to MinIO.
   */
  async upload(objectName: string, buffer: Buffer, mimeType: string, size: number): Promise<string> {
    await minioClient.putObject(BUCKET, objectName, buffer, size, { "Content-Type": mimeType });
    return objectName;
  },

  /**
   * Get a pre-signed URL valid for 1 hour (for private access).
   */
  async getSignedUrl(objectName: string): Promise<string> {
    return minioClient.presignedGetObject(BUCKET, objectName, 60 * 60);
  },

  /**
   * Get a direct public URL (if bucket policy allows public read).
   */
  getPublicUrl(objectName: string): string {
    const port = process.env.MINIO_PORT || "9000";
    const endpoint = process.env.MINIO_ENDPOINT || "localhost";
    const ssl = process.env.MINIO_USE_SSL === "true" ? "https" : "http";
    return `${ssl}://${endpoint}:${port}/${BUCKET}/${objectName}`;
  },

  /**
   * Delete a file from MinIO.
   */
  async delete(objectName: string): Promise<void> {
    await minioClient.removeObject(BUCKET, objectName);
  },
};
