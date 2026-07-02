// Structural typing for the R2 binding keeps the api/ tree free of a
// @cloudflare/workers-types dependency while remaining runtime-accurate.
export type UploadsBucket = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
    },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string; cacheControl?: string };
    httpEtag: string;
    size: number;
  } | null>;
  delete(key: string): Promise<void>;
};

let bucket: UploadsBucket | null = null;

export function initUploadsBucket(binding: UploadsBucket) {
  bucket = binding;
}

export function getUploadsBucket() {
  if (!bucket) {
    throw new Error("Uploads bucket is not initialized. Call initUploadsBucket(env.UPLOADS) first.");
  }
  return bucket;
}
