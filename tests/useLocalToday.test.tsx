import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import { LOCAL_TODAY_POLL_INTERVAL_MS, useLocalToday } from "../lib/useLocalToday";

type AppStateHandler = (state: string) => void;

describe("useLocalToday", () => {
  let appStateHandlers: AppStateHandler[];
  let removeListener: jest.Mock;
  let addListenerSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-13T12:00:00.000Z"));
    appStateHandlers = [];
    removeListener = jest.fn();
    addListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(((_type: string, handler: AppStateHandler) => {
        appStateHandlers.push(handler);
        return { remove: removeListener };
      }) as any);
  });

  afterEach(() => {
    addListenerSpy.mockRestore();
    jest.useRealTimers();
  });

  it("rolls the day over on the poll tick instead of freezing the mount value", () => {
    const { result } = renderHook(() => useLocalToday());
    expect(result.current).toBe("2026-03-13");

    // Advancing timers also advances the fake clock by the same amount.
    jest.setSystemTime(new Date("2026-03-13T23:58:00.000Z"));
    act(() => {
      jest.advanceTimersByTime(LOCAL_TODAY_POLL_INTERVAL_MS);
    });
    expect(result.current).toBe("2026-03-13");

    jest.setSystemTime(new Date("2026-03-14T00:00:30.000Z"));
    act(() => {
      jest.advanceTimersByTime(LOCAL_TODAY_POLL_INTERVAL_MS);
    });
    expect(result.current).toBe("2026-03-14");
  });

  it("catches up the moment the app returns to the foreground", () => {
    const { result, unmount } = renderHook(() => useLocalToday());
    expect(appStateHandlers).toHaveLength(1);

    // Timers do not tick while backgrounded; the foreground event is what
    // notices the overnight day change.
    jest.setSystemTime(new Date("2026-03-15T08:00:00.000Z"));
    act(() => {
      appStateHandlers[0]?.("background");
    });
    expect(result.current).toBe("2026-03-13");
    act(() => {
      appStateHandlers[0]?.("active");
    });
    expect(result.current).toBe("2026-03-15");

    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe while disabled", () => {
    const { result } = renderHook(() => useLocalToday(false));
    expect(result.current).toBe("2026-03-13");
    expect(appStateHandlers).toHaveLength(0);
  });
});
