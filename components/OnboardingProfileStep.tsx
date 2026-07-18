import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "./PrimaryButton";
import { TextField } from "./TextField";
import { api } from "../lib/plotlist/api";
import { getUserFacingApiErrorMessage } from "../lib/api/client";
import { uploadAvatarImage } from "../lib/avatarUpload";
import { notifyError } from "../lib/dialogs";
import { sanitizeUsername, validateUsername } from "../lib/username";
import { useMutation, useQuery } from "../lib/plotlist/react";

export function OnboardingProfileStep({
  onComplete,
  onSkip,
}: {
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
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
  const [skipping, setSkipping] = useState(false);
  // Web shows server-side username rejections inline under the field
  // (Alert.alert is a no-op there); native keeps its alert.
  const [serverUsernameError, setServerUsernameError] = useState<string | null>(null);

  useEffect(() => {
    if (me && displayName === "") {
      setDisplayName(me.displayName ?? me.name ?? "");
    }
    if (me && username === "") {
      setUsername(me.username ?? "");
    }
  }, [displayName, me, username]);

  const usernameError = useMemo(() => validateUsername(username), [username]);

  const handleFinish = async () => {
    if (usernameError || saving) return;
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName || undefined,
        username: username || undefined,
      });
      await onComplete();
    } catch (error) {
      const msg = String(error);
      if (msg.toLowerCase().includes("username already taken")) {
        if (Platform.OS === "web") {
          setServerUsernameError("That username is already in use. Try another one.");
        } else {
          Alert.alert("Username taken", "That username is already in use. Try another one.");
        }
      } else {
        notifyError("Could not save", getUserFacingApiErrorMessage(error) ?? msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      await onSkip();
    } catch (error) {
      notifyError("Could not skip", String(error));
    } finally {
      setSkipping(false);
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
      notifyError("Upload failed", String(error));
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
      <View className="flex-row justify-end px-6 pt-2">
        <Pressable
          onPress={handleSkip}
          disabled={skipping}
          accessibilityRole="button"
          accessibilityLabel="Skip profile setup for now"
          hitSlop={12}
          className="rounded-full px-3 py-1.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-text-tertiary">
            {skipping ? "Skipping..." : "Skip for now"}
          </Text>
        </Pressable>
      </View>

      <View className="gap-3 px-6 pt-2">
        <Text className="text-3xl font-bold tracking-tight text-text-primary">
          Set up your profile
        </Text>
        <Text className="text-sm text-text-tertiary">
          Add a display name and username so friends can find you. You can change
          everything later in Settings.
        </Text>
      </View>

      {/* Avatar */}
      <View className="items-center gap-1.5 pt-8">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handlePickAvatar();
          }}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Choose a profile photo"
          className="relative"
        >
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 96, height: 96, borderRadius: 48 }}
              contentFit="cover"
            />
          ) : (
            <View
              className="items-center justify-center rounded-full bg-dark-elevated"
              style={{ width: 96, height: 96 }}
            >
              <Text className="text-2xl font-semibold text-text-secondary">
                {(displayName || me?.displayName || me?.name || "?")[0]?.toUpperCase()}
              </Text>
            </View>
          )}
          <View
            className="absolute items-center justify-center rounded-full border-2 border-dark-bg bg-brand-500"
            style={{ width: 30, height: 30, bottom: 0, right: 0 }}
          >
            {uploading ? (
              <ActivityIndicator size={12} color="#fff" />
            ) : (
              <Ionicons name="camera" size={15} color="#fff" />
            )}
          </View>
        </Pressable>
        <Text className="text-xs text-text-tertiary">
          {uploading ? "Uploading..." : "Tap to add a photo"}
        </Text>
      </View>

      <View className="px-6 pt-8">
        <View className="gap-5">
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
            onChangeText={(raw: string) => {
              setUsername(sanitizeUsername(raw));
              if (serverUsernameError) setServerUsernameError(null);
            }}
            placeholder={me?.username ?? "username"}
            autoCapitalize="none"
            autoComplete="username"
            prefix="@"
            maxLength={20}
            error={
              (username.length > 0 ? usernameError : undefined) ??
              serverUsernameError ??
              undefined
            }
            hint={
              !usernameError && username.length > 0
                ? "Letters, numbers, and underscores only"
                : undefined
            }
          />
        </View>

        <View className="mt-8">
          <PrimaryButton
            label="Get started"
            onPress={handleFinish}
            loading={saving}
            disabled={Boolean(usernameError)}
          />
        </View>
      </View>
    </ScrollView>
  );
}
