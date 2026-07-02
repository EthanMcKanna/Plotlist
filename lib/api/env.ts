const localApiUrl = "http://localhost:3001";
const productionApiUrl = "https://plotlist.app";

export function getApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return localApiUrl;
  }

  if (typeof window !== "undefined" && window.location) {
    return window.location.origin;
  }

  if (typeof __DEV__ !== "undefined" && !__DEV__) {
    return productionApiUrl;
  }

  return localApiUrl;
}
