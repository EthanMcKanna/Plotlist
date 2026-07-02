import { ApiError } from "../_lib/errors";
import { json, methodNotAllowed } from "../_lib/http";
import { createId } from "../_lib/ids";
import { getFileExtension, getRequestOrigin, verifyUploadToken } from "../_lib/uploads";
import { getUploadsBucket } from "../../worker/storage";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

async function readBody(req: AsyncIterable<Buffer | string>) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  try {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const token =
      typeof req.query?.token === "string"
        ? req.query.token
        : requestUrl.searchParams.get("token") ?? undefined;
    if (!token) {
      throw new ApiError(401, "missing_upload_token", "Missing upload token");
    }

    const payload = verifyUploadToken(token);
    const contentType =
      typeof req.headers["content-type"] === "string"
        ? req.headers["content-type"]
        : "application/octet-stream";
    const body = await readBody(req);
    if (body.length === 0) {
      throw new ApiError(400, "empty_upload", "Upload body was empty");
    }
    if (body.length > MAX_UPLOAD_BYTES) {
      throw new ApiError(413, "upload_too_large", "Upload exceeds the 8MB limit");
    }

    const extension = getFileExtension(contentType);
    const key = `uploads/${payload.userId}/${createId("blob")}.${extension}`;
    await getUploadsBucket().put(key, body, {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    const url = `${getRequestOrigin(req)}/files/${key}`;
    return json(res, 200, {
      storageId: url,
      url,
    });
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(500, "upload_failed", error instanceof Error ? error.message : "Upload failed");

    return json(res, apiError.status, {
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
      },
    });
  }
}
