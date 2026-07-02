import { LogBox, Platform } from "react-native";

const IGNORED_WARNING_PATTERNS = [
  "SafeAreaView has been deprecated",
  "props.pointerEvents is deprecated. Use style.pointerEvents",
];

let warningSuppressionsInstalled = false;

export function getWarningText(args: unknown[]) {
  return args
    .map((arg) => {
      if (typeof arg === "string") {
        return arg;
      }
      if (arg instanceof Error) {
        return arg.message;
      }
      try {
        return JSON.stringify(arg) ?? String(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

export function shouldSuppressConsoleWarning(args: unknown[]) {
  const text = getWarningText(args);
  return IGNORED_WARNING_PATTERNS.some((pattern) => text.includes(pattern));
}

export function installWarningSuppressions() {
  LogBox.ignoreLogs(IGNORED_WARNING_PATTERNS);

  if (warningSuppressionsInstalled || Platform.OS !== "web") {
    return;
  }

  warningSuppressionsInstalled = true;
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: Parameters<typeof console.warn>) => {
    if (shouldSuppressConsoleWarning(args)) {
      return;
    }

    originalWarn(...args);
  };
}

installWarningSuppressions();
