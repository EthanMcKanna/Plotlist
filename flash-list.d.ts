import "@shopify/flash-list";

declare module "@shopify/flash-list" {
  interface FlashListProps<_ItemT> {
    estimatedItemSize?: number;
  }
}
