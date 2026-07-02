import { prisma } from "@/lib/prisma";
import type { NotificationProvider, NotificationRequest } from "./types";

/**
 * Stub provider: records what WOULD have been sent, in the DB and the server
 * log, so the pickup workflow is fully wired without SMS/email credentials.
 */
export class LogNotificationProvider implements NotificationProvider {
  async send(request: NotificationRequest) {
    console.log(
      `[notification:would-send] ${request.channel} to ${request.recipient}: "${request.message}"`
    );
    await prisma.notification.create({
      data: {
        packageId: request.packageId,
        trigger: request.trigger,
        channel: request.channel,
        recipient: request.recipient,
        status: "WOULD_SEND",
        message: request.message,
      },
    });
    return { status: "WOULD_SEND" as const };
  }
}
