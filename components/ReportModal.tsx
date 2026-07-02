import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { GlassSurface } from "./NativeGlass";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

export function ReportModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason?: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!visible) {
      setReason("");
    }
  }, [visible]);

  const handleSubmit = async () => {
    await onSubmit(reason.trim() ? reason.trim() : undefined);
    setReason("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} className="flex-1 bg-black/50 px-6 py-16">
        <Pressable onPress={(e) => e.stopPropagation()}>
          <GlassSurface radius={8} variant="sheet" contentStyle={{ padding: 16 }}>
          <Text className="text-lg font-semibold text-text-primary">
            Report content
          </Text>
          <Text className="mt-2 text-sm text-text-tertiary">
            Tell us what’s wrong (optional).
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason"
            multiline
            placeholderTextColor="#5A6070"
            className="mt-3 min-h-[100px] rounded-xl border border-dark-border bg-dark-card px-4 py-3 text-[16px] text-text-primary"
          />
          <View className="mt-4 flex-row gap-3">
            <SecondaryButton label="Cancel" onPress={onClose} className="flex-1" />
            <PrimaryButton label="Submit" onPress={handleSubmit} className="flex-1" />
          </View>
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
