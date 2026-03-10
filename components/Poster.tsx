import { Image } from "expo-image";

export function Poster({
  uri,
  size = "md",
  width,
  className,
}: {
  uri?: string | null;
  size?: "sm" | "md" | "lg";
  width?: number;
  className?: string;
}) {
  const dimension =
    width ?? (size === "sm" ? 60 : size === "lg" ? 140 : 90);
  return (
    <Image
      source={uri ? { uri } : undefined}
      style={{ width: dimension, height: dimension * 1.5, borderRadius: 12 }}
      contentFit="cover"
      transition={200}
      className={className}
    />
  );
}
