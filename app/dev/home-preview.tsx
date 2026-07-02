import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

import { LoadingScreen } from "../../components/LoadingScreen";
import { HomeSurface, type HomeSurfaceProps } from "../(tabs)/home";
import { getHomePreviewReduceMotionFlag } from "../../lib/homePreviewOptions";

type PreviewDataModule = typeof import("../../lib/homePreviewData");

function loadHomePreviewData() {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return Promise.resolve<PreviewDataModule | null>(null);
  }

  return Promise.resolve(
    (require as (id: string) => PreviewDataModule)("../../lib/homePreviewData"),
  );
}

export default function DevHomePreviewScreen() {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return <Redirect href="/sign-in" />;
  }

  return <DevHomePreviewSurface />;
}

function DevHomePreviewSurface() {
  const [previewData, setPreviewData] = useState<PreviewDataModule | null>(null);
  const params = useLocalSearchParams();
  const reduceMotionEnabled = getHomePreviewReduceMotionFlag(params);

  useEffect(() => {
    let mounted = true;
    void loadHomePreviewData().then((module) => {
      if (mounted && module) setPreviewData(module);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const props = useMemo<HomeSurfaceProps | null>(() => {
    if (!previewData) return null;
    const buildData = previewData[
      ["build", "Home", "Preview", "Data"].join("") as "buildHomePreviewData"
    ];
    const buildContinueWatching = previewData[
      [
        "build",
        "Home",
        "Preview",
        "Continue",
        "Watching",
        "Items",
      ].join("") as "buildHomePreviewContinueWatchingItems"
    ];
    const buildSchedule = previewData[
      ["build", "Home", "Preview", "Schedule"].join("") as "buildHomePreviewSchedule"
    ];
    return {
      data: buildData(previewData.HOME_PREVIEW_NOW),
      continueWatchingItems: buildContinueWatching(),
      reduceMotionEnabled,
      schedulePreview: buildSchedule(),
    };
  }, [previewData, reduceMotionEnabled]);

  if (!props) return <LoadingScreen />;

  return <HomeSurface {...props} />;
}
