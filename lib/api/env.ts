const localApiUrl = "http://localhost:3001";
const productionApiUrl = "https://plotlist.app";

export function getApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location) {
    const { hostname, origin } = window.location;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return origin;
    }
  }

  if (typeof __DEV__ !== "undefined" && !__DEV__) {
    return productionApiUrl;
  }

  return localApiUrl;
}
