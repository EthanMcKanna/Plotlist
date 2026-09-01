import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "./plotlist/api";
import { useMutation } from "./plotlist/react";
import { queryClient } from "./queryClient";
import {
  applyFollowStateToCaches,
  FOLLOWING,
  NOT_FOLLOWING,
  REQUESTED,
} from "./followOptimistic";
import { createDirectCacheStore } from "./optimisticCache";

/**
 * Follow / unfollow for a person row, optimistic on every platform.
 *
 * The label flips on the tap, every cache that lists the person is patched
 * in the same tick (lib/followOptimistic.ts), and the server round trip
 * only confirms — or rolls back on error. Nothing is disabled while the
 * request is in flight: a second tap is a real intent (unfollow right
 * after follow) and the serial mutation queue keeps the order honest.
 *
 * Seeds come from the parent's payload. A refetched seed wins over local
 * state except while a tap is still in flight, when the optimistic state is
 * the truth and a stale prop must not clobber it; the in-flight result
 * settles the state instead.
 */
export function useFollowToggle(
  userId: string,
  seed: { isFollowing?: boolean | null; isRequested?: boolean | null },
  options?: { onPress?: () => void },
) {
  const follow = useMutation(api.follows.follow);
  const unfollow = useMutation(api.follows.unfollow);
  const seedFollowing = Boolean(seed.isFollowing);
  const seedRequested = Boolean(seed.isRequested);
  const [isFollowing, setIsFollowing] = useState(seedFollowing);
  const [isRequested, setIsRequested] = useState(seedRequested);
  const inFlightRef = useRef(0);
  const onPressRef = useRef(options?.onPress);
  onPressRef.current = options?.onPress;

  useEffect(() => {
    if (inFlightRef.current > 0) return;
    setIsFollowing(seedFollowing);
  }, [seedFollowing]);
  useEffect(() => {
    if (inFlightRef.current > 0) return;
    setIsRequested(seedRequested);
  }, [seedRequested]);

  const toggle = useCallback(async () => {
    onPressRef.current?.();
    const wasFollowing = isFollowing;
    const wasRequested = isRequested;
    inFlightRef.current += 1;
    try {
      if (wasFollowing || wasRequested) {
        setIsFollowing(false);
        setIsRequested(false);
        // Unfollow also withdraws a pending follow request.
        await unfollow.withOptimisticUpdate((localStore) => {
          applyFollowStateToCaches(localStore, queryClient, userId, NOT_FOLLOWING);
        })({ userIdToUnfollow: userId });
        setIsFollowing(false);
        setIsRequested(false);
      } else {
        setIsFollowing(true);
        const result = (await follow.withOptimisticUpdate((localStore) => {
          applyFollowStateToCaches(localStore, queryClient, userId, FOLLOWING);
        })({ userIdToFollow: userId })) as { status?: string } | null;
        if (result?.status === "requested") {
          setIsFollowing(false);
          setIsRequested(true);
          // Private account: the rows patched to "following" above must now
          // read as a pending request instead.
          applyFollowStateToCaches(createDirectCacheStore(queryClient), queryClient, userId, REQUESTED);
        } else {
          setIsFollowing(true);
        }
      }
    } catch (error) {
      console.warn("Failed to update follow", error);
      setIsFollowing(wasFollowing);
      setIsRequested(wasRequested);
    } finally {
      inFlightRef.current -= 1;
    }
  }, [follow, isFollowing, isRequested, unfollow, userId]);

  return { isFollowing, isRequested, toggle };
}
