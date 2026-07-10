// Structural typing for the Vectorize binding (same pattern as storage.ts:
// keeps api/ free of @cloudflare/workers-types while staying runtime-accurate).
// The index is `plotlist-shows-v2`: 1536 dims, cosine, one vector per show,
// vector id = the show's D1 id ("show_...").

export type VectorizeVector = {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
};

export type VectorizeMatch = {
  id: string;
  score: number;
  values?: number[];
  metadata?: Record<string, unknown>;
};

export type VectorizeQueryOptions = {
  topK?: number;
  filter?: Record<string, unknown>;
  returnValues?: boolean;
  returnMetadata?: "none" | "indexed" | "all";
};

export type VectorizeIndexBinding = {
  query(vector: number[], options?: VectorizeQueryOptions): Promise<{ matches: VectorizeMatch[] }>;
  getByIds(ids: string[]): Promise<VectorizeVector[]>;
  upsert(vectors: VectorizeVector[]): Promise<unknown>;
  deleteByIds(ids: string[]): Promise<unknown>;
};

let index: VectorizeIndexBinding | null = null;

export function initVectorizeIndex(binding: VectorizeIndexBinding | null | undefined) {
  index = binding ?? null;
}

// Nullable on purpose: local dev / tests run without the binding, and every
// caller has a non-vector fallback path (see docs/recommendations-v2.md).
export function getVectorizeIndex() {
  return index;
}
