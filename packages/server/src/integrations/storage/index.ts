// Object storage (ADR-004, 01 §9): private S3-compatible bucket, presigned PUT (5 min) for uploads, signed GET (1 h) for reads.
// Tests and local dev without a bucket inject the in-memory fake with setStorage(), like setDb().
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const PUT_TTL_SECONDS = 5 * 60;
export const GET_TTL_SECONDS = 60 * 60;

export type StoredObject = { sizeBytes: number; contentType: string | null };

export type ObjectStorage = {
  /** presigned PUT; Content-Type and Content-Length are signed, so the upload must match what R-25 approved */
  presignPut(input: { key: string; contentType: string; sizeBytes: number }): Promise<string>;
  /** signed GET for display (the bucket is never public) */
  presignGet(key: string): Promise<string>;
  /** null = no object under this key (not uploaded yet, or deleted) */
  head(key: string): Promise<StoredObject | null>;
  /** deleting a missing key is not an error */
  delete(key: string): Promise<void>;
};

type S3Options = { endpoint?: string; region?: string; bucket?: string; accessKeyId?: string; secretAccessKey?: string };

/** S3-compatible adapter; configuration from env S3_* (01 §6) unless given. */
export function createS3Storage(options: S3Options = {}): ObjectStorage {
  const bucket = options.bucket ?? process.env.S3_BUCKET ?? "";
  const accessKeyId = options.accessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = options.secretAccessKey ?? process.env.S3_SECRET_ACCESS_KEY ?? "";
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error("Object storage configuration missing");
  const client = new S3Client({
    endpoint: options.endpoint ?? process.env.S3_ENDPOINT ?? undefined,
    region: options.region ?? process.env.S3_REGION ?? "auto",
    credentials: { accessKeyId, secretAccessKey },
    // path-style works on R2, MinIO and AWS alike
    forcePathStyle: true,
  });
  return {
    presignPut: ({ key, contentType, sizeBytes }) =>
      getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }), {
        expiresIn: PUT_TTL_SECONDS,
        signableHeaders: new Set(["content-type"]),
      }),
    presignGet: (key) => getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: GET_TTL_SECONDS }),
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { sizeBytes: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
      } catch (e) {
        if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw new Error("Object storage request failed");
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/** In-memory storage: `put()` stands in for the client's PUT to the presigned URL. */
export function createFakeStorage() {
  const objects = new Map<string, StoredObject>();
  return {
    objects,
    put(key: string, object: StoredObject) {
      objects.set(key, object);
    },
    async presignPut({ key, sizeBytes }) {
      return `https://storage.test/${key}?op=put&size=${sizeBytes}&expires=${PUT_TTL_SECONDS}`;
    },
    async presignGet(key) {
      return `https://storage.test/${key}?op=get&expires=${GET_TTL_SECONDS}`;
    },
    async head(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
  } satisfies ObjectStorage & { objects: Map<string, StoredObject>; put(key: string, object: StoredObject): void };
}

let current: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  current ??= createS3Storage();
  return current;
}

/** Tests only: use this storage instead of S3_* (null = reset). */
export function setStorage(storage: ObjectStorage | null): void {
  current = storage;
}
