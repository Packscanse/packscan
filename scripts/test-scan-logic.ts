/**
 * Exercises registerScan/advanceStatus/cancelPackage for all three flows
 * against the real database. Run: npx tsx scripts/test-scan-logic.ts
 */
import { prisma } from "../src/lib/prisma";
import { registerScan, cancelPackage } from "../src/lib/packages";

const TEST_PREFIX = "PKSTEST";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const store = await prisma.store.findUniqueOrThrow({ where: { code: "DEMO-01" } });
  const clerk = await prisma.user.findUniqueOrThrow({ where: { email: "clerk@packscan.local" } });
  const ctx = { storeId: store.id, userId: clerk.id };

  // Clean slate for rerunnability
  await prisma.package.deleteMany({
    where: { storeId: store.id, trackingNumber: { startsWith: TEST_PREFIX } },
  });

  const base = {
    ...ctx,
    carrier: "POSTNORD" as const,
    carrierManual: false,
    inputMethod: "MANUAL_ENTRY" as const,
  };

  // --- Flow 1: plain inventory log ---
  const log1 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}LOG1`, flow: "INBOUND_LOG" });
  check("plain log: first scan creates LOGGED", log1.ok && log1.kind === "created" && log1.package.status === "LOGGED");
  const log2 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}LOG1`, flow: "INBOUND_LOG" });
  check("plain log: rescan rejected as terminal", !log2.ok && log2.code === "TERMINAL_STATUS");

  // --- Flow 2: customer pickup with notification ---
  const pick1 = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}PICK1`,
    flow: "INBOUND_PICKUP",
    customerName: "Test Customer",
    customerPhone: "+46701234567",
  });
  check("pickup: arrival creates AWAITING_PICKUP", pick1.ok && pick1.kind === "created" && pick1.package.status === "AWAITING_PICKUP");

  const pick2 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}PICK1`, flow: "INBOUND_PICKUP" });
  check(
    "pickup: rescan transitions to PICKED_UP",
    pick2.ok && pick2.kind === "transitioned" && pick2.package.status === "PICKED_UP" && pick2.fromStatus === "AWAITING_PICKUP"
  );
  const pick3 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}PICK1`, flow: "INBOUND_PICKUP" });
  check("pickup: third scan rejected as terminal", !pick3.ok && pick3.code === "TERMINAL_STATUS");

  if (pick1.ok) {
    const notifications = await prisma.notification.findMany({
      where: { packageId: pick1.package.id },
      orderBy: { createdAt: "asc" },
    });
    check(
      "pickup: SMS WOULD_SEND notifications for arrival + pickup",
      notifications.length === 2 &&
        notifications.every((n) => n.channel === "SMS" && n.status === "WOULD_SEND") &&
        notifications[0].trigger === "AWAITING_PICKUP" &&
        notifications[1].trigger === "PICKED_UP",
      notifications.map((n) => `${n.trigger}:${n.status}`).join(", ")
    );
  }

  // --- Flow 3: outbound handoff ---
  const hand1 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}HAND1`, flow: "OUTBOUND_HANDOFF" });
  check("handoff: first scan creates PENDING_HANDOFF", hand1.ok && hand1.kind === "created" && hand1.package.status === "PENDING_HANDOFF");
  const hand2 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}HAND1`, flow: "OUTBOUND_HANDOFF" });
  check("handoff: rescan transitions to HANDED_OFF", hand2.ok && hand2.kind === "transitioned" && hand2.package.status === "HANDED_OFF");

  // --- Same tracking number, both directions = two distinct packages ---
  const both = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}HAND1`, flow: "INBOUND_LOG" });
  check("same tracking number allowed in other direction", both.ok && both.kind === "created");

  // --- Cancel from non-terminal ---
  const cans = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}CANCEL1`, flow: "INBOUND_PICKUP" });
  if (cans.ok) {
    const cancelled = await cancelPackage({ pkg: cans.package, ...ctx });
    check("cancel: AWAITING_PICKUP can be cancelled", cancelled.ok && cancelled.package.status === "CANCELLED");
    const again = await cancelPackage({ pkg: cancelled.ok ? cancelled.package : cans.package, ...ctx });
    check("cancel: CANCELLED cannot be cancelled again", !again.ok && again.code === "INVALID_ACTION");
  }

  // --- Audit trail ---
  const events = await prisma.scanEvent.count({
    where: { storeId: store.id, package: { trackingNumber: { startsWith: TEST_PREFIX } } },
  });
  check("audit: expected 8 scan events recorded", events === 8, `got ${events}`);

  // No notifications for flows without contact info
  const noContactNotifs = await prisma.notification.count({
    where: { package: { trackingNumber: { in: [`${TEST_PREFIX}LOG1`, `${TEST_PREFIX}HAND1`, `${TEST_PREFIX}CANCEL1`] } } },
  });
  check("no notifications without contact info", noContactNotifs === 0, `got ${noContactNotifs}`);

  // Cleanup
  await prisma.package.deleteMany({
    where: { storeId: store.id, trackingNumber: { startsWith: TEST_PREFIX } },
  });

  console.log(failures === 0 ? "\nAll scan-logic checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
