import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { VideoPlayerModal } from "./VideoPlayerModal";

type VideoPlayerProps = {
  videoKey: string;
  title: string;
  type: string;
};

export function VideoPlayer({ videoKey, title, type }: VideoPlayerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const thumbnailUrl = `https://img.youtube.com/vi/${videoKey}/hqdefault.jpg`;

  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setModalVisible(true);
        }}
        className="w-64 active:opacity-80"
      >
        <View className="relative">
          <Image
            source={{ uri: thumbnailUrl }}
            style={{ width: 256, height: 144, borderRadius: 12 }}
            contentFit="cover"
            transition={200}
          />
          <View className="absolute inset-0 items-center justify-center">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-black/60">
              <Ionicons name="play" size={24} color="#ffffff" />
            </View>
          </View>
        </View>
        <Text className="mt-2 text-sm font-semibold text-text-primary" numberOfLines={2}>
          {title}
        </Text>
        <Text className="text-xs text-text-tertiary">{type}</Text>
      </Pressable>
      <VideoPlayerModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        videoKey={videoKey}
        title={title}
      />
    </>
  );
}
