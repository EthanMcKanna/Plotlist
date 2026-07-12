import { ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { GlassPressable } from "./NativeGlass";
import { Screen } from "./Screen";
import { SHOW_BACK_BUTTON } from "../lib/webLayout";

export type LegalSection = {
  heading?: string;
  paragraphs: string[];
};

// Shared scaffold for the terms / privacy / guidelines screens: back button,
// title, updated date, then plain readable sections.
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
}) {
  return (
    <Screen>
      <View className="flex-row items-center px-4 pt-2">
        {SHOW_BACK_BUTTON ? (
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
        ) : null}
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pb-16 pt-4">
          <Text className="text-2xl font-bold text-text-primary">{title}</Text>
          <Text className="mt-1 text-xs text-text-tertiary">Last updated {updated}</Text>

          {intro ? (
            <Text className="mt-4 text-[15px] leading-6 text-text-secondary">{intro}</Text>
          ) : null}

          {sections.map((section, index) => (
            <View key={index} className="mt-6">
              {section.heading ? (
                <Text className="text-base font-semibold text-text-primary">
                  {section.heading}
                </Text>
              ) : null}
              {section.paragraphs.map((paragraph, pIndex) => (
                <Text
                  key={pIndex}
                  className={`${section.heading || pIndex > 0 ? "mt-2" : ""} text-[15px] leading-6 text-text-secondary`}
                >
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
