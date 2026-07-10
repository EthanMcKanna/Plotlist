// Pure ranking for people-search results. The SQL layer only answers "who
// matches this substring"; ordering is decided here so exact and prefix hits
// beat incidental substring matches, and closer social ties beat strangers.

type SearchablePerson = {
  user: {
    username?: string | null;
    displayName?: string | null;
    name?: string | null;
    lastSeenAt?: number | null;
    _creationTime?: number | null;
  };
  isFollowing?: boolean;
  followsYou?: boolean;
  mutualCount?: number;
  inContacts?: boolean;
  sharedShowCount?: number;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function getTextMatchScore(person: SearchablePerson, query: string) {
  const text = normalize(query);
  if (!text) {
    return 0;
  }
  const username = normalize(person.user.username);
  const names = [normalize(person.user.displayName), normalize(person.user.name)].filter(Boolean);

  if (username === text || names.includes(text)) {
    return 1000;
  }
  if (username.startsWith(text)) {
    return 600;
  }
  if (names.some((name) => name.startsWith(text))) {
    return 500;
  }
  // "lo" should still rank "Ada Lovelace" above someone whose bio-name merely
  // contains the letters mid-word.
  if (names.some((name) => name.split(/\s+/).some((word) => word.startsWith(text)))) {
    return 400;
  }
  if (username.includes(text) || names.some((name) => name.includes(text))) {
    return 100;
  }
  return 0;
}

export function getSocialProximityScore(person: SearchablePerson) {
  return (
    Number(Boolean(person.inContacts)) * 250 +
    Math.min(person.mutualCount ?? 0, 10) * 40 +
    Number(Boolean(person.followsYou)) * 120 +
    Number(Boolean(person.isFollowing)) * 60 +
    Math.min(person.sharedShowCount ?? 0, 10) * 10
  );
}

export function scorePersonSearchResult(person: SearchablePerson, query: string) {
  return getTextMatchScore(person, query) + getSocialProximityScore(person);
}

export function rankPeopleSearchResults<T extends SearchablePerson>(
  people: T[],
  query: string,
): T[] {
  return [...people].sort((left, right) => {
    const delta = scorePersonSearchResult(right, query) - scorePersonSearchResult(left, query);
    if (delta !== 0) {
      return delta;
    }
    const leftSeen = left.user.lastSeenAt ?? left.user._creationTime ?? 0;
    const rightSeen = right.user.lastSeenAt ?? right.user._creationTime ?? 0;
    return rightSeen - leftSeen;
  });
}
