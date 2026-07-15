import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

type CastMemberProps = {
  name: string;
  role: string;
  profilePath?: string | null;
  onPress?: () => void;
};

export function CastMember({ name, role, profilePath, onPress }: CastMemberProps) {
  const content = (
    <>
      {profilePath ? (
        <Image
          source={{ uri: profilePath }}
          style={{ width: 96, height: 96, borderRadius: 48 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      ) : (
        <View
          className="items-center justify-center bg-dark-elevated"
          style={{ width: 96, height: 96, borderRadius: 48 }}
        >
          <Ionicons
            name="person"
            size={40}
            color="#5E6575"
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
        </View>
      )}
      <Text
        className="mt-2 text-sm font-semibold text-text-primary"
        numberOfLines={2}
      >
        {name}
      </Text>
      <Text className="text-xs text-text-tertiary" numberOfLines={2}>
        {role}
      </Text>
    </>
  );

  if (!onPress) {
    return <View className="mr-8 w-24">{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      className="mr-8 w-24 active:opacity-80"
    >
      {content}
    </Pressable>
  );
}
