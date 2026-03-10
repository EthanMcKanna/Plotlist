import { Pressable, Text, View } from "react-native";

import { Avatar } from "./Avatar";

type ContactInviteRowProps = {
  displayName: string;
  invitedAt?: number | null;
  onInvite: () => void;
  disabled?: boolean;
};

function formatInviteState(invitedAt?: number | null) {
  if (!invitedAt) {
    return "Invite by SMS";
  }
  return "Invite sent";
}

export function ContactInviteRow({
  displayName,
  invitedAt,
  onInvite,
  disabled = false,
}: ContactInviteRowProps) {
  const buttonDisabled = disabled || Boolean(invitedAt);

  return (
    <View className="flex-row items-center justify-between rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
      <View className="flex-1 flex-row items-center gap-3 pr-3">
        <Avatar label={displayName} size={44} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
            {displayName}
          </Text>
          <Text className="mt-1 text-xs text-text-tertiary" numberOfLines={1}>
            Not on Plotlist yet
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onInvite}
        disabled={buttonDisabled}
        className={`rounded-full px-4 py-2 ${
          buttonDisabled ? "border border-dark-border bg-dark-card" : "bg-brand-500"
        }`}
      >
        <Text
          className={`text-xs font-semibold ${
            buttonDisabled ? "text-text-secondary" : "text-white"
          }`}
        >
          {formatInviteState(invitedAt)}
        </Text>
      </Pressable>
    </View>
  );
}
