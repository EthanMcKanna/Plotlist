// Thin fetch-based Gemini embeddings + generation client, usable from the
// Worker and from Node scripts (no SDK dependency). See
// docs/recommendations-v2.md.

import { normalizeVector } from "../../lib/plotlist/embeddingUtils";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../../lib/plotlist/embeddingDoc";
import { ApiError } from "./errors";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
// batchEmbedContents accepts up to 100 requests per call.
export const GEMINI_EMBED_BATCH_LIMIT = 100;

export type EmbeddingTaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "SEMANTIC_SIMILARITY";

type EmbedOptions = {
  apiKey?: string;
  taskType: EmbeddingTaskType;
  model?: string;
  dimensions?: number;
  maxAttempts?: number;
};

function resolveApiKey(explicit?: string) {
  const apiKey = explicit ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return apiKey;
}

// Character-based estimate (~4 chars/token for this kind of English metadata
// text). Used for spend accounting only — billing truth lives with Google.
export function estimateEmbeddingTokens(text: string) {
  return Math.ceil(text.length / 4);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry(url: string, body: unknown, maxAttempts: number) {
  let lastError: Error | null = null;
  let rateLimited = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        return (await response.json()) as any;
      }
      const text = await response.text();
      rateLimited = response.status === 429;
      const retryable = rateLimited || response.status >= 500;
      lastError = new Error(`Gemini embed failed (${response.status}): ${text.slice(0, 300)}`);
      if (!retryable || attempt === maxAttempts) {
        throw lastError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxAttempts) {
        throw lastError;
      }
    }
    // Per-minute quota exhaustion needs a real cool-down, not a fast retry.
    const backoff = rateLimited
      ? Math.min(20_000 * attempt, 120_000)
      : Math.min(1000 * 2 ** (attempt - 1), 15_000);
    await sleep(backoff + Math.floor(Math.random() * 500));
  }
  throw lastError ?? new Error("Gemini embed failed");
}

// Embeds up to GEMINI_EMBED_BATCH_LIMIT texts per API call and returns unit
// vectors (Gemini only pre-normalizes full-dimension output, so truncated
// dimensions must be re-normalized client-side).
export async function embedTexts(texts: string[], options: EmbedOptions): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const apiKey = resolveApiKey(options.apiKey);
  const model = options.model ?? EMBEDDING_MODEL;
  const dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS;
  const maxAttempts = options.maxAttempts ?? 5;
  const url = `${GEMINI_BASE_URL}/models/${model}:batchEmbedContents?key=${apiKey}`;

  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += GEMINI_EMBED_BATCH_LIMIT) {
    const chunk = texts.slice(offset, offset + GEMINI_EMBED_BATCH_LIMIT);
    const payload = {
      requests: chunk.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType: options.taskType,
        outputDimensionality: dimensions,
      })),
    };
    const result = await callWithRetry(url, payload, maxAttempts);
    const embeddings = Array.isArray(result?.embeddings) ? result.embeddings : [];
    if (embeddings.length !== chunk.length) {
      throw new Error(
        `Gemini embed returned ${embeddings.length} embeddings for ${chunk.length} inputs`,
      );
    }
    for (const embedding of embeddings) {
      const values = Array.isArray(embedding?.values) ? embedding.values.map(Number) : [];
      if (values.length !== dimensions) {
        throw new Error(`Gemini embed returned ${values.length} dims (expected ${dimensions})`);
      }
      vectors.push(normalizeVector(values));
    }
  }
  return vectors;
}

export async function embedText(text: string, options: EmbedOptions) {
  const [vector] = await embedTexts([text], options);
  return vector;
}

// ── Structured generation (Ask Plotlist) ────────────────────────────────────

// The 2.5-era models 404 for this project's key ("no longer available to new
// users", verified 2026-07-25), so Ask runs on the 3.5 fast tier.
const GENERATION_MODEL = "gemini-3.5-flash-lite";
const GENERATION_FALLBACK_MODEL = "gemini-3.5-flash";

function extractJsonText(result: any): string {
  const parts = result?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("");
}

// One structured-output call: system + user prompt constrained by a Gemini
// responseSchema (OpenAPI-ish subset, uppercase type names). Retries the
// generation once on a JSON parse failure, then surfaces a 502 the ask
// pipeline can catch and degrade from. `model` overrides the default fast
// tier for callers whose output is globally cached (catch-up briefs) and so
// can afford a stronger model per generation.
export async function generateJson<T>(args: {
  system: string;
  user: string;
  schema: object;
  maxOutputTokens?: number;
  model?: string;
}): Promise<T> {
  const apiKey = resolveApiKey();
  const body = {
    systemInstruction: { parts: [{ text: args.system }] },
    contents: [{ role: "user", parts: [{ text: args.user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: args.schema,
      temperature: 0.4,
      maxOutputTokens: args.maxOutputTokens ?? 1024,
    },
  };

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let model = args.model ?? GENERATION_MODEL;
    let response = await fetch(
      `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (response.status === 404) {
      model = GENERATION_FALLBACK_MODEL;
      response = await fetch(
        `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    }
    if (!response.ok) {
      const text = await response.text();
      lastError = new Error(
        `Gemini generate failed (${response.status}): ${text.slice(0, 300)}`,
      );
      if (response.status === 429 || response.status >= 500) {
        continue;
      }
      break;
    }
    const result = (await response.json()) as any;
    const usage = result?.usageMetadata;
    console.info(
      "[ask] llm",
      model,
      `prompt=${usage?.promptTokenCount ?? "?"}`,
      `output=${usage?.candidatesTokenCount ?? "?"}`,
      `total=${usage?.totalTokenCount ?? "?"}`,
    );
    try {
      return JSON.parse(extractJsonText(result)) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw new ApiError(
    502,
    "ask_generation_failed",
    "The recommendation model returned an unusable response",
    lastError?.message,
  );
}
