"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { processScan } from "@/actions/scan";

/**
 * Wi-Fi-blip tolerance for the counter: a scan whose Server Action call
 * fails at the network level is stored in localStorage and replayed
 * automatically (every 15 s and on the browser's `online` event) until the
 * server answers. Business rejections during replay (e.g. a queued rescan
 * that now needs handover verification) surface as sync notices instead of
 * being retried forever.
 *
 * Shared-device honesty: each item is stamped with the user who was signed
 * in when it was queued; the server annotates the audit event when a
 * different account ends up syncing it. Items older than the expiry are
 * dropped with a notice rather than silently holding customer PII forever.
 */

const QUEUE_KEY = "packscan-offline-scans";
const FLUSH_INTERVAL_MS = 15_000;
const EXPIRY_MS = 72 * 60 * 60_000;

interface QueuedScan {
  input: Record<string, unknown>;
  trackingNumber: string;
  queuedAt: number;
  queuedByUserId: string;
}

function readQueue(): QueuedScan[] {
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedScan[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function useOfflineScanQueue(sessionUserId: string) {
  // Starts empty and loads after mount so SSR markup never disagrees.
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [syncNotices, setSyncNotices] = useState<string[]>([]);
  const flushing = useRef(false);

  const enqueue = useCallback(
    (input: Record<string, unknown>, trackingNumber: string) => {
      const next = [
        ...readQueue(),
        { input, trackingNumber, queuedAt: Date.now(), queuedByUserId: sessionUserId },
      ];
      writeQueue(next);
      setQueue(next);
    },
    [sessionUserId]
  );

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let current = readQueue();
      // Expire stale items instead of retaining their contact data forever.
      const fresh = current.filter((item) => Date.now() - item.queuedAt < EXPIRY_MS);
      if (fresh.length !== current.length) {
        const expired = current.filter((item) => Date.now() - item.queuedAt >= EXPIRY_MS);
        setSyncNotices((prev) => [
          ...prev,
          ...expired.map((e) => `${e.trackingNumber}: offline scan expired unsynced — rescan it`),
        ]);
        writeQueue(fresh);
        current = fresh;
      }
      while (current.length > 0) {
        const [head, ...rest] = current;
        let res;
        try {
          res = await processScan({
            ...head.input,
            offline: { queuedAt: head.queuedAt, queuedByUserId: head.queuedByUserId },
          });
        } catch {
          break; // still offline — keep the queue intact
        }
        if (!res.ok) {
          setSyncNotices((prev) => [
            ...prev,
            `${head.trackingNumber}: ${"error" in res && res.error ? res.error : "needs attention — rescan it"}`,
          ]);
        }
        writeQueue(rest);
        current = rest;
      }
      setQueue(current);
    } finally {
      flushing.current = false;
    }
  }, []);

  useEffect(() => {
    setQueue(readQueue());
    void flush();
    const interval = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", flush);
    };
  }, [flush]);

  const dismissNotices = useCallback(() => setSyncNotices([]), []);

  return { queuedCount: queue.length, syncNotices, enqueue, dismissNotices };
}
