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

  console.error("[api] Unexpected error", error);
  return new ApiError(500, "internal_error", "Unexpected error");
}
