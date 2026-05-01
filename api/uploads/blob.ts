import { put } from "@vercel/blob";

import { ApiError } from "../_lib/errors";
import { json, methodNotAllowed } from "../_lib/http";
import { createId } from "../_lib/ids";
import { getFileExtension, verifyUploadToken } from "../_lib/uploads";

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

    const extension = getFileExtension(contentType);
    const blob = await put(`uploads/${payload.userId}/${createId("blob")}.${extension}`, body, {
      access: "public",
      addRandomSuffix: false,
      contentType,
    });

    return json(res, 200, {
      storageId: blob.url,
      url: blob.url,
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
