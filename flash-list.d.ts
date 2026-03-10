import "@shopify/flash-list";

declare module "@shopify/flash-list" {
  interface FlashListProps<ItemT> {
    estimatedItemSize?: number;
  }
}
