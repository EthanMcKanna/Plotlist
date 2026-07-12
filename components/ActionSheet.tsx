import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useIsDesktopWeb, useWebSheetStyle } from "../lib/webLayout";
import { GlassSurface } from "./NativeGlass";

export type ActionSheetOption = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
};

type ActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: ActionSheetOption[];
};

export function ActionSheet({
  visible,
  onClose,
  title,
  options,
}: ActionSheetProps) {
  // Desktop web: a centered dialog instead of an edge-to-edge bottom sheet.
  const isDesktopWeb = useIsDesktopWeb();
  const sheetStyle = useWebSheetStyle(440);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className={`flex-1 bg-black/50 ${
          isDesktopWeb ? "justify-center px-6" : "justify-end"
        }`}
      >
        <Pressable onPress={(e) => e.stopPropagation()} style={sheetStyle}>
          <GlassSurface
            radius={28}
            variant="sheet"
            style={
              isDesktopWeb
                ? undefined
                : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
            }
            contentStyle={{ paddingBottom: isDesktopWeb ? 20 : 32, paddingTop: 16 }}
          >
          {/* Handle bar (touch affordance — hidden on desktop web) */}
          {isDesktopWeb ? null : (
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-dark-border" />
            </View>
          )}

          {title && (
            <Text className="mb-4 px-6 text-center text-lg font-semibold text-text-primary">
              {title}
            </Text>
          )}

          <View className="px-4">
            {options.map((option, index) => (
              <Pressable
                key={index}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  option.onPress();
                  onClose();
                }}
                className="flex-row items-center gap-3 rounded-xl px-4 py-4 active:bg-dark-hover"
              >
                {option.icon && (
                  <Ionicons
                    name={option.icon}
                    size={22}
                    color={option.destructive ? "#EF4444" : "#9BA1B0"}
                  />
                )}
                <Text
                  className={`text-base font-medium ${
                    option.destructive ? "text-red-500" : "text-text-primary"
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-2 px-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              className="items-center rounded-xl bg-dark-card py-4 active:bg-dark-hover"
            >
              <Text className="text-base font-semibold text-text-primary">
                Cancel
              </Text>
            </Pressable>
          </View>
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
