import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRouter } from "expo-router";

import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { api } from "../../lib/plotlist/api";
import { OnboardingHeader } from "../../components/OnboardingHeader";
import { useMutation, useQuery } from "../../lib/plotlist/react";

export default function OnboardingProfile() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);
  const setOnboardingStep = useMutation(api.users.setOnboardingStep);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const avatarUrl = useQuery(
    api.storage.getUrl,
    me?.avatarStorageId ? { storageId: me.avatarStorageId } : "skip",
  );

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me && displayName === "") {
      setDisplayName(me.displayName ?? me.name ?? "");
    }
    if (me && username === "") {
      setUsername(me.username ?? "");
    }
  }, [displayName, me, username]);

  const handleContinue = async () => {
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName || undefined,
        username: username || undefined,
      });
      await setOnboardingStep({ step: "follow" });
      router.replace("/follow");
    } catch (error) {
      Alert.alert("Could not save", String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await setOnboardingStep({ step: "complete" });
    router.replace("/home");
  };

  const handlePickAvatar = async () => {
    try {
      setUploading(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const uploadUrl = await generateUploadUrl({});
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": asset.mimeType ?? "image/jpeg",
        },
        body: blob,
      });
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with ${uploadResponse.status}`);
      }
      const { storageId } = await uploadResponse.json();
      await updateProfile({ avatarStorageId: storageId });
    } catch (error) {
      Alert.alert("Upload failed", String(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen scroll>
      <OnboardingHeader
        step={1}
        totalSteps={3}
        title="Set up your profile"
        description="Add a display name and username so friends can find you."
        onSkip={handleSkip}
      />

      <View className="px-6 pt-6">
        <View className="items-start gap-3">
          <Text className="text-sm font-semibold text-text-primary">Avatar</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handlePickAvatar();
            }}
            disabled={uploading}
            className="rounded-full border border-dark-border bg-dark-card px-4 py-2"
          >
            <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {uploading ? "Uploading..." : "Choose photo"}
            </Text>
          </Pressable>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 72, height: 72, borderRadius: 36 }}
            />
          ) : null}
        </View>

        <View className="mt-6 gap-5">
          <TextField
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={me?.displayName ?? ""}
            autoCapitalize="words"
          />
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder={me?.username ?? ""}
            autoCapitalize="none"
          />
        </View>

        <View className="mt-8">
          <PrimaryButton
            label="Continue"
            onPress={handleContinue}
            loading={saving}
          />
        </View>
      </View>
    </Screen>
  );
}
