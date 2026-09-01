// Settings keeps a local override per toggled notification preference so the
// switch moves immediately and holds while the mutation and its refetch are
// in flight. Overrides must not outlive that window: once the server agrees
// with an override it is redundant, and leaving it in place would shadow any
// later server-side change (another device, a Pro downgrade) for the whole
// session.

export type NotificationPrefOverrides = Record<string, boolean>;

/**
 * Drop every override the server payload already reflects. Returns the same
 * object when nothing changes so a state setter can no-op.
 */
export function reconcileNotificationOverrides(
  overrides: NotificationPrefOverrides,
  serverPrefs: Record<string, unknown> | null | undefined,
): NotificationPrefOverrides {
  if (!serverPrefs) {
    return overrides;
  }
  let changed = false;
  const next: NotificationPrefOverrides = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (serverPrefs[key] === value) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : overrides;
}
