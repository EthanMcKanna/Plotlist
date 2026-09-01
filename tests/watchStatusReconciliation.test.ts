import { describe, expect, it } from "@jest/globals";

import {
  isReconcilableWatchStatus,
  planWatchStatusReconciliation,
  selectWatchStatesToReconcile,
} from "../lib/watchStatusReconciliation";
import type { ShowProgressFacts } from "../lib/watchStatusTransitions";

const facts = (overrides: Partial<ShowProgressFacts> = {}): ShowProgressFacts => ({
  hasWatchedAny: true,
  hasReleasedAfterFrontier: false,
  isEnded: false,
  gapEpisodes: [],
  releasedCount: 10,
  ...overrides,
});

const row = (id: string, status: string, updatedAt = 1000) => ({
  id,
  showId: `show-${id}`,
  status,
  updatedAt,
});

describe("isReconcilableWatchStatus", () => {
  it("covers the auto-managed tier and legacy completed only", () => {
    expect(isReconcilableWatchStatus("watching")).toBe(true);
    expect(isReconcilableWatchStatus("caught_up")).toBe(true);
    expect(isReconcilableWatchStatus("finished")).toBe(true);
    expect(isReconcilableWatchStatus("completed")).toBe(true);
    expect(isReconcilableWatchStatus("watchlist")).toBe(false);
    expect(isReconcilableWatchStatus("paused")).toBe(false);
    expect(isReconcilableWatchStatus("dropped")).toBe(false);
    expect(isReconcilableWatchStatus(null)).toBe(false);
  });
});

describe("selectWatchStatesToReconcile", () => {
  it("keeps only reconcilable rows, newest first, within the cap", () => {
    const rows = [
      row("a", "watching", 10),
      row("b", "watchlist", 500),
      row("c", "caught_up", 300),
      row("d", "completed", 200),
      row("e", "paused", 900),
      row("f", "finished", 400),
    ];
    expect(selectWatchStatesToReconcile(rows, 3).map((entry) => entry.id)).toEqual([
      "f",
      "c",
      "d",
    ]);
    expect(selectWatchStatesToReconcile(rows, 0)).toEqual([]);
  });
});

describe("planWatchStatusReconciliation", () => {
  it("never moves user-intent statuses and never calls for their facts", () => {
    const rows = [row("a", "watchlist"), row("b", "paused"), row("c", "dropped")];
    let calls = 0;
    const plan = planWatchStatusReconciliation(rows, () => {
      calls += 1;
      return facts({ hasReleasedAfterFrontier: true });
    });
    expect(calls).toBe(0);
    expect(plan.changes).toEqual([]);
    expect(plan.rows).toEqual(rows);
  });

  it("flips caught_up to watching when a released episode is past the frontier", () => {
    const plan = planWatchStatusReconciliation([row("a", "caught_up", 42)], () =>
      facts({ hasReleasedAfterFrontier: true }),
    );
    expect(plan.rows[0].status).toBe("watching");
    expect(plan.changes).toEqual([
      { id: "a", showId: "show-a", from: "caught_up", to: "watching", updatedAt: 42 },
    ]);
  });

  it("re-resolves finished and caught_up against the show's ended flag", () => {
    const plan = planWatchStatusReconciliation(
      [row("ended", "caught_up"), row("revived", "finished")],
      (entry) => facts({ isEnded: entry.id === "ended" }),
    );
    expect(plan.rows.map((entry) => entry.status)).toEqual(["finished", "caught_up"]);
    expect(plan.changes.map((change) => change.to)).toEqual(["finished", "caught_up"]);
  });

  it("maps legacy completed onto finished even with thin metadata", () => {
    const plan = planWatchStatusReconciliation([row("a", "completed")], () =>
      facts({ releasedCount: 0, hasWatchedAny: false }),
    );
    expect(plan.rows[0].status).toBe("finished");
    expect(plan.changes[0]).toMatchObject({ from: "completed", to: "finished" });
  });

  it("leaves rows alone when facts are unavailable or already agree", () => {
    const rows = [row("missing", "watching"), row("agrees", "caught_up")];
    const plan = planWatchStatusReconciliation(rows, (entry) =>
      entry.id === "missing" ? null : facts(),
    );
    expect(plan.changes).toEqual([]);
    expect(plan.rows).toEqual(rows);
    // Untouched rows are the same objects — callers can rely on identity.
    expect(plan.rows[0]).toBe(rows[0]);
  });

  it("preserves input order and extra row fields on corrected rows", () => {
    const rows = [
      { ...row("a", "watching"), extra: "kept" },
      { ...row("b", "caught_up"), extra: "kept-too" },
    ];
    const plan = planWatchStatusReconciliation(rows, () => facts());
    expect(plan.rows.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(plan.rows[0]).toMatchObject({ status: "caught_up", extra: "kept" });
    expect(plan.rows[1]).toBe(rows[1]);
  });
});
