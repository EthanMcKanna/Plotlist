export function sanitizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

export function validateUsername(value: string): string | undefined {
  if (!value) return undefined;
  if (value.length < 3) return "Must be at least 3 characters";
  if (value.length > 20) return "Must be 20 characters or fewer";
  if (/^[0-9_]/.test(value)) return "Must start with a letter";
  if (/__/.test(value)) return "No consecutive underscores";
  return undefined;
}
