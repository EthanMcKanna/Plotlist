import { Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

// Shared create/edit fields for lists so both flows stay visually identical.
export function ListForm({
  title,
  description,
  isPublic,
  saving,
  submitLabel,
  savingLabel,
  autoFocus,
  onChangeTitle,
  onChangeDescription,
  onToggleVisibility,
  onSubmit,
}: {
  title: string;
  description: string;
  isPublic: boolean;
  saving: boolean;
  submitLabel: string;
  savingLabel: string;
  autoFocus?: boolean;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onToggleVisibility: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = Boolean(title.trim()) && !saving;
  return (
    <View>
      {/* text-[16px] instead of text-base: Tailwind's text-base carries a
          24px lineHeight, which vertically misaligns single-line TextInputs
          on iOS. */}
      <TextInput
        value={title}
        onChangeText={onChangeTitle}
        placeholder="List name"
        placeholderTextColor="#5A6070"
        autoFocus={autoFocus}
        maxLength={100}
        className="rounded-xl border border-dark-border bg-dark-bg px-4 py-3 text-[16px] text-text-primary"
      />
      <TextInput
        value={description}
        onChangeText={onChangeDescription}
        placeholder="Description (optional)"
        placeholderTextColor="#5A6070"
        multiline
        maxLength={500}
        className="mt-3 min-h-[72px] rounded-xl border border-dark-border bg-dark-bg px-4 py-3 text-[16px] leading-[22px] text-text-primary"
        style={{ textAlignVertical: "top" }}
      />
      <View className="mt-4 flex-row items-center justify-between">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggleVisibility();
          }}
          className={`flex-row items-center gap-2 rounded-full border px-3.5 py-2 ${
            isPublic
              ? "border-green-600/40 bg-green-500/10"
              : "border-dark-border bg-dark-bg"
          }`}
        >
          <Ionicons
            name={isPublic ? "globe-outline" : "lock-closed-outline"}
            size={14}
            color={isPublic ? "#22C55E" : "#9BA1B0"}
          />
          <Text
            className={`text-xs font-semibold ${
              isPublic ? "text-green-500" : "text-text-secondary"
            }`}
          >
            {isPublic ? "Public" : "Private"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSubmit();
          }}
          disabled={!canSubmit}
          className={`rounded-full px-5 py-2.5 ${
            canSubmit ? "bg-brand-500 active:bg-brand-600" : "bg-dark-elevated"
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              canSubmit ? "text-white" : "text-text-tertiary"
            }`}
          >
            {saving ? savingLabel : submitLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
