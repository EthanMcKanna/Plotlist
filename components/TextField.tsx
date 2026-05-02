import { Text, TextInput, TextInputProps, View } from "react-native";

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
      <View
        className={`flex-row items-center rounded-2xl border bg-dark-card ${
          error ? "border-status-danger" : "border-dark-border"
        }`}
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
      </View>
      {error ? (
        <Text className="mt-1.5 text-xs text-status-danger">{error}</Text>
      ) : hint ? (
        <Text className="mt-1.5 text-xs text-text-tertiary">{hint}</Text>
      ) : null}
    </View>
  );
}
