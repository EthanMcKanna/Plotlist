import { Text, TextInput, TextInputProps, View } from "react-native";

import { GlassSurface } from "./NativeGlass";

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoCapitalize = "none",
  multiline = false,
  className,
  keyboardType,
  textContentType,
  autoComplete,
  maxLength,
  editable = true,
  prefix,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  className?: string;
  keyboardType?: TextInputProps["keyboardType"];
  textContentType?: TextInputProps["textContentType"];
  autoComplete?: TextInputProps["autoComplete"];
  maxLength?: number;
  editable?: boolean;
  prefix?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <View className={className}>
      <Text className="mb-2 text-sm font-semibold text-text-secondary">
        {label}
      </Text>
      <GlassSurface
        radius={8}
        variant="control"
        borderColor={error ? "#EF4444" : undefined}
        fallbackColor="rgba(22,26,34,0.84)"
        contentStyle={{
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        {prefix ? (
          <Text className="pl-4 text-base text-text-tertiary">{prefix}</Text>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#5A6070"
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          keyboardType={keyboardType}
          textContentType={textContentType}
          autoComplete={autoComplete}
          maxLength={maxLength}
          editable={editable}
          className={`flex-1 py-3 text-[16px] text-text-primary ${
            prefix ? "pl-1 pr-4" : "px-4"
          } ${multiline ? "min-h-[96px]" : ""}`}
          style={multiline ? { textAlignVertical: "top" } : undefined}
        />
      </GlassSurface>
      {error ? (
        <Text className="mt-1.5 text-xs text-status-danger">{error}</Text>
      ) : hint ? (
        <Text className="mt-1.5 text-xs text-text-tertiary">{hint}</Text>
      ) : null}
    </View>
  );
}
