/**
 * Canonical args for `episodeProgress:getUpNext`. The offset lets the server
 * resolve release days in the user's timezone instead of UTC. Every consumer
 * (rail hooks, optimistic updates) must build args through here so their
 * query-cache keys line up.
 */
export function getUpNextUtcOffsetMinutes(now = new Date()) {
  return -now.getTimezoneOffset();
}

export function getUpNextQueryArgs(now = new Date()) {
  return { utcOffsetMinutes: getUpNextUtcOffsetMinutes(now) };
}
