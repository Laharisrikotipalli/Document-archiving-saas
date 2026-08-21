const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET = process.env.CLOUD_STORAGE_BUCKET_NAME;
const EXPIRY = parseInt(process.env.PRESIGNED_URL_EXPIRY_SECONDS || "900", 10);

// This client works against MinIO locally and against real AWS S3 / any
// S3-compatible provider in production simply by changing env vars.
const s3 = new S3Client({
  region: process.env.CLOUD_STORAGE_REGION || "us-east-1",
  endpoint: process.env.CLOUD_STORAGE_ENDPOINT_URL || undefined,
  forcePathStyle: process.env.CLOUD_STORAGE_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.CLOUD_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUD_STORAGE_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a pre-signed URL allowing a client to PUT (upload) an object
 * directly to the storage bucket, bypassing the API server for the file bytes.
 */
async function getUploadUrl(storageKey) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(s3, command, { expiresIn: EXPIRY });
}

/**
 * Generate a pre-signed URL allowing a client to GET (download) an object
 * directly from the storage bucket.
 */
async function getDownloadUrl(storageKey) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(s3, command, { expiresIn: EXPIRY });
}

module.exports = { getUploadUrl, getDownloadUrl, BUCKET };
