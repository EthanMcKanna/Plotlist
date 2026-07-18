import { Modal, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
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

// Web: react-native-webview has no browser implementation (it renders an
// unsupported-platform stub), so trailers play in a real <iframe> presented
// as a centered 16:9 lightbox — Escape and backdrop click both close it.
function WebVideoLightbox({
  visible,
  onClose,
  videoKey,
  title,
}: VideoPlayerModalProps) {
  const { width, height } = useWindowDimensions();
  const playerWidth = Math.min(width - 48, ((height - 160) * 16) / 9, 1080);
  const playerHeight = (playerWidth * 9) / 16;

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/80 px-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ width: playerWidth }}
        >
          <View className="mb-2 flex-row items-center justify-between">
            <Text
              className="flex-1 pr-3 text-base font-semibold text-white"
              numberOfLines={1}
            >
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close trailer"
              className="h-9 w-9 items-center justify-center rounded-full bg-white/10 web:transition-colors hover:bg-white/20 active:bg-white/25"
            >
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          </View>
          <View
            className="overflow-hidden rounded-2xl bg-black"
            style={{ width: playerWidth, height: playerHeight }}
          >
            <iframe
              src={EMBED_URL(videoKey)}
              title={title}
              width={playerWidth}
              height={playerHeight}
              style={{ border: 0, display: "block" }}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function VideoPlayerModal(props: VideoPlayerModalProps) {
  if (Platform.OS === "web") {
    return <WebVideoLightbox {...props} />;
  }
  return <NativeVideoPlayerModal {...props} />;
}

function NativeVideoPlayerModal({
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
