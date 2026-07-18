import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { notifyError } from "../lib/dialogs";
import { useIsDesktopWeb, useWebSheetStyle } from "../lib/webLayout";

import {
  daysInMonth,
  formatWatchedDateLabel,
  getLogDatePrecision,
  parseWatchedOnParts,
  precisionForParts,
  watchedOnFromParts,
  type WatchedOnParts,
} from "../lib/watchLogDates";
import { formatDate } from "../lib/format";
import { api } from "../lib/plotlist/api";
import { useMutation } from "../lib/plotlist/react";

import { GlassSurface } from "./NativeGlass";
import { StarRating } from "./StarRating";

// One place to log a viewing, for casual and hardcore trackers alike. The
// default path is two taps (open → Save logs "today"); everything else —
// backdating to a day/month/year, "don't remember when", per-viewing rating,
// reaction, note, rewatch flag — is optional dials on the same sheet. Also
// edits an existing diary entry when `editLog` is set.

export type LogWatchScope = {
  key: string;
  label: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  // Already fully watched → this viewing defaults to a rewatch.
  alreadyWatched: boolean;
  // Season scope: released episodes to mark watched alongside a first watch.
  markEpisodes?: { episodeNumber: number; title?: string }[];
};

export type EditableWatchLog = {
  _id: string;
  watchedAt: number;
  watchedOn?: string | null;
  datePrecision?: string | null;
  note?: string | null;
  rating?: number | null;
  reaction?: string | null;
  isRewatch?: boolean | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeTitle?: string | null;
};

type LogWatchSheetProps = {
  visible: boolean;
  onClose: () => void;
  showId: string;
  showTitle: string;
  // Create mode: at least one scope; the first is selected by default unless
  // initialScopeKey matches another. Ignored in edit mode.
  scopes?: LogWatchScope[];
  initialScopeKey?: string;
  // Edit mode: the diary entry being edited.
  editLog?: EditableWatchLog | null;
  onSaved?: () => void;
};

const REACTIONS = ["❤️", "🔥", "😂", "😭", "😱", "🤯", "😴", "👏"];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type DateMode = "original" | "custom" | "unknown";

function lightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function Chip({
  label,
  active,
  onPress,
  compact,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={() => {
        lightHaptic();
        onPress();
      }}
      className="active:opacity-70"
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "rgba(14,165,233,0.45)" : "rgba(255,255,255,0.10)",
        backgroundColor: active ? "rgba(14,165,233,0.16)" : "rgba(255,255,255,0.04)",
        paddingHorizontal: compact ? 12 : 14,
        paddingVertical: compact ? 6 : 8,
      }}
    >
      <Text
        className={compact ? "text-[13px] font-semibold" : "text-[14px] font-semibold"}
        style={{ color: active ? "#7dd3fc" : "#9BA1B0" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 text-[13px] font-semibold text-text-secondary">{children}</Text>
  );
}

export function LogWatchSheet({
  visible,
  onClose,
  showId,
  showTitle,
  scopes,
  initialScopeKey,
  editLog,
  onSaved,
}: LogWatchSheetProps) {
  const insets = useSafeAreaInsets();
  const isDesktopWeb = useIsDesktopWeb();
  const webSheetStyle = useWebSheetStyle();
  const { height: windowHeight } = useWindowDimensions();
  const isEdit = Boolean(editLog);
  const logWatch = useMutation(api.watchLogs.logWatch);
  const updateLog = useMutation(api.watchLogs.updateLog);

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();

  const [scopeKey, setScopeKey] = useState<string | null>(null);
  const [dateMode, setDateMode] = useState<DateMode>("original");
  const [parts, setParts] = useState<WatchedOnParts>({
    year: currentYear,
    month: null,
    day: null,
  });
  const [rating, setRating] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isRewatch, setIsRewatch] = useState(false);
  const [saving, setSaving] = useState(false);

  const scope = useMemo(() => {
    if (isEdit || !scopes || scopes.length === 0) return null;
    return scopes.find((entry) => entry.key === scopeKey) ?? scopes[0]!;
  }, [isEdit, scopeKey, scopes]);

  // Re-seed local state each time the sheet opens (create defaults or the
  // edited entry's current values).
  useEffect(() => {
    if (!visible) return;
    if (editLog) {
      const precision = getLogDatePrecision(editLog);
      const parsed = parseWatchedOnParts(editLog.watchedOn);
      setDateMode(precision === "unknown" ? "unknown" : "original");
      setParts(
        parsed ?? {
          year: new Date(editLog.watchedAt).getFullYear(),
          month: new Date(editLog.watchedAt).getMonth() + 1,
          day: new Date(editLog.watchedAt).getDate(),
        },
      );
      setRating(typeof editLog.rating === "number" ? editLog.rating : 0);
      setReaction(editLog.reaction ?? null);
      setNote(editLog.note ?? "");
      setIsRewatch(Boolean(editLog.isRewatch));
    } else {
      const initial =
        (initialScopeKey && scopes?.find((entry) => entry.key === initialScopeKey)) ||
        scopes?.[0] ||
        null;
      setScopeKey(initial?.key ?? null);
      setDateMode("original");
      setParts({ year: currentYear, month: now.getMonth() + 1, day: now.getDate() });
      setRating(0);
      setReaction(null);
      setNote("");
      setIsRewatch(Boolean(initial?.alreadyWatched));
    }
    setSaving(false);
  }, [currentYear, editLog, initialScopeKey, now, scopes, visible]);

  // Switching scope re-derives the rewatch default for that target.
  const handleSelectScope = useCallback(
    (entry: LogWatchScope) => {
      setScopeKey(entry.key);
      setIsRewatch(entry.alreadyWatched);
    },
    [],
  );

  const originalChipLabel = isEdit
    ? getLogDatePrecision(editLog!) === "unknown"
      ? "Logged date"
      : formatWatchedDateLabel(editLog!)
    : "Today";

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let year = currentYear; year >= currentYear - 60; year -= 1) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  const maxDay =
    parts.month != null ? daysInMonth(parts.year, parts.month) : 31;
  const isCurrentMonthSelected =
    parts.year === currentYear && parts.month === now.getMonth() + 1;

  const customSummary = useMemo(() => {
    if (dateMode !== "custom") return null;
    return formatWatchedDateLabel({
      watchedAt: 0,
      watchedOn: watchedOnFromParts(parts),
      datePrecision: precisionForParts(parts),
    });
  }, [dateMode, parts]);

  const setYear = (year: number) => {
    setParts((current) => {
      const next = { ...current, year };
      // Clamp forward-dated selections back to today.
      if (year === currentYear && next.month != null && next.month > now.getMonth() + 1) {
        next.month = now.getMonth() + 1;
        next.day = null;
      }
      if (next.month != null && next.day != null) {
        next.day = Math.min(next.day, daysInMonth(year, next.month));
        if (year === currentYear && next.month === now.getMonth() + 1) {
          next.day = Math.min(next.day, now.getDate());
        }
      }
      return next;
    });
  };

  const setMonth = (month: number | null) => {
    setParts((current) => ({
      ...current,
      month,
      day: month == null ? null : current.day != null ? Math.min(current.day, daysInMonth(current.year, month)) : null,
    }));
  };

  const setDay = (day: number | null) => {
    setParts((current) => ({ ...current, day }));
  };

  const buildDateArgs = () => {
    if (dateMode === "unknown") {
      return { datePrecision: "unknown" as const, watchedOn: null };
    }
    if (dateMode === "custom") {
      return {
        datePrecision: precisionForParts(parts),
        watchedOn: watchedOnFromParts(parts),
      };
    }
    return null; // original/today: create → server "now"; edit → untouched
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const dateArgs = buildDateArgs();
      const trimmedNote = note.trim();
      if (isEdit && editLog) {
        await updateLog({
          logId: editLog._id,
          // "Original" leaves the date triple untouched; custom/unknown
          // re-resolve it server-side.
          ...(dateMode === "original" || !dateArgs
            ? {}
            : {
                datePrecision: dateArgs.datePrecision,
                watchedOn: dateArgs.watchedOn ?? null,
              }),
          note: trimmedNote || null,
          rating: rating >= 0.5 ? rating : null,
          reaction: reaction ?? null,
          isRewatch,
        });
      } else if (scope) {
        await logWatch({
          showId,
          ...(scope.seasonNumber != null ? { seasonNumber: scope.seasonNumber } : {}),
          ...(scope.episodeNumber != null ? { episodeNumber: scope.episodeNumber } : {}),
          ...(scope.episodeTitle ? { episodeTitle: scope.episodeTitle } : {}),
          ...(dateArgs
            ? { datePrecision: dateArgs.datePrecision, ...(dateArgs.watchedOn ? { watchedOn: dateArgs.watchedOn } : {}) }
            : {}),
          ...(trimmedNote ? { note: trimmedNote } : {}),
          ...(rating >= 0.5 ? { rating } : {}),
          ...(reaction ? { reaction } : {}),
          isRewatch,
          ...(scope.markEpisodes && scope.markEpisodes.length > 0 && !scope.alreadyWatched
            ? { markEpisodes: scope.markEpisodes }
            : {}),
        });
      }
      onSaved?.();
      onClose();
    } catch (error) {
      notifyError("Couldn't save", String((error as Error)?.message ?? error));
    } finally {
      setSaving(false);
    }
  };

  const targetLabel = isEdit
    ? editLog?.episodeNumber != null
      ? `S${String(editLog.seasonNumber ?? 0).padStart(2, "0")} E${String(editLog.episodeNumber).padStart(2, "0")}${editLog.episodeTitle ? ` · ${editLog.episodeTitle}` : ""}`
      : editLog?.seasonNumber != null
        ? `Season ${editLog.seasonNumber}`
        : "Entire show"
    : scope?.label ?? "";

  // Full-screen page sheet on phones; centered dialog on desktop web and wide
  // iPad windows (same treatment as the review sheet).
  const sheetBody = (
      <View className="flex-1" style={{ backgroundColor: "#0D0F14" }}>
        <View className="flex-row items-center justify-between border-b border-dark-border px-6 py-4">
          <Pressable
            accessibilityLabel="Cancel"
            onPress={() => {
              lightHaptic();
              onClose();
            }}
          >
            <Text className="text-[16px] text-text-tertiary">Cancel</Text>
          </Pressable>
          <Text className="text-[16px] font-semibold text-text-primary">
            {isEdit ? "Edit Entry" : "Log a Watch"}
          </Text>
          <Pressable accessibilityLabel="Save entry" onPress={handleSave} disabled={saving}>
            <Text
              className="text-[16px] font-semibold"
              style={{ color: saving ? "#5A6070" : "#38BDF8" }}
            >
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: insets.bottom + 40,
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Text className="text-[20px] font-bold text-text-primary" numberOfLines={1}>
            {showTitle}
          </Text>
          {targetLabel ? (
            <Text className="mt-1 text-[13px] font-semibold text-brand-300" numberOfLines={1}>
              {targetLabel}
            </Text>
          ) : null}

          {!isEdit && scopes && scopes.length > 1 ? (
            <>
              <SectionLabel>What did you watch?</SectionLabel>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {scopes.map((entry) => (
                  <Chip
                    key={entry.key}
                    label={entry.label}
                    active={scope?.key === entry.key}
                    onPress={() => handleSelectScope(entry)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <SectionLabel>When did you watch it?</SectionLabel>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <Chip
              label={originalChipLabel}
              active={dateMode === "original"}
              onPress={() => setDateMode("original")}
            />
            <Chip
              label="Pick a date"
              active={dateMode === "custom"}
              onPress={() => setDateMode("custom")}
            />
            <Chip
              label="Don't remember"
              active={dateMode === "unknown"}
              onPress={() => setDateMode("unknown")}
            />
          </View>

          {dateMode === "custom" ? (
            <GlassSurface
              radius={16}
              variant="surface"
              fallbackColor="rgba(22,26,34,0.66)"
              style={{ marginTop: 12 }}
              contentStyle={{ padding: 14 }}
            >
              <Text className="text-[12px] font-semibold uppercase tracking-widest text-text-tertiary">
                Year
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View className="flex-row" style={{ gap: 6 }}>
                  {yearOptions.map((year) => (
                    <Chip
                      key={year}
                      label={String(year)}
                      active={parts.year === year}
                      onPress={() => setYear(year)}
                      compact
                    />
                  ))}
                </View>
              </ScrollView>

              <Text className="mt-4 text-[12px] font-semibold uppercase tracking-widest text-text-tertiary">
                Month <Text className="text-text-tertiary/70">(optional)</Text>
              </Text>
              <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
                <Chip label="Whole year" active={parts.month == null} onPress={() => setMonth(null)} compact />
                {MONTH_LABELS.map((label, index) => {
                  const month = index + 1;
                  const disabled = parts.year === currentYear && month > now.getMonth() + 1;
                  if (disabled) return null;
                  return (
                    <Chip
                      key={label}
                      label={label}
                      active={parts.month === month}
                      onPress={() => setMonth(month)}
                      compact
                    />
                  );
                })}
              </View>

              {parts.month != null ? (
                <>
                  <Text className="mt-4 text-[12px] font-semibold uppercase tracking-widest text-text-tertiary">
                    Day <Text className="text-text-tertiary/70">(optional)</Text>
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <View className="flex-row" style={{ gap: 6 }}>
                      <Chip label="Whole month" active={parts.day == null} onPress={() => setDay(null)} compact />
                      {Array.from({ length: maxDay }, (_, index) => index + 1)
                        .filter((day) => !isCurrentMonthSelected || day <= now.getDate())
                        .map((day) => (
                          <Chip
                            key={day}
                            label={String(day)}
                            active={parts.day === day}
                            onPress={() => setDay(day)}
                            compact
                          />
                        ))}
                    </View>
                  </ScrollView>
                </>
              ) : null}

              {customSummary ? (
                <View className="mt-4 flex-row items-center" style={{ gap: 6 }}>
                  <Ionicons name="calendar-outline" size={14} color="#7DD3FC" />
                  <Text className="text-[13px] font-semibold text-brand-300">{customSummary}</Text>
                  {precisionForParts(parts) !== "day" ? (
                    <Text className="text-[12px] text-text-tertiary">· approximate</Text>
                  ) : null}
                </View>
              ) : null}
            </GlassSurface>
          ) : null}
          {dateMode === "unknown" ? (
            <Text className="mt-3 text-[13px] leading-5 text-text-tertiary">
              Saved without a date — it still counts in your history and shows up as
              "date unknown" in your diary.
            </Text>
          ) : null}

          <SectionLabel>Rewatch</SectionLabel>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isRewatch }}
            onPress={() => {
              lightHaptic();
              setIsRewatch((current) => !current);
            }}
            className="flex-row items-center active:opacity-70"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isRewatch ? "rgba(14,165,233,0.35)" : "rgba(255,255,255,0.08)",
              backgroundColor: isRewatch ? "rgba(14,165,233,0.10)" : "rgba(255,255,255,0.03)",
              paddingHorizontal: 14,
              paddingVertical: 12,
              gap: 10,
            }}
          >
            <Ionicons name="repeat" size={18} color={isRewatch ? "#38BDF8" : "#5A6070"} />
            <Text
              className="flex-1 text-[14px] font-medium"
              style={{ color: isRewatch ? "#7dd3fc" : "#9BA1B0" }}
            >
              I've seen this before
            </Text>
            <Ionicons
              name={isRewatch ? "checkmark-circle" : "ellipse-outline"}
              size={20}
              color={isRewatch ? "#38BDF8" : "#404654"}
            />
          </Pressable>

          <SectionLabel>How was it? (optional)</SectionLabel>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <StarRating value={rating} onChange={setRating} size={30} />
            {rating >= 0.5 ? (
              <Pressable
                accessibilityLabel="Clear rating"
                onPress={() => {
                  lightHaptic();
                  setRating(0);
                }}
              >
                <Ionicons name="close-circle" size={18} color="#5A6070" />
              </Pressable>
            ) : null}
          </View>
          <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
            {REACTIONS.map((emoji) => {
              const active = reaction === emoji;
              return (
                <Pressable
                  key={emoji}
                  accessibilityLabel={`React with ${emoji}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    lightHaptic();
                    setReaction(active ? null : emoji);
                  }}
                  className="items-center justify-center active:opacity-70"
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "rgba(14,165,233,0.45)" : "rgba(255,255,255,0.08)",
                    backgroundColor: active ? "rgba(14,165,233,0.16)" : "rgba(255,255,255,0.03)",
                    height: 40,
                    width: 40,
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>

          <SectionLabel>Note (optional)</SectionLabel>
          <GlassSurface
            radius={16}
            variant="control"
            fallbackColor="rgba(22,26,34,0.72)"
            contentStyle={{ minHeight: 100 }}
          >
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Anything you want to remember about this viewing…"
              placeholderTextColor="#5A6070"
              multiline
              className="text-[16px] text-text-primary"
              style={{
                minHeight: 100,
                paddingHorizontal: 16,
                paddingVertical: 12,
                textAlignVertical: "top",
              }}
            />
          </GlassSurface>

          {!isEdit && scope && !scope.alreadyWatched && scope.markEpisodes && scope.markEpisodes.length > 0 ? (
            <View className="mt-4 flex-row items-center" style={{ gap: 6 }}>
              <Ionicons name="checkmark-done-outline" size={14} color="#5A6070" />
              <Text className="text-[12px] text-text-tertiary">
                Also marks {scope.markEpisodes.length} episode
                {scope.markEpisodes.length === 1 ? "" : "s"} as watched
              </Text>
            </View>
          ) : null}
          {isEdit && editLog ? (
            <Text className="mt-4 text-[12px] text-text-tertiary">
              Logged {formatDate(editLog.watchedAt)} · edits only touch this entry
            </Text>
          ) : null}
        </ScrollView>
      </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={isDesktopWeb}
      animationType={isDesktopWeb ? "fade" : "slide"}
      presentationStyle={isDesktopWeb ? "overFullScreen" : "pageSheet"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {isDesktopWeb ? (
        <Pressable onPress={onClose} className="flex-1 justify-center bg-black/50 px-6">
          <Pressable onPress={(e) => e.stopPropagation()} style={webSheetStyle}>
            <View
              className="overflow-hidden rounded-3xl border border-dark-border"
              // Definite height so the sheet's flex-1 scroll area resolves
              // inside the centered dialog.
              style={{ height: Math.min(680, windowHeight - 96) }}
            >
              {sheetBody}
            </View>
          </Pressable>
        </Pressable>
      ) : (
        sheetBody
      )}
    </Modal>
  );
}
