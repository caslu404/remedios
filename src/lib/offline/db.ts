import { openDB, type DBSchema } from "idb";
import type { DailySchedule } from "@/domain/scheduling";

interface OfflineEvent {
  id: string;
  type: "day_started" | "schedule_confirmed" | "dose_taken" | "dose_skipped" | "dose_snoozed";
  payload: Record<string, unknown>;
  createdAt: string;
}

interface TreatmentDb extends DBSchema {
  preferences: { key: string; value: unknown };
  schedules: { key: string; value: DailySchedule };
  syncQueue: { key: string; value: OfflineEvent };
}

const dbPromise = typeof window === "undefined" || typeof indexedDB === "undefined"
  ? null
  : openDB<TreatmentDb>("tratamento-adaptativo", 1, {
      upgrade(db) {
        db.createObjectStore("preferences");
        db.createObjectStore("schedules");
        db.createObjectStore("syncQueue", { keyPath: "id" });
      },
    }).catch(() => null);

const memoryPreferences = new Map<string, unknown>();
const memorySchedules = new Map<string, DailySchedule>();
const memoryQueue = new Map<string, OfflineEvent>();

export async function getPreference<T>(key: string): Promise<T | undefined> {
  const db = await dbPromise;
  return (db ? await db.get("preferences", key) : memoryPreferences.get(key)) as T | undefined;
}

export async function setPreference(key: string, value: unknown): Promise<void> {
  const db = await dbPromise;
  if (db) await db.put("preferences", value, key);
  else memoryPreferences.set(key, value);
}

export async function saveSchedule(schedule: DailySchedule): Promise<void> {
  const db = await dbPromise;
  if (db) await db.put("schedules", schedule, schedule.date);
  else memorySchedules.set(schedule.date, schedule);
}

export async function deleteSchedule(date: string): Promise<void> {
  const db = await dbPromise;
  if (db) await db.delete("schedules", date);
  else memorySchedules.delete(date);
}

export async function clearLocalData(): Promise<void> {
  const db = await dbPromise;
  if (db) {
    await Promise.all([db.clear("preferences"), db.clear("schedules"), db.clear("syncQueue")]);
  }
  memoryPreferences.clear();
  memorySchedules.clear();
  memoryQueue.clear();
}

export async function getSchedule(date: string): Promise<DailySchedule | undefined> {
  const db = await dbPromise;
  return db ? db.get("schedules", date) : memorySchedules.get(date);
}

export async function getAllSchedules(): Promise<DailySchedule[]> {
  const db = await dbPromise;
  return db ? db.getAll("schedules") : [...memorySchedules.values()];
}

export async function queueOfflineEvent(event: OfflineEvent): Promise<void> {
  const db = await dbPromise;
  if (db) await db.put("syncQueue", event);
  else memoryQueue.set(event.id, event);
}

export async function flushOfflineEvents(): Promise<number> {
  if (typeof navigator === "undefined" || !navigator.onLine) return 0;
  const db = await dbPromise;
  const events = db ? await db.getAll("syncQueue") : [...memoryQueue.values()];
  if (!events.length) return 0;
  let response: Response;
  try {
    response = await fetch("/api/offline/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
  } catch {
    return 0;
  }
  if (!response.ok) return 0;
  if (db) {
    const tx = db.transaction("syncQueue", "readwrite");
    await Promise.all([...events.map((event) => tx.store.delete(event.id)), tx.done]);
  } else {
    events.forEach((event) => memoryQueue.delete(event.id));
  }
  return events.length;
}

export type { OfflineEvent };
