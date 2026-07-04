import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import { useMutation, useQuery } from "../../lib/plotlist/react";
import {
  STREAMING_PROVIDER_OPTIONS,
  normalizeStreamingProviderKeys,
} from "../../lib/streamingProviders";

export default function StreamingServicesScreen() {
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);

  const savedKeys = useMemo(
    () => normalizeStreamingProviderKeys(me?.streamingProviders),
    [me?.streamingProviders],
  );
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me && selected === null) {
      setSelected(new Set(savedKeys));
    }
  }, [me, savedKeys, selected]);

  const selectedKeys = useMemo(
    () =>
      selected
        ? STREAMING_PROVIDER_OPTIONS.map((option) => option.key).filter((key) =>
            selected.has(key),
          )
        : savedKeys,
    [savedKeys, selected],
  );
  const isDirty = selected !== null && selectedKeys.join(",") !== savedKeys.join(",");

  const toggle = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((previous) => {
      const next = new Set(previous ?? savedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const save = async () => {
    if (saving || !isDirty) return;
    setSaving(true);
    try {
      await updateProfile({ streamingProviders: selectedKeys });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      console.warn("Failed to save streaming services", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View className="px-6 pb-16 pt-2">
        <View className="flex-row items-center gap-3">
          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            radius={20}
            variant="control"
            contentStyle={{
              alignItems: "center",
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
          </GlassPressable>
          <View className="flex-1">
            <Text className="text-2xl font-black text-text-primary">My services</Text>
            <Text className="mt-0.5 text-xs text-text-tertiary">
              Home and search lean toward shows you can actually stream.
            </Text>
          </View>
        </View>

        <GlassSurface radius={16} variant="surface" style={{ marginTop: 20 }}>
          {STREAMING_PROVIDER_OPTIONS.map((option, index) => {
            const isOn = selected ? selected.has(option.key) : savedKeys.includes(option.key);
            return (
              <Pressable
                key={option.key}
                onPress={() => toggle(option.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isOn }}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-dark-hover ${
                  index === STREAMING_PROVIDER_OPTIONS.length - 1
                    ? ""
                    : "border-b border-dark-border"
                }`}
              >
                <Image
                  source={{ uri: option.logoUrl }}
                  style={{ borderRadius: 8, height: 32, width: 32 }}
                  contentFit="cover"
                />
                <Text className="flex-1 text-[15px] font-medium text-text-primary">
                  {option.label}
                </Text>
                <View
                  className="h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: isOn ? "#0EA5E9" : "rgba(255,255,255,0.08)",
                  }}
                >
                  {isOn ? <Ionicons name="checkmark" size={15} color="#0D0F14" /> : null}
                </View>
              </Pressable>
            );
          })}
        </GlassSurface>

        <Text className="mt-3 px-1 text-xs leading-4 text-text-tertiary">
          Pick none to see everything. Your selection filters the streaming rooms on
          Home and floats picks you can watch tonight to the front.
        </Text>

        <GlassPressable
          onPress={save}
          disabled={!isDirty || saving}
          radius={12}
          variant={isDirty ? "prominent" : "control"}
          style={{ marginTop: 20, opacity: !isDirty || saving ? 0.55 : 1 }}
          contentStyle={{
            alignItems: "center",
            justifyContent: "center",
            minHeight: 48,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#F1F3F7" />
          ) : (
            <Text
              className={`text-sm font-bold ${
                isDirty ? "text-text-inverse" : "text-text-secondary"
              }`}
            >
              Save
            </Text>
          )}
        </GlassPressable>
      </View>
    </Screen>
  );
}
