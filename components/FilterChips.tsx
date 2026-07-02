import { ScrollView, Text } from "react-native";

import { GlassPressable } from "./NativeGlass";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
};

type FilterChipsProps = {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
};

export function FilterChips({ options, value, onChange }: FilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <GlassPressable
            key={option.value}
            onPress={() => onChange(option.value)}
            radius={999}
            variant={isSelected ? "prominent" : "control"}
            fallbackColor={isSelected ? "rgba(14,165,233,0.86)" : undefined}
            contentStyle={{
              alignItems: "center",
              flexDirection: "row",
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text
              className={`text-sm font-medium ${
                isSelected ? "text-white" : "text-text-primary"
              }`}
            >
              {option.label}
            </Text>
            {option.count !== undefined && (
              <Text
                className={`ml-1.5 text-xs ${
                  isSelected ? "text-brand-200" : "text-text-tertiary"
                }`}
              >
                {option.count}
              </Text>
            )}
          </GlassPressable>
        );
      })}
    </ScrollView>
  );
}
