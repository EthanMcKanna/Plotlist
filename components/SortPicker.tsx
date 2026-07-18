import { Pressable, Text, View } from "react-native";

export type SortOption = {
  value: string;
  label: string;
};

type SortPickerProps = {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
};

export function SortPicker({ options, value, onChange }: SortPickerProps) {
  return (
    <View className="flex-row rounded-xl bg-dark-elevated p-1">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={`flex-1 items-center justify-center rounded-lg px-3 py-2 web:transition-colors ${
              isSelected ? "bg-dark-card" : "hover:bg-white/5"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                isSelected ? "text-text-primary" : "text-text-tertiary"
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
