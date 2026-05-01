import type { ComponentProps } from "react";
import { FlatList, Platform } from "react-native";
import { FlashList as NativeFlashList } from "@shopify/flash-list";

type NativeFlashListProps<T> = ComponentProps<typeof NativeFlashList<T>>;
type WebFlashListProps<T> = NativeFlashListProps<T> & {
  estimatedItemSize?: number;
};

function WebFlashList<T>(props: WebFlashListProps<T>) {
  const { estimatedItemSize: _estimatedItemSize, ...flatListProps } = props;
  return <FlatList {...flatListProps} />;
}

export const FlashList =
  Platform.OS === "web" ? WebFlashList : NativeFlashList;
