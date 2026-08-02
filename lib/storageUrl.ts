// Mirrors the server's storage:getUrl RPC, which is a pure string check —
// avatar/cover "storage ids" are full URLs since the R2 migration. Resolving
// locally avoids a network round-trip per avatar render.
export function resolveStorageUrl(
  storageId: string | null | undefined,
): string | null {
  if (!storageId) return null;
  return storageId.startsWith("http://") || storageId.startsWith("https://")
    ? storageId
    : null;
}
