import { ApiError } from "./errors";
import { getServerEnv } from "./env";

// OpenAI's moderation endpoint is free; omni-moderation handles text and
// images in one call. Docs: https://developers.openai.com/api/reference/resources/moderations
const OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations";
const MODERATION_MODEL = "omni-moderation-latest";
const MODERATION_TIMEOUT_MS = 10_000;
// Per-item cap keeps request bodies bounded; nothing user-facing is this long.
const MAX_TEXT_CHARS_PER_ITEM = 20_000;

// Formats omni-moderation accepts as image input. Anything else (heic, bin)
// skips the image check rather than blocking the upload.
const MODERATABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * One surface per place user content enters the product. Adding moderation to
 * a future feature (list cover images, DMs, group threads, ...) means adding a
 * key here and calling moderateText/moderateImage from its handler — nothing
 * else.
 */
export type ModerationSurface = "profile" | "avatar" | "comment" | "review" | "list" | "log";

type SurfaceConfig = {
  /**
   * Categories that don't reject on this surface. Reviews/comments/lists are
   * about what happens on screen — "he murders half the cast in ep 3" is plot
   * summary, not a threat — so plain `violence` is ignored there while
   * `violence/graphic` and everything else still reject.
   */
  ignoredCategories: ReadonlySet<string>;
  rejectionMessage: string;
};

const NO_IGNORED: ReadonlySet<string> = new Set();
const SHOW_TALK_IGNORED: ReadonlySet<string> = new Set(["violence"]);

const SURFACES: Record<ModerationSurface, SurfaceConfig> = {
  profile: {
    ignoredCategories: NO_IGNORED,
    rejectionMessage: "That profile text may violate Plotlist's community guidelines. Please revise it and try again.",
  },
  avatar: {
    ignoredCategories: NO_IGNORED,
    rejectionMessage: "That image may violate Plotlist's community guidelines. Please choose a different photo.",
  },
  comment: {
    ignoredCategories: SHOW_TALK_IGNORED,
    rejectionMessage: "That comment may violate Plotlist's community guidelines. Please revise it and try again.",
  },
  review: {
    ignoredCategories: SHOW_TALK_IGNORED,
    rejectionMessage: "That review may violate Plotlist's community guidelines. Please revise it and try again.",
  },
  list: {
    ignoredCategories: SHOW_TALK_IGNORED,
    rejectionMessage: "That list text may violate Plotlist's community guidelines. Please revise it and try again.",
  },
  log: {
    ignoredCategories: SHOW_TALK_IGNORED,
    rejectionMessage: "That note may violate Plotlist's community guidelines. Please revise it and try again.",
  },
};

type ModerationInput =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ModerationApiResult = {
  flagged?: boolean;
  categories?: Record<string, boolean | null>;
};

/**
 * Calls OpenAI and returns the per-input results, or null when moderation is
 * unavailable (no key configured, network failure, timeout, non-2xx). Callers
 * treat null as "allow": a moderation outage must never take user writes down
 * with it, so this fails open and logs instead.
 */
async function requestModeration(inputs: ModerationInput[]): Promise<ModerationApiResult[] | null> {
  const apiKey = getServerEnv().OPENAI_MODERATION_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(OPENAI_MODERATIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODERATION_MODEL, input: inputs }),
      signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[moderation] OpenAI returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
      return null;
    }
    const payload = (await response.json()) as { results?: ModerationApiResult[] };
    return Array.isArray(payload.results) ? payload.results : null;
  } catch (error) {
    console.error(
      `[moderation] request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/** Categories that reject on this surface, across every result. */
function findViolations(
  results: ModerationApiResult[],
  ignoredCategories: ReadonlySet<string>,
): string[] {
  const violations = new Set<string>();
  for (const result of results) {
    if (!result?.flagged) {
      continue;
    }
    for (const [category, hit] of Object.entries(result.categories ?? {})) {
      if (hit && !ignoredCategories.has(category)) {
        violations.add(category);
      }
    }
  }
  return [...violations].sort();
}

function assertClean(surface: ModerationSurface, results: ModerationApiResult[] | null) {
  if (!results) {
    return;
  }
  const config = SURFACES[surface];
  const violations = findViolations(results, config.ignoredCategories);
  if (violations.length > 0) {
    throw new ApiError(422, "content_flagged", config.rejectionMessage, {
      surface,
      categories: violations,
    });
  }
}

/**
 * Moderates user-entered text before it is persisted. Pass every user-visible
 * text field from the request; empty/omitted values are skipped, and the call
 * is a no-op when nothing remains (so text-less mutations pay no latency).
 * Throws ApiError(422, "content_flagged") when OpenAI flags the content.
 */
export async function moderateText(
  surface: ModerationSurface,
  texts: Array<string | null | undefined>,
): Promise<void> {
  const inputs: ModerationInput[] = [];
  for (const text of texts) {
    const trimmed = text?.trim();
    if (trimmed) {
      inputs.push({ type: "text", text: trimmed.slice(0, MAX_TEXT_CHARS_PER_ITEM) });
    }
  }
  if (inputs.length === 0) {
    return;
  }
  assertClean(surface, await requestModeration(inputs));
}

/**
 * Moderates an uploaded image before it is persisted. Unsupported formats
 * (heic and unknown types) skip the check rather than blocking the upload.
 * Throws ApiError(422, "content_flagged") when OpenAI flags the image.
 */
export async function moderateImage(
  surface: ModerationSurface,
  bytes: Buffer,
  contentType: string | undefined,
): Promise<void> {
  if (!contentType || !MODERATABLE_IMAGE_TYPES.has(contentType) || bytes.length === 0) {
    return;
  }
  const dataUrl = `data:${contentType};base64,${bytes.toString("base64")}`;
  assertClean(surface, await requestModeration([{ type: "image_url", image_url: { url: dataUrl } }]));
}
