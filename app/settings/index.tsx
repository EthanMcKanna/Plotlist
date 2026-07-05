import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Share, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";

import { AvatarCropModal } from "../../components/AvatarCropModal";
import { ContactsSyncCard } from "../../components/ContactsSyncCard";
import { GlassSurface } from "../../components/NativeGlass";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { api } from "../../lib/plotlist/api";
import { clearAuthTokens, getStoredSignInPhone } from "../../lib/authStorage";
import { uploadAvatarImage } from "../../lib/avatarUpload";
import { getContactSyncAlertCopy } from "../../lib/contactSync";
import { loadDeviceContacts } from "../../lib/deviceContacts";
import { useAuthActions } from "../../lib/plotlist/auth";
import { callQuery } from "../../lib/plotlist/rpc";
import { useAction, useMutation, useQuery } from "../../lib/plotlist/react";
import { setContactsSyncDismissed } from "../../lib/preferences";
import { showFeedbackForm } from "../../lib/sentry";
import { sanitizeUsername, validateUsername } from "../../lib/username";

function formatPhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return raw;
}

function SettingsRow({
  icon,
  iconColor = "#9BA1B0",
  label,
  onPress,
  destructive = false,
  loading = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      disabled={loading}
      className="flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:bg-dark-hover"
    >
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? "#EF4444" : iconColor}
      />
      <Text
        className={`flex-1 text-base ${
          destructive
            ? "font-medium text-status-danger"
            : "font-medium text-text-primary"
        }`}
      >
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color="#5A6070" />
      ) : (
        <Ionicons name="chevron-forward" size={16} color="#5A6070" />
      )}
    </Pressable>
  );
}

function NotificationToggleRow({
  label,
  description,
  value,
  onChange,
  isLast = false,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3.5 ${
        isLast ? "" : "border-b border-dark-border"
      }`}
    >
      <View className="flex-1">
        <Text className="text-base font-medium text-text-primary">{label}</Text>
        <Text className="mt-0.5 text-xs text-text-tertiary">{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChange(next);
        }}
        trackColor={{ true: "#0EA5E9", false: "#2A2F3A" }}
        thumbColor="#F1F3F7"
      />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-text-tertiary">
      {title}
    </Text>
  );
}

async function downloadExportOnWeb(filename: string, payload: string) {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SettingsScreen() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const me = useQuery(api.users.me);
  const hasProfile = Boolean(me?._id);
  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const clearSync = useMutation(api.contacts.clearSync);
  const syncContacts = useAction(api.contacts.syncSnapshot);
  const contactStatus = useQuery(api.contacts.getStatus, hasProfile ? {} : "skip");
  const notificationPrefs = useQuery(
    api.notifications.getPreferences,
    hasProfile ? {} : "skip",
  ) as Record<string, boolean> | undefined;
  const updateNotificationPrefs = useMutation(api.notifications.updatePreferences);
  const [notificationOverrides, setNotificationOverrides] = useState<Record<string, boolean>>({});
  const resolvedNotificationPrefs = {
    episodes: true,
    follows: true,
    likes: true,
    comments: true,
    ...(notificationPrefs ?? {}),
    ...notificationOverrides,
  };
  const toggleNotificationPref = (key: string) => (value: boolean) => {
    setNotificationOverrides((current) => ({ ...current, [key]: value }));
    void updateNotificationPrefs({ preferences: { [key]: value } }).catch(() => {
      setNotificationOverrides((current) => ({ ...current, [key]: !value }));
    });
  };
  const avatarUrl = useQuery(
    api.storage.getUrl,
    me?.avatarStorageId ? { storageId: me.avatarStorageId } : "skip",
  );

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [cropImage, setCropImage] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [signInPhoneLabel, setSignInPhoneLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getStoredSignInPhone().then((phone) => {
      if (!cancelled) {
        setSignInPhoneLabel(formatPhone(phone));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (me && displayName === "") {
      setDisplayName(me.displayName ?? me.name ?? "");
    }
    if (me && bio === "") {
      setBio(me.bio ?? "");
    }
    if (me && username === "") {
      setUsername(me.username ?? "");
    }
  }, [bio, displayName, me, username]);

  const handleUsernameChange = useCallback((raw: string) => {
    setUsername(sanitizeUsername(raw));
  }, []);

  const usernameError = useMemo(() => validateUsername(username), [username]);

  const isDirty = useMemo(() => {
    if (!me) return false;
    const origName = me.displayName ?? me.name ?? "";
    const origBio = me.bio ?? "";
    const origUsername = me.username ?? "";
    return displayName !== origName || bio !== origBio || username !== origUsername;
  }, [me, displayName, bio, username]);

  const canSave = isDirty && !usernameError && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName || undefined,
        bio: bio || undefined,
        username: username || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  const handleExport = async () => {
    try {
      const data = await callQuery(api.users.exportData, {});
      const payload = JSON.stringify(data, null, 2);
      const filename = `plotlist-export-${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === "web") {
        await downloadExportOnWeb(filename, payload);
        return;
      }

      const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!directory) {
        throw new Error("File system unavailable");
      }

      const fileUri = `${directory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, payload, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: "Export Plotlist data",
          mimeType: "application/json",
          UTI: "public.json",
        });
        return;
      }

      await Share.share({
        title: "Plotlist export",
        url: fileUri,
        message: "Plotlist export",
      });
    } catch (error) {
      Alert.alert("Export failed", String(error));
    }
  };

  const handleSignOut = () => {
    void signOut()
      .catch(() => {})
      .finally(async () => {
        await clearAuthTokens();
        router.replace("/sign-in");
      });
  };

  const handleDelete = async () => {
    Alert.alert(
      "Delete account",
      "This will permanently delete your account and all data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount({});
              await signOut();
              await clearAuthTokens();
              router.replace("/sign-in");
            } catch (error) {
              Alert.alert("Delete failed", String(error));
            }
          },
        },
      ],
    );
  };

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      setCropImage({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
    } catch (error) {
      Alert.alert("Could not open photo library", String(error));
    }
  };

  const handleCroppedAvatar = async (croppedUri: string) => {
    setCropImage(null);
    try {
      setUploading(true);
      const storageId = await uploadAvatarImage({
        uri: croppedUri,
        mimeType: "image/jpeg",
        generateUploadUrl: () => generateUploadUrl({}),
      });
      await updateProfile({ avatarStorageId: storageId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Upload failed", String(error));
    } finally {
      setUploading(false);
    }
  };

  const handleSyncContacts = async () => {
    try {
      setSyncingContacts(true);
      const entries = await loadDeviceContacts();
      const result = await syncContacts({ entries });
      await setContactsSyncDismissed(false);
      const copy = getContactSyncAlertCopy(result);
      Alert.alert(copy.title, copy.message);
    } catch (error) {
      Alert.alert("Sync failed", String(error));
    } finally {
      setSyncingContacts(false);
    }
  };

  const handleClearContacts = async () => {
    Alert.alert(
      "Clear synced contacts",
      "This removes your contact match snapshot from Plotlist. You can sync again anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearSync({});
              await setContactsSyncDismissed(false);
            } catch (error) {
              Alert.alert("Could not clear contacts", String(error));
            }
          },
        },
      ],
    );
  };

  return (
    <Screen scroll>
      <View className="px-6 pt-6 pb-8">
        <AvatarCropModal
          visible={cropImage !== null}
          imageUri={cropImage?.uri ?? null}
          imageWidth={cropImage?.width ?? 0}
          imageHeight={cropImage?.height ?? 0}
          onCrop={handleCroppedAvatar}
          onCancel={() => setCropImage(null)}
        />

        {/* ── Profile header ── */}
        <View className="items-center gap-1.5">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handlePickAvatar();
            }}
            disabled={uploading}
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
                  {(me?.displayName ?? me?.name ?? "?")[0]?.toUpperCase()}
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
            {uploading ? "Uploading..." : "Tap to change photo"}
          </Text>
        </View>

        {/* ── Profile fields ── */}
        <View className="mt-8">
          <SectionHeader title="Profile" />
          <View className="mt-1 gap-5">
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
              onChangeText={handleUsernameChange}
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
            <TextField
              label="Bio"
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself..."
              autoCapitalize="sentences"
              multiline
              maxLength={160}
              hint={bio.length > 0 ? `${bio.length}/160` : undefined}
            />
          </View>

          {/* Save */}
          <PrimaryButton
            label={saving ? "Saving..." : isDirty ? "Save changes" : "No changes"}
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
            className="mt-6"
          />
        </View>

        <View className="mt-10">
          <SectionHeader title="Privacy" />
          <GlassSurface radius={8} variant="surface" style={{ marginTop: 8 }}>
            <SettingsRow
              icon={me?.isPrivate ? "lock-closed-outline" : "shield-outline"}
              iconColor="#38bdf8"
              label="Privacy & blocked accounts"
              onPress={() => router.push("/settings/privacy")}
            />
          </GlassSurface>
          <Text className="mt-2 text-xs leading-4 text-text-tertiary">
            {me?.isPrivate
              ? "Your account is private — new followers need your approval."
              : "Private account, per-section profile visibility, and blocked accounts."}
          </Text>
        </View>

        {/* ── Streaming ── */}
        <View className="mt-10">
          <SectionHeader title="Streaming" />
          <GlassSurface radius={8} variant="surface" style={{ marginTop: 8 }}>
            <SettingsRow
              icon="tv-outline"
              iconColor="#38bdf8"
              label="My streaming services"
              onPress={() => router.push("/settings/streaming")}
            />
          </GlassSurface>
          <Text className="mt-2 text-xs leading-4 text-text-tertiary">
            Home and search filter streaming rooms and lean picks toward services you have.
          </Text>
        </View>

        {/* ── Notifications ── */}
        <View className="mt-10">
          <SectionHeader title="Notifications" />
          <GlassSurface radius={8} variant="surface" style={{ marginTop: 8 }}>
            <NotificationToggleRow
              label="New episodes"
              description="A heads-up the evening a show you're watching drops an episode."
              value={resolvedNotificationPrefs.episodes}
              onChange={toggleNotificationPref("episodes")}
            />
            <NotificationToggleRow
              label="New followers"
              description="When someone starts following you."
              value={resolvedNotificationPrefs.follows}
              onChange={toggleNotificationPref("follows")}
            />
            <NotificationToggleRow
              label="Likes"
              description="When someone likes your review, log, or list."
              value={resolvedNotificationPrefs.likes}
              onChange={toggleNotificationPref("likes")}
            />
            <NotificationToggleRow
              label="Comments"
              description="When someone comments on your review, log, or list."
              value={resolvedNotificationPrefs.comments}
              onChange={toggleNotificationPref("comments")}
              isLast
            />
          </GlassSurface>
          <Text className="mt-2 text-xs leading-4 text-text-tertiary">
            Applies to push notifications on this account. Everything still appears in your
            in-app inbox.
          </Text>
        </View>

        {/* ── Contacts ── */}
        <View className="mt-10">
          <SectionHeader title="Contacts" />
          <View className="mt-2">
            <ContactsSyncCard
              title={contactStatus?.hasSynced ? "Contacts are connected" : "Connect your contacts"}
              description="Resync your address book to refresh matches and invite candidates. Raw phone numbers are never stored."
              buttonLabel={contactStatus?.hasSynced ? "Resync contacts" : "Sync contacts"}
              onPress={handleSyncContacts}
              loading={syncingContacts}
              secondaryLabel={contactStatus?.hasSynced ? "Clear synced contacts" : undefined}
              onSecondaryPress={contactStatus?.hasSynced ? handleClearContacts : undefined}
              meta={
                contactStatus?.hasSynced
                  ? `${contactStatus.matchedCount} matches · ${contactStatus.invitedCount} invites sent`
                  : null
              }
            />
          </View>
        </View>

        {/* ── Help ── */}
        <View className="mt-10">
          <SectionHeader title="Help" />
          <GlassSurface radius={8} variant="surface" style={{ marginTop: 8 }}>
            <SettingsRow
              icon="sparkles-outline"
              iconColor="#0ea5e9"
              label="Replay the welcome tour"
              onPress={() => router.push("/onboarding/welcome")}
            />
            <SettingsRow
              icon="chatbubble-ellipses-outline"
              iconColor="#0ea5e9"
              label="Share feedback"
              onPress={() => showFeedbackForm()}
            />
          </GlassSurface>
        </View>

        {/* ── Account ── */}
        <View className="mt-10">
          <SectionHeader title="Account" />
          <GlassSurface radius={8} variant="surface" style={{ marginTop: 8 }}>
            {me?.isAdmin ? (
              <>
                <SettingsRow
                  icon="shield-checkmark-outline"
                  iconColor="#0ea5e9"
                  label="Admin reports"
                  onPress={() => router.push("/admin/reports")}
                />
                <View className="mx-4 h-px bg-dark-border" />
              </>
            ) : null}
            <SettingsRow
              icon="download-outline"
              label="Export my data"
              onPress={handleExport}
            />
            <View className="mx-4 h-px bg-dark-border" />
            <SettingsRow
              icon="log-out-outline"
              label="Sign out"
              onPress={handleSignOut}
            />
          </GlassSurface>
        </View>

        {/* ── Danger zone ── */}
        <View className="mt-10">
          <GlassSurface radius={8} variant="surface">
            <SettingsRow
              icon="trash-outline"
              label="Delete my account"
              onPress={handleDelete}
              destructive
            />
          </GlassSurface>
        </View>

        {/* Footer */}
        <Text className="mt-8 text-center text-xs text-text-tertiary">
          {signInPhoneLabel
            ? `Signed in as ${signInPhoneLabel}`
            : `Signed in as @${me?.username ?? "you"} with phone verification`}
        </Text>
      </View>
    </Screen>
  );
}
