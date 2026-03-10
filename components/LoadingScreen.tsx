import { ActivityIndicator, View } from "react-native";

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-dark-bg">
      <ActivityIndicator size="large" color="#0ea5e9" />
    </View>
  );
}
