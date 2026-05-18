import { useQuery } from "@tanstack/react-query";

export function useSpotify() {
  return useQuery({
    queryKey: ["spotify-token"],
    queryFn: async (): Promise<{ token: string | null; isConnected: boolean }> => {
      const res = await fetch("/api/spotify/token");
      if (res.status === 404) return { token: null, isConnected: false };
      if (!res.ok) throw new Error("Token fetch failed");
      const { token } = await res.json();
      return { token: token as string, isConnected: true };
    },
    staleTime: 50 * 1000,
    retry: 1,
  });
}
