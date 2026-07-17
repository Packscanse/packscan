import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Where the backend lives. On a phone running Expo Go, "localhost" is the
 * phone itself — the dev server must be reached via the Mac's LAN IP
 * (e.g. http://192.168.1.20:3100). Persisted so it's a one-time setup.
 */

const KEY = "packscan.serverUrl";
export const DEFAULT_SERVER_URL = "http://localhost:3100";

let cached: string | null = null;

export async function getServerUrl(): Promise<string> {
  if (cached) return cached;
  cached = (await AsyncStorage.getItem(KEY)) ?? DEFAULT_SERVER_URL;
  return cached;
}

export async function setServerUrl(url: string): Promise<void> {
  cached = url.trim().replace(/\/+$/, "");
  await AsyncStorage.setItem(KEY, cached);
}
