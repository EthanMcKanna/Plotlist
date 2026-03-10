import type { Doc, Id } from "./_generated/dataModel";

export type PublicUser = {
  _id: Id<"users">;
  username?: string;
  displayName?: string;
  name?: string;
  bio?: string;
};

export function toPublicUser(
  user: Doc<"users"> | null | undefined,
): PublicUser | null {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    name: user.name,
    bio: user.bio,
  };
}
