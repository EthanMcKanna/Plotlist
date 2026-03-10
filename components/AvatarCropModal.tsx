import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as Haptics from "expo-haptics";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CROP_SIZE = SCREEN_W - 80;
const OVERLAY_BORDER = Math.max(SCREEN_W, SCREEN_H);

function clamp(val: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, val));
}

type Props = {
  visible: boolean;
  imageUri: string | null;
  imageWidth: number;
  imageHeight: number;
  onCrop: (croppedUri: string) => void;
  onCancel: () => void;
};

export function AvatarCropModal({
  visible,
  imageUri,
  imageWidth,
  imageHeight,
  onCrop,
  onCancel,
}: Props) {
  const [cropping, setCropping] = useState(false);

  const baseScale =
    imageWidth > 0 && imageHeight > 0
      ? Math.max(CROP_SIZE / imageWidth, CROP_SIZE / imageHeight)
      : 1;

  const imgW = imageWidth;
  const imgH = imageHeight;
  const bScale = baseScale;
  const cropSz = CROP_SIZE;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTX.value = 0;
      savedTY.value = 0;
    }
  }, [visible, imageUri, scale, savedScale, translateX, translateY, savedTX, savedTY]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      "worklet";
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      "worklet";
      savedScale.value = scale.value;
      const maxTX = Math.max(0, (imgW * bScale * scale.value - cropSz) / 2);
      const maxTY = Math.max(0, (imgH * bScale * scale.value - cropSz) / 2);
      const clampedX = clamp(translateX.value, -maxTX, maxTX);
      const clampedY = clamp(translateY.value, -maxTY, maxTY);
      translateX.value = withSpring(clampedX, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(clampedY, { damping: 20, stiffness: 200 });
      savedTX.value = clampedX;
      savedTY.value = clampedY;
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      "worklet";
      translateX.value = savedTX.value + e.translationX;
      translateY.value = savedTY.value + e.translationY;
    })
    .onEnd(() => {
      "worklet";
      const maxTX = Math.max(0, (imgW * bScale * scale.value - cropSz) / 2);
      const maxTY = Math.max(0, (imgH * bScale * scale.value - cropSz) / 2);
      const clampedX = clamp(translateX.value, -maxTX, maxTX);
      const clampedY = clamp(translateY.value, -maxTY, maxTY);
      translateX.value = withSpring(clampedX, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(clampedY, { damping: 20, stiffness: 200 });
      savedTX.value = clampedX;
      savedTY.value = clampedY;
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    width: imgW * bScale,
    height: imgH * bScale,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleCrop = useCallback(async () => {
    if (!imageUri || cropping) return;
    setCropping(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const s = savedScale.value;
      const tx = savedTX.value;
      const ty = savedTY.value;

      const cropRadiusPx = cropSz / (2 * bScale * s);
      const cx = imgW / 2 - tx / (bScale * s);
      const cy = imgH / 2 - ty / (bScale * s);
      let size = cropRadiusPx * 2;

      let originX = cx - cropRadiusPx;
      let originY = cy - cropRadiusPx;

      if (originX < 0) originX = 0;
      if (originY < 0) originY = 0;
      if (originX + size > imgW) {
        originX = imgW - size;
        if (originX < 0) {
          originX = 0;
          size = imgW;
        }
      }
      if (originY + size > imgH) {
        originY = imgH - size;
        if (originY < 0) {
          originY = 0;
          size = imgH;
        }
      }

      const result = await manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(size),
              height: Math.round(size),
            },
          },
          { resize: { width: 512, height: 512 } },
        ],
        { compress: 0.85, format: SaveFormat.JPEG },
      );

      onCrop(result.uri);
    } catch (error) {
      console.error("Crop failed:", error);
    } finally {
      setCropping(false);
    }
  }, [imageUri, cropping, savedScale, savedTX, savedTY, bScale, imgW, imgH, cropSz, onCrop]);

  if (!imageUri) return null;

  const overlayTotal = CROP_SIZE + OVERLAY_BORDER * 2;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCancel();
            }}
            hitSlop={12}
            disabled={cropping}
          >
            <Text style={styles.headerButton}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Crop Photo</Text>
          <Pressable
            onPress={handleCrop}
            hitSlop={12}
            disabled={cropping}
          >
            {cropping ? (
              <ActivityIndicator color="#0ea5e9" size="small" />
            ) : (
              <Text style={[styles.headerButton, styles.headerDone]}>Done</Text>
            )}
          </Pressable>
        </View>

        {/* Crop area */}
        <View style={styles.cropContainer}>
          <GestureDetector gesture={composed}>
            <Animated.Image
              source={{ uri: imageUri }}
              style={animatedStyle}
              resizeMode="cover"
            />
          </GestureDetector>

          {/* Circular mask overlay */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View
              style={[
                styles.maskOverlay,
                {
                  width: overlayTotal,
                  height: overlayTotal,
                  borderRadius: overlayTotal / 2,
                  borderWidth: OVERLAY_BORDER,
                  left: (SCREEN_W - CROP_SIZE) / 2 - OVERLAY_BORDER,
                  top: (SCREEN_H * 0.42 - CROP_SIZE / 2) - OVERLAY_BORDER,
                },
              ]}
            />
            {/* Circle outline */}
            <View
              style={[
                styles.circleOutline,
                {
                  width: CROP_SIZE,
                  height: CROP_SIZE,
                  borderRadius: CROP_SIZE / 2,
                  left: (SCREEN_W - CROP_SIZE) / 2,
                  top: SCREEN_H * 0.42 - CROP_SIZE / 2,
                },
              ]}
            />
          </View>
        </View>

        {/* Footer hint */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Pinch to zoom, drag to reposition
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0F14",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerButton: {
    fontSize: 17,
    color: "#9BA1B0",
    fontWeight: "500",
  },
  headerDone: {
    color: "#0ea5e9",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#F1F3F7",
  },
  cropContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  maskOverlay: {
    position: "absolute",
    borderColor: "rgba(13, 15, 20, 0.8)",
    backgroundColor: "transparent",
  },
  circleOutline: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  footer: {
    alignItems: "center",
    paddingBottom: 48,
    paddingTop: 16,
  },
  footerText: {
    fontSize: 14,
    color: "#5A6070",
  },
});
