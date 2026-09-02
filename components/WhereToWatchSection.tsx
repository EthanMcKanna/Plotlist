import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Text, View } from "react-native";

import { HorizontalRail } from "./HorizontalRail";
import { GlassPressable } from "./NativeGlass";

export type WhereToWatchProvider = {
  id?: string;
  key?: string;
  name: string;
  logoUrl?: string | null;
  deepLinkUrl?: string | null;
  source?: "original" | "subscription" | "free" | string | null;
};

type Props = {
  /** Resolved providers from `shows:getExtendedDetails` (already canonical). */
  providers: WhereToWatchProvider[] | null | undefined;
  /** False while extended details are still loading — the section stays hidden. */
  loaded: boolean;
  onPressProvider: (provider: WhereToWatchProvider) => void;
};

// The show page's WHERE TO WATCH section. Providers arrive pre-resolved by
// lib/watchProviders (subscription + free services only), so an empty list
// means "nothing qualifies" and we say so instead of hiding the section or
// padding it with rent/buy stores.
export function WhereToWatchSection({ providers, loaded, onPressProvider }: Props) {
  if (!loaded) return null;
  const list = Array.isArray(providers)
    ? providers.filter((provider) => typeof provider?.name === "string" && provider.name.trim())
    : [];

  return (
    <View className="mt-8 px-6" testID="where-to-watch">
      <View className="mb-3">
        <Text
          className="text-xs font-bold uppercase text-text-tertiary"
          style={{ letterSpacing: 1.5 }}
        >
          Where to Watch
        </Text>
        <Text className="mt-2 text-sm text-text-secondary">
          {list.length > 0
            ? "Streaming in the US with a subscription or for free."
            : "Not streaming in the US right now."}
        </Text>
      </View>

      {list.length > 0 ? (
        <HorizontalRail contentContainerStyle={{ paddingRight: 8 }}>
          {list.map((provider) => (
            <GlassPressable
              key={provider.key ?? provider.id ?? provider.name}
              testID={`where-to-watch-${provider.key ?? provider.id ?? provider.name}`}
              disabled={!provider.deepLinkUrl}
              onPress={() => onPressProvider(provider)}
              radius={999}
              variant="tinted"
              fallbackColor="rgba(22,26,34,0.70)"
              style={{ marginRight: 10 }}
              surfaceStyle={{ opacity: provider.deepLinkUrl ? 1 : 0.55 }}
              contentStyle={{
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              {provider.logoUrl ? (
                <Image
                  source={{ uri: provider.logoUrl }}
                  style={{ width: 24, height: 24, borderRadius: 6 }}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View className="h-6 w-6 items-center justify-center rounded-md bg-dark-elevated">
                  <Ionicons name="play-circle-outline" size={14} color="#9BA1B0" />
                </View>
              )}
              <Text className="text-sm font-medium text-text-primary">{provider.name}</Text>
              {provider.source === "free" ? (
                <Text className="text-[11px] font-semibold uppercase text-text-tertiary">Free</Text>
              ) : null}
            </GlassPressable>
          ))}
        </HorizontalRail>
      ) : null}

      <Text className="mt-3 text-[11px] text-text-tertiary">Availability data by JustWatch.</Text>
    </View>
  );
}
