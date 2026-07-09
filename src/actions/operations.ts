"use server";

import { revalidatePath } from "next/cache";
import { getRequiredAdminSession } from "@/lib/session";
import { dispatchPendingCarrierEvents, requeueEvents } from "@/lib/carrier-events";

/** Re-queue FAILED (dead-lettered) or NOT_CONFIGURED outbox events. */
export async function requeueOutboxAction(formData: FormData): Promise<void> {
  await getRequiredAdminSession();
  const status = formData.get("status");
  if (status !== "FAILED" && status !== "NOT_CONFIGURED") return;
  const carrier = formData.get("carrier");
  await requeueEvents({
    status,
    carrier: typeof carrier === "string" && carrier ? carrier : undefined,
  });
  revalidatePath("/admin/operations");
}

/** Run a dispatch pass now instead of waiting for cron. */
export async function dispatchNowAction(): Promise<void> {
  await getRequiredAdminSession();
  await dispatchPendingCarrierEvents();
  revalidatePath("/admin/operations");
}
