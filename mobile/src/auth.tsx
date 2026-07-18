import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, NetworkError, onUnauthenticated, setToken } from "./api/client";
import type { ApiErrorBody, ApiStore, ApiUser, LoginResponse } from "./api/types";

const USER_KEY = "packscan.user";
const STORE_KEY = "packscan.store";

type AuthState = {
  ready: boolean;
  user: ApiUser | null;
  store: ApiStore | null;
  /** Digits only: 4-digit user number + 6-digit PIN. Null = success, else error code. */
  signIn(input: { userNumber: string; pin: string }): Promise<string | null>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [store, setStore] = useState<ApiStore | null>(null);

  // Any 401 anywhere in the app funnels to a sign-out.
  useEffect(() => {
    onUnauthenticated(() => void clear());
  }, []);

  // Boot: restore the cached identity, then re-validate the token against
  // /me in the background (refreshes role/store/branding, drops dead tokens).
  useEffect(() => {
    (async () => {
      const [cachedUser, cachedStore] = await Promise.all([
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(STORE_KEY),
      ]);
      if (cachedUser) setUser(JSON.parse(cachedUser));
      if (cachedStore) setStore(JSON.parse(cachedStore));
      setReady(true);
      try {
        const me = await api<{ ok: true; user: ApiUser; store: ApiStore | null }>("/me");
        if (me.ok) {
          setUser(me.user);
          setStore(me.store);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(me.user));
          await AsyncStorage.setItem(STORE_KEY, JSON.stringify(me.store));
        }
      } catch (e) {
        if (e instanceof NetworkError) return; // offline start: keep cache, queue will sync
        await clear(); // 401 → token dead
      }
    })();
  }, []);

  async function clear() {
    await setToken(null);
    await AsyncStorage.multiRemove([USER_KEY, STORE_KEY]);
    setUser(null);
    setStore(null);
  }

  const signIn = useCallback(
    async (input: { userNumber: string; pin: string }) => {
      const res = await api<LoginResponse | ApiErrorBody>("/auth/login", {
        body: input,
        token: null,
      });
      if (!res.ok) return res.error.code;
      await setToken(res.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.user));
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify(res.store));
      setUser(res.user);
      setStore(res.store);
      return null;
    },
    []
  );

  const signOut = useCallback(async () => {
    await clear();
  }, []);

  return (
    <AuthContext.Provider value={{ ready, user, store, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
