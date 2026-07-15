import { prisma } from "@/lib/prisma";
import type { NotificationProvider, NotificationRequest } from "./types";

/**
 * Stub provider: records what WOULD have been sent, in the DB and the server
 * log, so the pickup workflow is fully wired without SMS/email credentials.
 */
/** Contact data must not leak into server logs (GDPR): keep edges only. */
function maskContact(value: string): string {
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}…${value.slice(-2)}`;
}

export class LogNotificationProvider implements NotificationProvider {
  async send(request: NotificationRequest) {
    console.log(
      `[notification:would-send] ${request.channel} to ${maskContact(request.recipient)} (package ${request.packageId})`
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
