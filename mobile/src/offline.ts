import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, NetworkError } from "./api/client";
import type { ScanInput, ScanResult } from "./api/types";

/**
 * The app-side offline queue: scans that never reached the server, stored
 * on the device and replayed in captured order. Mirrors the web's queue —
 * each replay carries the offline stamp so the audit trail records when the
 * scan really happened and who captured it.
 */

const QUEUE_KEY = "packscan.scanQueue";

export type QueuedScan = { input: ScanInput; queuedAt: number; queuedByUserId: string };
export type SyncAttention = { trackingNumber: string; message: string };

export async function readQueue(): Promise<QueuedScan[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
}

async function writeQueue(queue: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueScan(input: ScanInput, userId: string): Promise<number> {
  const queue = await readQueue();
  queue.push({ input, queuedAt: Date.now(), queuedByUserId: userId });
  await writeQueue(queue);
  return queue.length;
}

/**
 * Replay everything, oldest first. Stops at the first transport failure
 * (still offline); domain rejections (already handled, needs verification)
 * are removed from the queue and surfaced for a human to look at.
 */
export async function flushQueue(): Promise<{ remaining: number; attention: SyncAttention[] }> {
  let queue = await readQueue();
  const attention: SyncAttention[] = [];

  while (queue.length > 0) {
    const item = queue[0];
    let result: ScanResult;
    try {
      result = await api<ScanResult>("/scans", {
        body: {
          ...item.input,
          offline: { queuedAt: item.queuedAt, queuedByUserId: item.queuedByUserId },
        },
      });
    } catch (e) {
      if (e instanceof NetworkError) break; // still offline — try again later
      throw e; // 401 bubbles to the auth layer
    }
    if (!result.ok) {
      attention.push({ trackingNumber: item.input.trackingNumber, message: result.error });
    }
    queue = queue.slice(1);
    await writeQueue(queue);
  }

  return { remaining: queue.length, attention };
}
