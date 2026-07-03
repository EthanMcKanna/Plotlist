import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import { PrimaryButton } from "./PrimaryButton";
import { TextField } from "./TextField";
import { api } from "../lib/plotlist/api";
import { uploadAvatarImage } from "../lib/avatarUpload";
import { sanitizeUsername, validateUsername } from "../lib/username";
import { useMutation, useQuery } from "../lib/plotlist/react";

export function OnboardingProfileStep({
  onAdvance,
}: {
  onAdvance: () => Promise<void>;
}) {
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);
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

  const usernameError = useMemo(() => validateUsername(username), [username]);

  const handleContinue = async () => {
    if (usernameError) return;
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName || undefined,
        username: username || undefined,
      });
      await onAdvance();
    } catch (error) {
      const msg = String(error);
      if (msg.toLowerCase().includes("username already taken")) {
        Alert.alert("Username taken", "That username is already in use. Try another one.");
      } else {
        Alert.alert("Could not save", msg);
      }
    } finally {
      setSaving(false);
    }
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
      const storageId = await uploadAvatarImage({
        uri: asset.uri,
        mimeType: asset.mimeType,
        generateUploadUrl: () => generateUploadUrl({}),
      });
      await updateProfile({ avatarStorageId: storageId });
    } catch (error) {
      Alert.alert("Upload failed", String(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View className="gap-3 px-6 pt-4">
        <Text className="text-3xl font-bold tracking-tight text-text-primary">
          Set up your profile
        </Text>
        <Text className="text-sm text-text-tertiary">
          Add a display name and username so friends can find you.
        </Text>
      </View>

      <View className="px-6 pt-6">
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handlePickAvatar();
            }}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel="Choose a profile photo"
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: 72, height: 72, borderRadius: 36 }}
                contentFit="cover"
              />
            ) : (
              <View
                className="items-center justify-center rounded-full border border-dashed border-dark-border bg-dark-card"
                style={{ width: 72, height: 72 }}
              >
                <Text className="text-2xl font-semibold text-text-tertiary">
                  {(displayName || me?.displayName || me?.name || "?")[0]?.toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
          <View className="flex-1 gap-1">
            <Text className="text-sm font-semibold text-text-primary">Avatar</Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handlePickAvatar();
              }}
              disabled={uploading}
              className="self-start rounded-full border border-dark-border bg-dark-card px-4 py-2"
            >
              <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {uploading ? "Uploading..." : avatarUrl ? "Change photo" : "Choose photo"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="mt-6 gap-5">
          <TextField
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={me?.displayName ?? "Your name"}
            autoCapitalize="words"
            maxLength={40}
          />
          <TextField
            label="Username"
            value={username}
            onChangeText={(raw: string) => setUsername(sanitizeUsername(raw))}
            placeholder={me?.username ?? "username"}
            autoCapitalize="none"
            autoComplete="username"
            prefix="@"
            maxLength={20}
            error={username.length > 0 ? usernameError : undefined}
            hint={
              !usernameError && username.length > 0
                ? "Letters, numbers, and underscores only"
                : undefined
            }
          />
        </View>

        <View className="mt-8">
          <PrimaryButton
            label="Continue"
            onPress={handleContinue}
            loading={saving}
            disabled={Boolean(usernameError)}
          />
        </View>
      </View>
    </ScrollView>
  );
}
