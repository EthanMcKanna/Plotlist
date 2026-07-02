export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  const detail =
    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  console.error(`[api] Unexpected error ${detail}`);
  return new ApiError(
    500,
    "internal_error",
    "Unexpected error",
    process.env.DEBUG_ERRORS === "true" ? detail.slice(0, 2000) : undefined,
  );
}
