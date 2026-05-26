/**
 * Progressive-Web-App glue: service-worker registration, install prompt
 * capture + replay, and local reminder notifications.
 *
 * Push notifications would need a server (VAPID + push endpoint).
 * Brainbout is a static site, so reminders are scheduled locally: when
 * the hub loads with permission granted and today's daily challenge has
 * not been completed and the last reminder was > 22 h ago, the page
 * shows a Notification via the registered service worker. This is best-
 * effort -- the user must open the app for the check to fire -- but it
 * matches the "open the app like you would open TikTok" UX without
 * needing infrastructure.
 */

import { BASE } from "./base";

const LAST_REMINDER_KEY = "brainbout:pwa:last-reminder-at";
const REMINDER_COOLDOWN_MS = 22 * 60 * 60 * 1000;

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let onInstallChange: (() => void) | null = null;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt: () => Promise<void>;
}

function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Quota / private mode — drop the write rather than crash.
  }
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  // Don't register during local dev: dev.ts has no service-worker file
  // and the resulting 404 spams the console.
  if (window.location.hostname === "localhost") return;
  void navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
}

export function watchInstallability(callback: () => void): void {
  onInstallChange = callback;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    callback();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    callback();
  });
}

export function canInstall(): boolean {
  return deferredInstallPrompt !== null;
}

export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const ev = deferredInstallPrompt;
  if (ev === null) return "unavailable";
  await ev.prompt();
  const result = await ev.userChoice;
  deferredInstallPrompt = null;
  onInstallChange?.();
  return result.outcome;
}

/* ─── notifications ──────────────────────────────────────────────────── */

export type NotificationStatus =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function notificationStatus(): NotificationStatus {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotificationStatus;
}

export async function requestNotifications(): Promise<NotificationStatus> {
  if (typeof Notification === "undefined") return "unsupported";
  const result = await Notification.requestPermission();
  return result as NotificationStatus;
}

/**
 * Fire a one-shot local notification via the registered service worker
 * (falls back to the page-level Notification ctor when no SW is active).
 * No-ops if permission is not granted or the API is unavailable.
 */
async function showNotification(title: string, body: string): Promise<void> {
  if (notificationStatus() !== "granted") return;
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: `${BASE}icon-192.png`,
        badge: `${BASE}icon-192.png`,
        tag: "brainbout-reminder",
      });
      return;
    }
  }
  new Notification(title, { body });
}

/**
 * If the user has opted in to reminders, today's daily is incomplete,
 * and we haven't reminded them in the last cooldown window, show a
 * notification. Returns the action taken (used by tests + UI debug).
 */
export async function maybeFireDailyReminder(opts: {
  dailyDone: boolean;
}): Promise<"skipped" | "fired"> {
  if (notificationStatus() !== "granted") return "skipped";
  if (opts.dailyDone) return "skipped";
  const last = Number(localStorage.getItem(LAST_REMINDER_KEY) ?? "0");
  const now = Date.now();
  if (now - last < REMINDER_COOLDOWN_MS) return "skipped";
  await showNotification(
    "Daily challenge waiting",
    "Three minutes — same trials for everyone, replaces one scroll.",
  );
  safeSet(LAST_REMINDER_KEY, String(now));
  return "fired";
}
