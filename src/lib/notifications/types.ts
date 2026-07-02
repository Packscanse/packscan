import type { NotificationChannel, NotificationTrigger } from "@prisma/client";

export interface NotificationRequest {
  packageId: string;
  trigger: NotificationTrigger;
  channel: NotificationChannel;
  recipient: string;
  message: string;
}

export interface NotificationProvider {
  send(request: NotificationRequest): Promise<{ status: "SENT" | "FAILED" | "WOULD_SEND" }>;
}
