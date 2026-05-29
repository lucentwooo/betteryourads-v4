"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "../api/client";

export type ResourceKey = "brands" | "ads" | "usage";
export type ResourceStatus = "idle" | "loading" | "ready" | "error";
type Entry<T> = { data: T | null; status: ResourceStatus; error: string | null };

const FETCHERS: Record<ResourceKey, () => Promise<unknown>> = {
  brands: () => api.getBrands(),
  ads: () => api.getAds(),
  usage: () => api.getUsage(),
};

type Store = {
  get(key: ResourceKey): Entry<unknown>;
  subscribe(cb: () => void): () => void;
  /** First-load if idle, otherwise a background refresh; no-op while already loading. */
  load(key: ResourceKey): void;
  refresh(key: ResourceKey): void;
  invalidate(key: ResourceKey): void;
};

function createStore(): Store {
  const entries = new Map<ResourceKey, Entry<unknown>>();
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((cb) => cb());

  // get() must return a STABLE reference until the entry changes (useSyncExternalStore contract),
  // so we materialise the default entry once and replace the object on every set().
  function get(key: ResourceKey): Entry<unknown> {
    let e = entries.get(key);
    if (!e) {
      e = { data: null, status: "idle", error: null };
      entries.set(key, e);
    }
    return e;
  }
  function set(key: ResourceKey, patch: Partial<Entry<unknown>>) {
    entries.set(key, { ...get(key), ...patch });
    emit();
  }
  function refresh(key: ResourceKey) {
    set(key, { status: "loading", error: null }); // keep existing data → stale-while-revalidate
    FETCHERS[key]()
      .then((data) => set(key, { data, status: "ready", error: null }))
      .catch((err) =>
        set(key, { status: "error", error: err instanceof Error ? err.message : "Failed to load" }),
      );
  }
  function load(key: ResourceKey) {
    if (get(key).status === "loading") return;
    refresh(key);
  }

  return {
    get,
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    load,
    refresh,
    invalidate(key) {
      set(key, { data: null, status: "idle", error: null });
    },
  };
}

const CacheContext = createContext<Store | null>(null);

export function CacheProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Store | null>(null);
  if (!ref.current) ref.current = createStore();
  return <CacheContext.Provider value={ref.current}>{children}</CacheContext.Provider>;
}

function useStore(): Store {
  const store = useContext(CacheContext);
  if (!store) throw new Error("useResource must be used within <CacheProvider>");
  return store;
}

export function useResource<T>(key: ResourceKey): {
  data: T | null;
  status: ResourceStatus;
  error: string | null;
  refresh: () => void;
} {
  const store = useStore();
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.get(key), [store, key]);
  // Client + server snapshots are the same idle/empty entry → SSR renders the loading shell,
  // the fetch is kicked off only in the effect below (which never runs on the server).
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as Entry<T>;
  useEffect(() => {
    store.load(key);
  }, [store, key]);
  const refresh = useCallback(() => store.refresh(key), [store, key]);
  return { data: entry.data, status: entry.status, error: entry.error, refresh };
}

/** Returns a function that eagerly loads brands + ads — call once when auth is approved so the
 *  first navigation is instant (mirrors the legacy boot-load). */
export function usePrimeAfterAuth(): () => void {
  const store = useStore();
  return useCallback(() => {
    store.load("brands");
    store.load("ads");
  }, [store]);
}
