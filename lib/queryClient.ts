import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Long enough that browsing away from a screen and coming back within a
      // session serves from cache instead of a full cold load.
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // 4xx responses are deterministic — retrying only doubles the latency
        // of the failure.
        const status = typeof error?.status === "number" ? error.status : null;
        if (status !== null && status >= 400 && status < 500) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});
