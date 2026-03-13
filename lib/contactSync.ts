type ContactSyncResult = {
  totalCount: number;
  matchedCount: number;
  inviteCount?: number;
  invitedCount?: number;
};

export function getInviteReadyCount(result: ContactSyncResult) {
  return result.inviteCount ?? result.invitedCount ?? Math.max(0, result.totalCount - result.matchedCount);
}

export function getContactSyncAlertCopy(result: ContactSyncResult) {
  if (result.totalCount === 0) {
    return {
      title: "No contacts to sync",
      message:
        "We couldn't find any phone numbers in your address book. Add a contact with a phone number and try again.",
    };
  }

  if (result.matchedCount > 0) {
    return {
      title: "Contacts synced",
      message: `We found ${result.matchedCount} people already on Plotlist.`,
    };
  }

  const inviteReadyCount = getInviteReadyCount(result);
  return {
    title: "Contacts synced",
    message:
      inviteReadyCount > 0
        ? "No current matches yet, but you can still invite people from your contacts."
        : "No current matches yet. Try again after more friends join Plotlist.",
  };
}
