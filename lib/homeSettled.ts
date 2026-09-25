// One-shot launch signal: the home tab's initial rails have committed (or
// its commit cap elapsed). Background pre-warming — sibling tab mounts and
// their queries — waits on it so it doesn't compete with home's own loaders
// for the network and the JS thread during the launch window.
let settled = false;
const listeners = new Set<() => void>();

export function markHomeSettled() {
  if (settled) return;
  settled = true;
  for (const listener of [...listeners]) {
    listener();
  }
  listeners.clear();
}

export function isHomeSettled() {
  return settled;
}

// Runs `callback` once home has settled, or after `fallbackMs` if it never
// does (signed out, or launched straight into a deep link). Returns a
// cancel function.
export function onHomeSettled(callback: () => void, fallbackMs: number) {
  if (settled) {
    callback();
    return () => {};
  }
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    listeners.delete(run);
    callback();
  };
  const timer = setTimeout(run, fallbackMs);
  listeners.add(run);
  return () => {
    done = true;
    clearTimeout(timer);
    listeners.delete(run);
  };
}
