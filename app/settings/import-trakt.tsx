import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import { getUserFacingApiErrorMessage } from "../../lib/api/client";
import { confirmAction, notifyError } from "../../lib/dialogs";
import { callAction, callMutation, callQuery } from "../../lib/plotlist/rpc";
import { SHOW_BACK_BUTTON } from "../../lib/webLayout";

// The whole flow talks to the resumable server-side import engine: this
// screen connects a Trakt account (device-code auth), starts a job, then
// "pumps" it with tick actions while open. Closing the screen never loses an
// import — the minute cron keeps advancing it server-side.

type DeviceAuth = {
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
  intervalSeconds: number;
};

type JobView = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  phase: string;
  options: { history: boolean; ratings: boolean; watchlist: boolean };
  counts: Record<string, number>;
  unmatched: Array<{ title: string; year: number | null; reason: string }>;
  error: string | null;
  progressPercent: number | null;
  createdAt: number;
  completedAt: number | null;
};

type StatusView = {
  configured: boolean;
  account: {
    username: string | null;
    connectedAt: number;
    lastImportedAt: number | null;
  } | null;
  activeImport: JobView | null;
  lastImport: JobView | null;
};

const PHASE_LABELS: Record<string, string> = {
  fetch: "Fetching your Trakt data",
  match: "Matching shows",
  progress: "Importing watched episodes",
  diary: "Importing your diary",
  ratings: "Importing ratings",
  watchlist: "Importing your watchlist",
  finalize: "Wrapping up",
};

const UNMATCHED_REASON_LABELS: Record<string, string> = {
  no_ids: "No usable ids on Trakt",
  no_tmdb_match: "No TMDB match found",
  not_on_tmdb: "Not available on TMDB",
  lookup_failed: "Lookup failed — try importing again",
};

function formatCount(value: number | undefined) {
  return (value ?? 0).toLocaleString();
}

function openExternal(url: string) {
  if (Platform.OS === "web") {
    globalThis.window?.open(url, "_blank", "noopener");
    return;
  }
  void Linking.openURL(url).catch(() => {});
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-text-tertiary">
      {title}
    </Text>
  );
}

function OptionToggleRow({
  label,
  description,
  value,
  onChange,
  disabled = false,
  isLast = false,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
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
        <Text className="mt-0.5 text-xs leading-4 text-text-tertiary">{description}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
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

function SummaryRow({ label, value, isLast = false }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 ${
        isLast ? "" : "border-b border-dark-border"
      }`}
    >
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text className="text-sm font-semibold text-text-primary">{value}</Text>
    </View>
  );
}

function ProgressBar({ percent }: { percent: number | null }) {
  return (
    <View className="h-2 overflow-hidden rounded-full bg-dark-elevated">
      {percent === null ? (
        <View className="h-2 w-1/4 rounded-full bg-brand-500 opacity-70" />
      ) : (
        <View
          className="h-2 rounded-full bg-brand-500"
          style={{ width: `${Math.max(3, percent)}%` }}
        />
      )}
    </View>
  );
}

export default function ImportTraktScreen() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuth | null>(null);
  const [authState, setAuthState] = useState<"idle" | "starting" | "waiting" | "denied" | "expired">(
    "idle",
  );
  const [starting, setStarting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [options, setOptions] = useState({ history: true, ratings: true, watchlist: true });

  // Generation counter: bumping it invalidates any in-flight auth-poll or
  // import-pump loop (they check before applying results or continuing).
  const loopGeneration = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loopGeneration.current += 1;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const next = (await callQuery(api.traktImport.getStatus, {})) as StatusView;
      if (mounted.current) {
        setStatus(next);
        setLoadError(false);
      }
      return next;
    } catch {
      if (mounted.current) {
        setLoadError(true);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // ── Import pump: while a job is active, keep asking the server to advance
  // it one slice. Each tick both works and reports, so no separate poll.
  const activeImportId = status?.activeImport?.id ?? null;
  useEffect(() => {
    if (!activeImportId) {
      return;
    }
    const generation = ++loopGeneration.current;
    let stopped = false;
    const pump = async () => {
      while (!stopped && loopGeneration.current === generation) {
        try {
          const next = (await callAction(api.traktImport.tick, {})) as StatusView;
          if (loopGeneration.current !== generation || !mounted.current) {
            return;
          }
          setStatus(next);
          if (!next.activeImport) {
            return;
          }
        } catch {
          // Transient pump failure: the cron still advances the job.
        }
        await new Promise((resolve) => setTimeout(resolve, 1_200));
      }
    };
    void pump();
    return () => {
      stopped = true;
    };
  }, [activeImportId]);

  // ── Device auth ──
  const handleConnect = async () => {
    if (authState === "starting" || authState === "waiting") {
      return;
    }
    setAuthState("starting");
    try {
      const auth = (await callAction(api.traktImport.startDeviceAuth, {})) as DeviceAuth;
      if (!mounted.current) return;
      setDeviceAuth(auth);
      setAuthState("waiting");

      const generation = ++loopGeneration.current;
      const poll = async () => {
        while (loopGeneration.current === generation && Date.now() < auth.expiresAt) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(2_000, auth.intervalSeconds * 1_000)),
          );
          if (loopGeneration.current !== generation) return;
          try {
            const result = (await callAction(api.traktImport.pollDeviceAuth, {})) as {
              state: string;
              username?: string | null;
            };
            if (loopGeneration.current !== generation || !mounted.current) return;
            if (result.state === "connected") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setAuthState("idle");
              setDeviceAuth(null);
              await refreshStatus();
              return;
            }
            if (result.state === "denied") {
              setAuthState("denied");
              setDeviceAuth(null);
              return;
            }
            if (result.state === "expired" || result.state === "none") {
              setAuthState("expired");
              setDeviceAuth(null);
              return;
            }
          } catch {
            // Poll hiccup — keep trying until the code expires.
          }
        }
        if (loopGeneration.current === generation && mounted.current) {
          setAuthState("expired");
          setDeviceAuth(null);
        }
      };
      void poll();
    } catch (error) {
      if (mounted.current) {
        setAuthState("idle");
        notifyError(
          "Could not reach Trakt",
          getUserFacingApiErrorMessage(error) ?? "Try again in a moment.",
        );
      }
    }
  };

  const handleCancelConnect = () => {
    loopGeneration.current += 1;
    setAuthState("idle");
    setDeviceAuth(null);
  };

  const handleDisconnect = () => {
    confirmAction({
      title: "Disconnect Trakt",
      message:
        "This removes the connection and stops any import in progress. Everything already imported stays in Plotlist.",
      confirmLabel: "Disconnect",
      destructive: true,
      onConfirm: async () => {
        setDisconnecting(true);
        try {
          loopGeneration.current += 1;
          await callAction(api.traktImport.disconnect, {});
          await refreshStatus();
        } catch (error) {
          notifyError("Could not disconnect", getUserFacingApiErrorMessage(error) ?? String(error));
        } finally {
          if (mounted.current) {
            setDisconnecting(false);
          }
        }
      },
    });
  };

  const handleStartImport = async () => {
    if (starting) return;
    if (!options.history && !options.ratings && !options.watchlist) {
      notifyError("Nothing selected", "Pick at least one thing to import.");
      return;
    }
    setStarting(true);
    setShowUnmatched(false);
    try {
      const next = (await callAction(api.traktImport.start, options)) as StatusView;
      if (mounted.current) {
        setStatus(next);
      }
    } catch (error) {
      notifyError("Could not start import", getUserFacingApiErrorMessage(error) ?? String(error));
    } finally {
      if (mounted.current) {
        setStarting(false);
      }
    }
  };

  const handleCancelImport = () => {
    confirmAction({
      title: "Stop import",
      message: "Everything imported so far stays. You can run the import again anytime.",
      confirmLabel: "Stop import",
      destructive: true,
      onConfirm: async () => {
        loopGeneration.current += 1;
        await callMutation(api.traktImport.cancel, {}).catch(() => {
          // Refresh below shows the true state either way.
        });
        await refreshStatus();
      },
    });
  };

  // ── Render ──
  const account = status?.account ?? null;
  const activeImport = status?.activeImport ?? null;
  const lastImport = status?.lastImport ?? null;

  return (
    <Screen scroll>
      <View className="px-6 pt-2 pb-10">
        <View className="flex-row items-center gap-3">
          {SHOW_BACK_BUTTON ? (
            <GlassPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              radius={20}
              variant="control"
              contentStyle={{
                alignItems: "center",
                height: 40,
                justifyContent: "center",
                width: 40,
              }}
            >
              <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
            </GlassPressable>
          ) : null}
          <View className="flex-1">
            <Text className="text-2xl font-black text-text-primary">Import from Trakt</Text>
            <Text className="mt-0.5 text-xs text-text-tertiary">
              Bring your watched history, diary, ratings, and watchlist into Plotlist.
            </Text>
          </View>
        </View>

        {!status && !loadError ? (
          <View className="mt-16 items-center">
            <ActivityIndicator color="#5A6070" />
          </View>
        ) : null}

        {loadError && !status ? (
          <View className="mt-10">
            <Text className="text-center text-sm text-text-secondary">
              Couldn't load your import status.
            </Text>
            <PrimaryButton label="Try again" onPress={() => void refreshStatus()} className="mt-4" />
          </View>
        ) : null}

        {status && !status.configured ? (
          <View className="mt-10">
            <GlassSurface radius={8} variant="surface">
              <View className="px-4 py-4">
                <Text className="text-sm leading-5 text-text-secondary">
                  Trakt import isn't available right now. Check back soon.
                </Text>
              </View>
            </GlassSurface>
          </View>
        ) : null}

        {/* ── Connect step ── */}
        {status?.configured && !account ? (
          <View className="mt-8">
            <SectionHeader title="Step 1 · Connect" />
            <GlassSurface radius={8} variant="surface">
              <View className="px-4 py-4">
                {deviceAuth && authState === "waiting" ? (
                  <>
                    <Text className="text-sm leading-5 text-text-secondary">
                      Enter this code at{" "}
                      <Text className="font-semibold text-text-primary">trakt.tv/activate</Text> to
                      approve Plotlist:
                    </Text>
                    <View className="mt-4 items-center rounded-2xl bg-dark-elevated py-4">
                      <Text
                        className="text-3xl font-bold tracking-[6px] text-text-primary"
                        selectable
                      >
                        {deviceAuth.userCode}
                      </Text>
                    </View>
                    <PrimaryButton
                      label="Open trakt.tv/activate"
                      onPress={() =>
                        openExternal(
                          `${deviceAuth.verificationUrl.replace(/\/$/, "")}/${deviceAuth.userCode}`,
                        )
                      }
                      className="mt-4"
                    />
                    <View className="mt-3 flex-row items-center justify-center gap-2">
                      <ActivityIndicator size="small" color="#5A6070" />
                      <Text className="text-xs text-text-tertiary">
                        Waiting for approval…
                      </Text>
                    </View>
                    <Pressable onPress={handleCancelConnect} className="mt-3 items-center py-1">
                      <Text className="text-sm text-text-tertiary">Cancel</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text className="text-sm leading-5 text-text-secondary">
                      Connect your Trakt account to import. You'll approve Plotlist on trakt.tv with
                      a one-time code — no password is shared, and Plotlist only reads your data.
                    </Text>
                    {authState === "denied" ? (
                      <Text className="mt-3 text-xs text-status-danger">
                        The request was denied on Trakt. You can try again.
                      </Text>
                    ) : null}
                    {authState === "expired" ? (
                      <Text className="mt-3 text-xs text-status-danger">
                        That code expired. Start again to get a new one.
                      </Text>
                    ) : null}
                    <PrimaryButton
                      label={authState === "starting" ? "Contacting Trakt…" : "Connect Trakt"}
                      onPress={handleConnect}
                      loading={authState === "starting"}
                      disabled={authState === "starting"}
                      className="mt-4"
                    />
                  </>
                )}
              </View>
            </GlassSurface>
            <Text className="mt-2 text-xs leading-4 text-text-tertiary">
              Plotlist is TV-only, so movies on your Trakt account are left out.
            </Text>
          </View>
        ) : null}

        {/* ── Connected account ── */}
        {account ? (
          <View className="mt-8">
            <SectionHeader title="Connected account" />
            <GlassSurface radius={8} variant="surface">
              <View className="flex-row items-center gap-3 px-4 py-3.5">
                <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                <View className="flex-1">
                  <Text className="text-base font-medium text-text-primary">
                    {account.username ? `@${account.username}` : "Trakt account"}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-tertiary">
                    {account.lastImportedAt
                      ? `Last import ${new Date(account.lastImportedAt).toLocaleDateString()}`
                      : "Connected — nothing imported yet"}
                  </Text>
                </View>
                <Pressable
                  onPress={handleDisconnect}
                  disabled={disconnecting}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect Trakt"
                >
                  {disconnecting ? (
                    <ActivityIndicator size="small" color="#5A6070" />
                  ) : (
                    <Text className="text-sm font-medium text-status-danger">Disconnect</Text>
                  )}
                </Pressable>
              </View>
            </GlassSurface>
          </View>
        ) : null}

        {/* ── Active import ── */}
        {activeImport ? (
          <View className="mt-8">
            <SectionHeader title="Importing" />
            <GlassSurface radius={8} variant="surface">
              <View className="px-4 py-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-text-primary">
                    {PHASE_LABELS[activeImport.phase] ?? "Importing"}
                  </Text>
                  <Text className="text-sm font-semibold text-brand-400">
                    {activeImport.progressPercent !== null
                      ? `${activeImport.progressPercent}%`
                      : ""}
                  </Text>
                </View>
                <View className="mt-3">
                  <ProgressBar percent={activeImport.progressPercent} />
                </View>
                <Text className="mt-3 text-xs leading-4 text-text-tertiary">
                  {activeImport.phase === "fetch"
                    ? `Pulled ${formatCount(activeImport.counts.historyPagesFetched)} pages of history so far.`
                    : `${formatCount(activeImport.counts.showsMatched)} shows matched · ${formatCount(
                        activeImport.counts.episodesImported,
                      )} episodes · ${formatCount(activeImport.counts.logsImported)} diary entries · ${formatCount(
                        activeImport.counts.ratingsImported,
                      )} ratings`}
                </Text>
                <Text className="mt-2 text-xs leading-4 text-text-tertiary">
                  You can leave this screen — the import keeps running on our servers.
                </Text>
                <Pressable onPress={handleCancelImport} className="mt-3 items-center py-1">
                  <Text className="text-sm text-status-danger">Stop import</Text>
                </Pressable>
              </View>
            </GlassSurface>
          </View>
        ) : null}

        {/* ── Options + start ── */}
        {account && !activeImport ? (
          <View className="mt-8">
            <SectionHeader title={lastImport ? "Import again" : "Step 2 · Import"} />
            <GlassSurface radius={8} variant="surface">
              <OptionToggleRow
                label="Watch history"
                description="Watched episodes, your full viewing diary with original dates, and rewatches."
                value={options.history}
                onChange={(value) => setOptions((current) => ({ ...current, history: value }))}
              />
              <OptionToggleRow
                label="Ratings"
                description="Show and episode ratings, converted to stars. Ratings you've already set here win."
                value={options.ratings}
                onChange={(value) => setOptions((current) => ({ ...current, ratings: value }))}
              />
              <OptionToggleRow
                label="Watchlist"
                description="Shows on your Trakt watchlist that you're not already tracking."
                value={options.watchlist}
                onChange={(value) => setOptions((current) => ({ ...current, watchlist: value }))}
                isLast
              />
            </GlassSurface>
            <PrimaryButton
              label={starting ? "Starting…" : "Start import"}
              onPress={handleStartImport}
              loading={starting}
              disabled={starting}
              className="mt-4"
            />
            <Text className="mt-2 text-xs leading-4 text-text-tertiary">
              Imports are safe to run more than once — nothing gets duplicated, and anything you've
              logged in Plotlist is never overwritten.
            </Text>
          </View>
        ) : null}

        {/* ── Last import summary ── */}
        {lastImport && !activeImport ? (
          <View className="mt-8">
            <SectionHeader
              title={
                lastImport.status === "completed"
                  ? "Last import"
                  : lastImport.status === "failed"
                    ? "Last import failed"
                    : "Last import stopped"
              }
            />
            <GlassSurface radius={8} variant="surface">
              {lastImport.status === "failed" ? (
                <View className="border-b border-dark-border px-4 py-3">
                  <Text className="text-sm leading-5 text-status-danger">
                    {lastImport.error === "trakt_reconnect_required"
                      ? "Trakt signed Plotlist out. Reconnect and run the import again."
                      : "The import hit a problem partway through. Running it again picks up safely where things left off."}
                  </Text>
                </View>
              ) : null}
              <SummaryRow
                label="Shows matched"
                value={formatCount(lastImport.counts.showsMatched)}
              />
              {lastImport.options.history ? (
                <>
                  <SummaryRow
                    label="Episodes marked watched"
                    value={formatCount(lastImport.counts.episodesImported)}
                  />
                  <SummaryRow
                    label="Diary entries added"
                    value={formatCount(lastImport.counts.logsImported)}
                  />
                </>
              ) : null}
              {lastImport.options.ratings ? (
                <SummaryRow
                  label="Ratings imported"
                  value={formatCount(lastImport.counts.ratingsImported)}
                />
              ) : null}
              {lastImport.options.watchlist ? (
                <SummaryRow
                  label="Watchlist shows added"
                  value={formatCount(lastImport.counts.watchlistAdded)}
                />
              ) : null}
              <SummaryRow
                label="Couldn't match"
                value={formatCount(lastImport.counts.showsUnmatched)}
                isLast
              />
            </GlassSurface>
            {(lastImport.counts.historyTruncated ?? 0) > 0 ? (
              <Text className="mt-2 text-xs leading-4 text-text-tertiary">
                Your Trakt history is enormous — the import covered your most recent 50,000
                plays.
              </Text>
            ) : null}
            {lastImport.unmatched.length > 0 ? (
              <View className="mt-3">
                <Pressable
                  onPress={() => setShowUnmatched((current) => !current)}
                  className="flex-row items-center gap-1.5"
                >
                  <Text className="text-sm font-medium text-brand-400">
                    {showUnmatched ? "Hide" : "Show"} unmatched shows (
                    {lastImport.unmatched.length})
                  </Text>
                  <Ionicons
                    name={showUnmatched ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#38bdf8"
                  />
                </Pressable>
                {showUnmatched ? (
                  <GlassSurface radius={8} variant="surface" style={{ marginTop: 8 }}>
                    {lastImport.unmatched.map((item, index) => (
                      <View
                        key={`${item.title}-${index}`}
                        className={`px-4 py-2.5 ${
                          index === lastImport.unmatched.length - 1
                            ? ""
                            : "border-b border-dark-border"
                        }`}
                      >
                        <Text className="text-sm text-text-primary">
                          {item.title}
                          {item.year ? ` (${item.year})` : ""}
                        </Text>
                        <Text className="mt-0.5 text-xs text-text-tertiary">
                          {UNMATCHED_REASON_LABELS[item.reason] ?? item.reason}
                        </Text>
                      </View>
                    ))}
                  </GlassSurface>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
