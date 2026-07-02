import { LogNotificationProvider } from "./log-provider";

// The single swap point: replace with a real Twilio/Resend-backed provider
// (selected per channel via env vars) once credentials exist.
export const notificationProvider = new LogNotificationProvider();

export type { NotificationProvider, NotificationRequest } from "./types";
