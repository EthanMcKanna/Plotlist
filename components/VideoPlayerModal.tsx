import { Modal, Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type VideoPlayerModalProps = {
  visible: boolean;
  onClose: () => void;
  videoKey: string;
  title: string;
};

const EMBED_URL = (videoId: string) =>
  `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`;

// YouTube requires a valid Referer for embedded playback (fixes error 153)
const ORIGIN = "https://com.emckanna.Plotlist";

export function VideoPlayerModal({
  visible,
  onClose,
  videoKey,
  title,
}: VideoPlayerModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        {/* Header */}
        <View
          className="absolute left-0 right-0 top-0 z-10 flex-row items-center justify-between px-4 pb-2 pt-2"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/60 active:opacity-80"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text
            className="max-w-[70%] text-base font-semibold text-white"
            numberOfLines={1}
          >
            {title}
          </Text>
          <View className="w-10" />
        </View>

        {/* Video */}
        <View className="flex-1" style={{ marginTop: insets.top + 48 }}>
          <WebView
            source={{
              uri: EMBED_URL(videoKey),
              headers: { Referer: ORIGIN },
            }}
            style={{ flex: 1, backgroundColor: "#000" }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
            scrollEnabled={false}
            bounces={false}
          />
        </View>
      </View>
    </Modal>
  );
}
