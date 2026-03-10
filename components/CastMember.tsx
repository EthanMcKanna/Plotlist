import { Text, View } from "react-native";
import { Image } from "expo-image";

const DEFAULT_HEADSHOT =
  "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";

type CastMemberProps = {
  name: string;
  role: string;
  profilePath?: string | null;
};

export function CastMember({ name, role, profilePath }: CastMemberProps) {
  return (
    <View className="mr-8 w-24">
      <Image
        source={{ uri: profilePath || DEFAULT_HEADSHOT }}
        style={{ width: 96, height: 96, borderRadius: 48 }}
        contentFit="cover"
        transition={200}
      />
      <Text className="mt-2 text-sm font-semibold text-text-primary" numberOfLines={2}>
        {name}
      </Text>
      <Text className="text-xs text-text-tertiary" numberOfLines={2}>
        {role}
      </Text>
    </View>
  );
}
