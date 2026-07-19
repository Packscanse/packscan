import * as SecureStore from "expo-secure-store";
import { getServerUrl } from "../config";

const TOKEN_KEY = "packscan.token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Thrown when the request never reached the server — the offline case. */
export class NetworkError extends Error {}

/** Thrown on 401: token missing/expired/revoked → back to login. */
export class UnauthenticatedError extends Error {}

// One global 401 hook so every screen doesn't have to catch it: the auth
// provider registers a handler that signs the user out.
let unauthenticatedHandler: (() => void) | null = null;
export function onUnauthenticated(handler: () => void): void {
  unauthenticatedHandler = handler;
}

/**
 * One fetch wrapper for every API call. Non-2xx responses are returned as
 * parsed JSON (the API's domain results carry their own ok/code fields);
 * only transport failure and 401 become exceptions, because those change
 * what screen the user should be on.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const base = await getServerUrl();
  const token = init.token !== undefined ? init.token : await getToken();

  let res: Response;
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new NetworkError("Could not reach the server.");
  }

  if (res.status === 401) {
    // The login call itself answers 401 on wrong credentials — that is a
    // normal domain answer, not a dead session.
    if (!path.startsWith("/auth/")) {
      unauthenticatedHandler?.();
      throw new UnauthenticatedError("Signed out.");
    }
  }
  return (await res.json()) as T;
}
