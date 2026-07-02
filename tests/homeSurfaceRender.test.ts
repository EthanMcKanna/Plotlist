import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { createElement } from "react";
import { Platform } from "react-native";

const mockAction = jest.fn();
const mockMutation = jest.fn() as any;
mockMutation.withOptimisticUpdate = jest.fn(() => mockMutation);

type RenderNode = {
  props?: {
    "aria-level"?: unknown;
    accessibilityLabel?: unknown;
    accessibilityRole?: unknown;
    dataSet?: unknown;
    testID?: unknown;
  };
};

function getRenderedTestID(node: unknown) {
  return (node as RenderNode).props?.testID;
}

function getRenderedAccessibilityLabel(node: unknown) {
  return (node as RenderNode).props?.accessibilityLabel;
}

function getRenderedAccessibilityRole(node: unknown) {
  return (node as RenderNode).props?.accessibilityRole;
}

function getRenderedText(node: unknown): string {
  const children = (node as { children?: unknown[] }).children ?? [];
  return children
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      return getRenderedText(child);
    })
    .join("");
}

function hasMeaningfulText(value: string) {
  return /[A-Za-z0-9]/.test(value);
}

function isSectionDataSet(
  value: unknown,
): value is { homeSection: string; homeSectionId: string } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { homeSectionId?: unknown }).homeSectionId === "string" &&
    typeof (value as { homeSection?: unknown }).homeSection === "string"
  );
}

function getOpenActionTitle(label: string) {
  return label
    .replace(/^Open\s+/i, "")
    .replace(/\s+from\s+[^.]+\..*$/i, "")
    .replace(/\.\s+.*$/i, "")
    .trim();
}

jest.mock("expo-blur", () => ({
  BlurView: ({ children }: any) => {
    const { createElement: mockCreateElement } = require("react");
    return mockCreateElement("View", null, children);
  },
}));

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => {
    const { createElement: mockCreateElement } = require("react");
    return mockCreateElement("View", null, children);
  },
}));

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
  useNavigation: () => ({
    getParent: () => ({
      addListener: () => () => undefined,
      getState: () => ({
        index: 0,
        routes: [{ key: "home" }],
      }),
    }),
    getState: () => ({
      index: 0,
      routes: [{ key: "home" }],
    }),
  }),
}));

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: (() => {
    const { createElement: mockCreateElement } = require("react");
    const AnimatedView = ({ children, ...props }: any) =>
      mockCreateElement("View", props, children);
    const AnimatedScrollView = ({ children, ...props }: any) =>
      mockCreateElement("ScrollView", props, children);
    const AnimatedFlatList = ({
      data = [],
      keyExtractor,
      renderItem,
      ...props
    }: any) =>
      mockCreateElement(
        "FlatList",
        props,
        data.map((item: any, index: number) =>
          mockCreateElement(
            "View",
            {
              key: keyExtractor ? keyExtractor(item, index) : index,
            },
            renderItem({ index, item }),
          ),
        ),
      );
    return {
      FlatList: AnimatedFlatList,
      ScrollView: AnimatedScrollView,
      View: AnimatedView,
    };
  })(),
  Extrapolation: {
    CLAMP: "clamp",
  },
  FadeInRight: {
    delay: () => ({
      duration: () => undefined,
    }),
  },
  interpolate: () => 0,
  useAnimatedScrollHandler: () => jest.fn(),
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("../lib/deviceContacts", () => ({
  loadDeviceContacts: jest.fn(),
}));

jest.mock("../lib/plotlist/react", () => ({
  useAction: () => mockAction,
  useAuth: () => ({ isAuthenticated: true }),
  useMutation: () => mockMutation,
  useQuery: () => undefined,
}));

jest.mock("../lib/preferences", () => ({
  getContactsSyncDismissed: jest.fn<() => Promise<boolean>>(
    () => new Promise(() => {}),
  ),
  setContactsSyncDismissed: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import {
  getHomeSectionWebDataSet,
  getHomeInitialRenderSectionCount,
  HOME_NATIVE_INITIAL_RENDER_SECTION_COUNT,
  HomeSurface,
} from "../app/(tabs)/home";
import {
  buildHomePreviewContinueWatchingItems,
  buildHomePreviewData,
  buildHomePreviewSchedule,
  HOME_PREVIEW_NOW,
} from "../lib/homePreviewData";

describe("HomeSurface rendered preview", () => {
  it("mounts the full Browser QA section stack from the shared preview model", () => {
    const originalOS = Platform.OS;

    try {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "web",
      });

      const { UNSAFE_root } = render(
        createElement(HomeSurface, {
          data: buildHomePreviewData(HOME_PREVIEW_NOW),
          continueWatchingItems: buildHomePreviewContinueWatchingItems(),
          reduceMotionEnabled: true,
          schedulePreview: buildHomePreviewSchedule(),
        }),
      );

      const sectionIds = [
        ...new Set<string>(
          UNSAFE_root.findAll((node: unknown) => {
            const testID = getRenderedTestID(node);
            return typeof testID === "string" && testID.startsWith("home-section-");
          })
            .map((node: unknown) => getRenderedTestID(node))
            .filter((testID: unknown): testID is string => typeof testID === "string"),
        ),
      ];
      const sectionDataSetById = new Map<string, Record<string, string>>();
      UNSAFE_root.findAll((node: unknown) => {
        const testID = getRenderedTestID(node);
        return typeof testID === "string" && testID.startsWith("home-section-");
      }).forEach((node: unknown) => {
        const dataSet = (node as RenderNode).props?.dataSet;
        if (isSectionDataSet(dataSet)) {
          sectionDataSetById.set(dataSet.homeSectionId, dataSet);
        }
      });
      const sectionDataSet = sectionIds.map((id) => sectionDataSetById.get(id));
      expect(screen.UNSAFE_getByProps({ testID: "home-surface" })).toBeTruthy();
      expect(screen.UNSAFE_getByProps({ testID: "home-surface-list" })).toBeTruthy();
      expect(screen.UNSAFE_getByProps({ testID: "home-topbar" })).toBeTruthy();
      expect(screen.getByLabelText("Open profile")).toBeTruthy();
      expect(screen.getByLabelText("Search")).toBeTruthy();
      expect(
        screen.getByLabelText("Release calendar, 2 upcoming releases"),
      ).toBeTruthy();
      expect(sectionIds).toEqual([
        "home-section-hero",
        "home-section-continue-watching",
        "home-section-tonight",
        "home-section-curated",
        "home-section-rooms",
        "home-section-for-you",
        "home-section-heat",
        "home-section-fresh",
      ]);
      expect(sectionDataSet).toEqual([
        { homeSection: "hero", homeSectionId: "home-section-hero" },
        {
          homeSection: "continue-watching",
          homeSectionId: "home-section-continue-watching",
        },
        { homeSection: "tonight", homeSectionId: "home-section-tonight" },
        { homeSection: "curated", homeSectionId: "home-section-curated" },
        { homeSection: "rooms", homeSectionId: "home-section-rooms" },
        { homeSection: "for-you", homeSectionId: "home-section-for-you" },
        { homeSection: "heat", homeSectionId: "home-section-heat" },
        { homeSection: "fresh", homeSectionId: "home-section-fresh" },
      ]);
      const unlabeledControls = UNSAFE_root.findAll((node: unknown) => {
        const role = getRenderedAccessibilityRole(node);
        return role === "button" || role === "tab" || role === "link";
      }).flatMap((node: unknown) => {
        const label = getRenderedAccessibilityLabel(node);
        const text = getRenderedText(node).trim();
        if (
          (typeof label === "string" && label.trim()) ||
          hasMeaningfulText(text)
        ) {
          return [];
        }

        return [{
          role: getRenderedAccessibilityRole(node),
          testID: getRenderedTestID(node) ?? null,
          text,
        }];
      });
      expect(unlabeledControls).toEqual([]);
      const openActionLabels = [
        ...new Set<string>(
          UNSAFE_root.findAll((node: unknown) => {
            const label = getRenderedAccessibilityLabel(node);
            const role = getRenderedAccessibilityRole(node);
            return (
              typeof label === "string" &&
              /^Open\s+/i.test(label) &&
              (role === "button" || role === "link")
            );
          })
            .map((node: unknown) => getRenderedAccessibilityLabel(node))
            .filter((label: unknown): label is string => typeof label === "string"),
        ),
      ];
      const openActionTitles = openActionLabels
        .map(getOpenActionTitle)
        .filter(Boolean);
      const duplicateOpenActionTitles = [
        ...new Set(
          openActionTitles.filter(
            (title, index) => openActionTitles.indexOf(title) !== index,
          ),
        ),
      ];
      expect(duplicateOpenActionTitles).toEqual([]);
      const providerRoomTexts: string[] = UNSAFE_root.findAll((node: unknown) => {
        const testID = getRenderedTestID(node);
        return typeof testID === "string" && testID.startsWith("provider-room-copy-");
      }).map(getRenderedText);
      const featureCardTexts: string[] = UNSAFE_root.findAll((node: unknown) => {
        const testID = getRenderedTestID(node);
        return typeof testID === "string" && testID.startsWith("feature-card-");
      }).map(getRenderedText);
      const repeatedStreamingLeadTitles = [
        "Off Campus",
        "Sofia the First: Royal Magic",
      ].filter(
        (title) =>
          providerRoomTexts.some((text) => text.includes(title)) &&
          featureCardTexts.some((text) => text.includes(title)),
      );
      expect(repeatedStreamingLeadTitles).toEqual([]);
      expect(screen.getAllByText("Trending").length).toBeGreaterThan(0);
      expect(screen.queryByText("Quick hits")).toBeNull();
      expect(screen.queryByText("Quietly excellent")).toBeNull();
      expect(screen.queryByText("Search")).toBeNull();
      expect(screen.queryByLabelText("Search the catalog")).toBeNull();
      expect(screen.UNSAFE_getByProps({ testID: "home-topbar-title" })).toBeTruthy();
      expect(screen.queryAllByText("Plotlist")).toHaveLength(0);
      [
        "Lead picks carousel",
        "Continue watching rail",
        "Tonight releases rail",
        "Picks rail",
        "Streaming rail",
        "For you rail",
        "New rail",
        "Trending rail",
      ].forEach((label) => {
        expect(screen.getByLabelText(label)).toBeTruthy();
      });
      expect(
        screen.getByLabelText(/^Lead pick\. 1 of 5\. Spider-Noir\./).props.accessibilityRole,
      ).toBe("header");
      expect(
        screen.getByLabelText(/^Lead pick\. 1 of 5\. Spider-Noir\./).props[
          "aria-level"
        ],
      ).toBeUndefined();
      expect(screen.queryByText(/Ben Reilly, an aging/)).toBeNull();
      expect(screen.queryByLabelText("Pick. Next")).toBeNull();
      expect(screen.queryByText("Next")).toBeNull();
      const tasteBriefCards = UNSAFE_root.findAll((node: unknown) => {
        const testID = getRenderedTestID(node);
        return typeof testID === "string" && testID.startsWith("taste-brief-card-");
      });
      expect(tasteBriefCards).toEqual([]);
      expect(
        screen.getByLabelText(
          "Section 01. Resume. Continue watching",
        ).props.accessibilityRole,
      ).toBe("header");
      expect(
        screen.getByLabelText(
          "Section 01. Resume. Continue watching",
        ).props["aria-level"],
      ).toBe(2);
      expect(
        screen.getByLabelText(
          "Section 02. Schedule. Releases",
        ).props.accessibilityRole,
      ).toBe("header");
      expect(
        screen.getByLabelText(
          "Section 02. Schedule. Releases",
        ).props["aria-level"],
      ).toBe(2);
      expect(
        screen.getByLabelText(
          "Section 04. Watch. Streaming",
        ).props.accessibilityRole,
      ).toBe("header");
      expect(
        screen.getByLabelText(
          "Section 04. Watch. Streaming",
        ).props["aria-level"],
      ).toBe(2);
      expect(screen.getByLabelText("Tonight, 1 release, selected")).toBeTruthy();
      expect(screen.getByLabelText("This week, 1 release")).toBeTruthy();
      expect(screen.queryByText("1")).toBeNull();

      fireEvent.press(screen.getByLabelText("This week, 1 release"));

      expect(screen.getByLabelText("This week, 1 release, selected")).toBeTruthy();
      expect(screen.queryByText("1")).toBeNull();
      expect(
        screen.getByLabelText(
          "Section 02. Schedule. Releases",
        ).props.accessibilityRole,
      ).toBe("header");
      expect(screen.getByLabelText("This week releases rail")).toBeTruthy();
      expect(
        screen.getByLabelText(
          "Open Love Island USA. Tuesday, Jun 2. S07E01. Season premiere · Peacock",
        ),
      ).toBeTruthy();
      expect(screen.queryByLabelText("Tonight releases rail")).toBeNull();
      expect(
        screen.queryByLabelText(
          "Open Sirens. Tonight. S01E01. Premiere · Netflix",
        ),
      ).toBeNull();
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: originalOS,
      });
    }
  });

  it("keeps Browser QA section metadata web-only", () => {
    const originalOS = Platform.OS;

    try {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "ios",
      });
      expect(getHomeSectionWebDataSet("hero", "home-section-hero")).toBeUndefined();

      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "web",
      });
      expect(getHomeSectionWebDataSet("hero", "home-section-hero")).toEqual({
        homeSection: "hero",
        homeSectionId: "home-section-hero",
      });
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: originalOS,
      });
    }
  });

  it("keeps Browser QA complete while bounding native first render work", () => {
    const originalOS = Platform.OS;

    try {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "ios",
      });
      expect(getHomeInitialRenderSectionCount(12)).toBe(
        HOME_NATIVE_INITIAL_RENDER_SECTION_COUNT,
      );
      expect(getHomeInitialRenderSectionCount(4)).toBe(4);

      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "web",
      });
      expect(getHomeInitialRenderSectionCount(12)).toBe(12);
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: originalOS,
      });
    }
  });
});
