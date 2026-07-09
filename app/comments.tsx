import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Comments } from "../components/Comments";
import { GlassPressable } from "../components/NativeGlass";
import { Screen } from "../components/Screen";
import type { CommentTargetType } from "../lib/comments";

const TARGET_TYPES: CommentTargetType[] = ["review", "log", "list"];

// Standalone comments thread for targets without their own detail screen
// (watch logs) and for notification deep links.
export default function CommentsScreen() {
  const params = useLocalSearchParams();
  const targetType = TARGET_TYPES.find((type) => type === params.targetType) ?? null;
  const targetId = typeof params.targetId === "string" ? params.targetId : "";

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center px-4 pt-2">
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
          <Text className="ml-3 text-lg font-bold text-text-primary">Comments</Text>
        </View>
        {targetType && targetId ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            bounces={false}
            overScrollMode="never"
          >
            <View className="px-6 pb-10 pt-4">
              <Comments targetType={targetType} targetId={targetId} showHeader={false} />
            </View>
          </ScrollView>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-base text-text-tertiary">
              This conversation is no longer available.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
