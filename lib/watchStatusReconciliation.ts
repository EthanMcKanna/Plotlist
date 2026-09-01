// Read-side watch-status reconciliation, shared by every server surface that
// hands a stored `watch_states.status` to a client (show page, library grid,
// library counts). The continue loader runs its own richer pass (it also
// weighs release events); this module is the pure planning half of the
// cheaper shared read: given stored rows and the progress facts for each,
// decide what each row should read as and which rows diverged.
//
// The write-back stays the caller's job, off the response path, and must
// preserve the row's original updatedAt: reconciliation corrects a label, it
// is not user activity, so it must not float a show to the top of
// "recently updated" orderings.

import {
  isWatchTierStatus,
  reconcileWatchStatus,
  type LegacyWatchStatus,
  type ShowProgressFacts,
  type WatchStatus,
} from "./watchStatusTransitions";

export type ReconcilableWatchState = {
  id: string;
  showId: string;
  status: string;
  updatedAt: number;
};

export type WatchStatusChange = {
  id: string;
  showId: string;
  from: LegacyWatchStatus;
  to: WatchStatus;
  /** The row's stored updatedAt — carried through so write-backs keep it. */
  updatedAt: number;
};

export type WatchStatusReconciliationPlan<Row> = {
  /** Every input row, in input order, with the status it should read as. */
  rows: Row[];
  /** Rows whose stored status differs from the reconciled one. */
  changes: WatchStatusChange[];
};

/**
 * Only the auto-managed tier (plus unmigrated legacy "completed") can be
 * re-derived from progress + metadata; watchlist/paused/dropped are user
 * intent and never move on a read.
 */
export function isReconcilableWatchStatus(status: string | null | undefined): boolean {
  return isWatchTierStatus(status) || status === "completed";
}

/**
 * Picks the rows worth re-deriving on a read that spans a whole library:
 * reconcilable statuses only, most recently updated first, capped. Divergence
 * concentrates in shows the user is actively on (a new episode landing, a
 * show ending), so recency is the right axis to spend the budget on.
 */
export function selectWatchStatesToReconcile<Row extends ReconcilableWatchState>(
  rows: ReadonlyArray<Row>,
  cap: number,
): Row[] {
  return rows
    .filter((row) => isReconcilableWatchStatus(row.status))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(0, cap));
}

/**
 * Maps stored rows onto their reconciled statuses. `factsFor` returns the
 * progress facts for a row, or null when the show's metadata could not be
 * loaded — such rows (and non-reconcilable statuses) pass through untouched.
 */
export function planWatchStatusReconciliation<Row extends ReconcilableWatchState>(
  rows: ReadonlyArray<Row>,
  factsFor: (row: Row) => ShowProgressFacts | null,
): WatchStatusReconciliationPlan<Row> {
  const changes: WatchStatusChange[] = [];
  const reconciledRows = rows.map((row) => {
    if (!isReconcilableWatchStatus(row.status)) {
      return row;
    }
    const facts = factsFor(row);
    if (!facts) {
      return row;
    }
    const currentStatus = row.status as LegacyWatchStatus;
    const next = reconcileWatchStatus({ currentStatus, facts });
    if (!next || next === currentStatus) {
      return row;
    }
    changes.push({
      id: row.id,
      showId: row.showId,
      from: currentStatus,
      to: next,
      updatedAt: row.updatedAt,
    });
    return { ...row, status: next };
  });
  return { rows: reconciledRows, changes };
}
