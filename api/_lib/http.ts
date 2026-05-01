import type { IncomingMessage, ServerResponse } from "node:http";

import { ZodType } from "zod";

import { ApiError, asApiError } from "./errors";

type Handler<TBody> = (input: {
  req: IncomingMessage;
  res: ServerResponse;
  body: TBody;
}) => Promise<void>;

export async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
}

export function json(res: ServerResponse, status: number, body: unknown) {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function methodNotAllowed(res: ServerResponse) {
  return json(res, 405, {
    error: {
      code: "method_not_allowed",
      message: "Method not allowed",
    },
  });
}

export function withJsonRoute<TBody>(
  schema: ZodType<TBody>,
  handler: Handler<TBody>,
) {
  return async function route(req: IncomingMessage, res: ServerResponse) {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== "POST") {
      return methodNotAllowed(res);
    }

    try {
      const parsedBody = schema.parse(await readJsonBody(req));
      await handler({ req, res, body: parsedBody });
    } catch (error) {
      const apiError = asApiError(error);
      return json(res, apiError.status, {
        error: {
          code: apiError.code,
          message: apiError.message,
          details: apiError.details,
        },
      });
    }
  };
}

export function assert(condition: unknown, error: ApiError) {
  if (!condition) {
    throw error;
  }
}
