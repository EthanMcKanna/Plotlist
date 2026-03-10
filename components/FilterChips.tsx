import { Pressable, ScrollView, Text } from "react-native";

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
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            className={`flex-row items-center rounded-full px-4 py-2 ${
              isSelected
                ? "bg-brand-500"
                : "border border-dark-border bg-dark-card"
            }`}
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
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
