import type { ComponentProps } from "react";
import { FlatList, Platform } from "react-native";
import { FlashList as NativeFlashList } from "@shopify/flash-list";

type NativeFlashListProps<T> = ComponentProps<typeof NativeFlashList<T>>;
type WebFlashListProps<T> = NativeFlashListProps<T> & {
  estimatedItemSize?: number;
};

// Page lists must not rubber-band past the top edge — overscroll exposes the
// hard cutoff above screen headers. Lists with pull-to-refresh keep bouncing
// so the RefreshControl can appear; callers can still override explicitly.
function withScrollEdgeDefaults<T>(props: NativeFlashListProps<T>) {
  const hasRefreshControl = Boolean(props.refreshControl);
  return {
    ...props,
    bounces: props.bounces ?? hasRefreshControl,
    overScrollMode:
      props.overScrollMode ?? (hasRefreshControl ? "auto" : "never"),
  } as NativeFlashListProps<T>;
}

function WebFlashList<T>(props: WebFlashListProps<T>) {
  const { estimatedItemSize: _estimatedItemSize, ...flatListProps } =
    withScrollEdgeDefaults(props);
  return <FlatList {...(flatListProps as ComponentProps<typeof FlatList>)} />;
}

function AppFlashList<T>(props: NativeFlashListProps<T>) {
  return <NativeFlashList {...withScrollEdgeDefaults(props)} />;
}

export const FlashList = Platform.OS === "web" ? WebFlashList : AppFlashList;
