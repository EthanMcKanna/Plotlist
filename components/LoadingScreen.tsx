import { Image } from "expo-image";
import { Text, View } from "react-native";

const ICON = require("../assets/icon.png");

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-dark-bg px-8">
      <View className="items-center gap-5">
        <Image
          accessibilityIgnoresInvertColors
          source={ICON}
          style={{ width: 116, height: 116, borderRadius: 26 }}
        />
        <View className="items-center gap-2">
          <Text className="text-4xl font-black text-text-primary">Plotlist</Text>
        </View>
      </View>
    </View>
  );
}
