export function createId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 12);
  const now = Date.now().toString(36);
  return `${prefix}_${now}${random}`;
}
