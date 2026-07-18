import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { LinkPressable } from "./LinkPressable";

type CastMemberProps = {
  name: string;
  role: string;
  profilePath?: string | null;
  // With a person id the card is a real /person link (an <a href> on web);
  // onPress becomes a pre-navigation side effect (haptics).
  personId?: string;
  onPress?: () => void;
};

export function CastMember({ name, role, profilePath, personId, onPress }: CastMemberProps) {
  const content = (
    <>
      {profilePath ? (
        <Image
          source={{ uri: profilePath }}
          accessibilityLabel={name}
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

  if (personId) {
    return (
      <LinkPressable
        href={{
          pathname: "/person/[id]",
          params: { id: personId, name, profilePath: profilePath ?? "" },
        }}
        onPress={onPress}
        accessibilityLabel={`Open ${name}`}
        className="mr-8 w-24 web:transition-opacity active:opacity-80 hover:opacity-90"
      >
        {content}
      </LinkPressable>
    );
  }

  if (!onPress) {
    return <View className="mr-8 w-24">{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      className="mr-8 w-24 web:transition-opacity active:opacity-80 hover:opacity-90"
    >
      {content}
    </Pressable>
  );
}
