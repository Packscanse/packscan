/**
 * Exercises registerScan/advanceStatus/cancelPackage for all three flows
 * against the real database. Run: npx tsx scripts/test-scan-logic.ts
 */
import { prisma } from "../src/lib/prisma";
import { advanceStatus, cancelPackage, markForReturn, registerScan } from "../src/lib/packages";

const TEST_PREFIX = "PKSTEST";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// ScanEvent → Package is Restrict: audit rows must be deleted explicitly
// before their packages can go.
async function deleteTestData(storeId: string) {
  const where = { storeId, package: { trackingNumber: { startsWith: TEST_PREFIX } } };
  await prisma.preAdvice.deleteMany({
    where: { storeId, trackingNumber: { startsWith: TEST_PREFIX } },
  });
  await prisma.scanEvent.deleteMany({ where });
  await prisma.package.deleteMany({
    where: { storeId, trackingNumber: { startsWith: TEST_PREFIX } },
  });
}

async function main() {
  const store = await prisma.store.findUniqueOrThrow({ where: { code: "DEMO-01" } });
  const clerk = await prisma.user.findUniqueOrThrow({ where: { email: "clerk@packscan.local" } });
  const ctx = { storeId: store.id, userId: clerk.id };

  // Clean slate for rerunnability
  await deleteTestData(store.id);

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

  // --- Flow 2: customer pickup, gated by carrier verification ---
  const pick1 = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}PICK1`,
    flow: "INBOUND_PICKUP",
    customerName: "Test Customer",
    customerPhone: "+46701234567",
    shelfLocation: "A3",
  });
  check("pickup: arrival creates AWAITING_PICKUP", pick1.ok && pick1.kind === "created" && pick1.package.status === "AWAITING_PICKUP");
  check("pickup: shelf location stored", pick1.ok && pick1.package.shelfLocation === "A3");

  const labelRescan = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}PICK1`,
    flow: "INBOUND_PICKUP",
    verification: { presentedCode: `${TEST_PREFIX}PICK1`, idChecked: true, idType: "PASSPORT" },
  });
  check("pickup: parcel's own label rejected as evidence", !labelRescan.ok && labelRescan.code === "VERIFICATION_FAILED");

  const noVerify = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}PICK1`, flow: "INBOUND_PICKUP" });
  check(
    "pickup: rescan without verification demands it",
    !noVerify.ok && noVerify.code === "VERIFICATION_REQUIRED" &&
      noVerify.handover.customerName === "Test Customer"
  );

  const noCode = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}PICK1`,
    flow: "INBOUND_PICKUP",
    verification: { idChecked: true, idType: "PASSPORT" },
  });
  check("pickup: PostNord demands the carrier-app code", !noCode.ok && noCode.code === "VERIFICATION_FAILED");

  const noId = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}PICK1`,
    flow: "INBOUND_PICKUP",
    verification: { presentedCode: "PN-APP-QR-PAYLOAD-1", idChecked: false },
  });
  check("pickup: PostNord requires ID as well as code", !noId.ok && noId.code === "VERIFICATION_FAILED");

  const pick2 = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}PICK1`,
    flow: "INBOUND_PICKUP",
    verification: { presentedCode: "PN-APP-QR-PAYLOAD-1", idChecked: true, idType: "PASSPORT" },
  });
  check(
    "pickup: verified rescan transitions to PICKED_UP",
    pick2.ok && pick2.kind === "transitioned" && pick2.package.status === "PICKED_UP" && pick2.fromStatus === "AWAITING_PICKUP"
  );
  const pick3 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}PICK1`, flow: "INBOUND_PICKUP" });
  check("pickup: third scan rejected as terminal", !pick3.ok && pick3.code === "TERMINAL_STATUS");

  if (pick1.ok) {
    const verification = await prisma.handoverVerification.findFirst({
      where: { scanEvent: { packageId: pick1.package.id } },
    });
    check(
      "pickup: handover proof persisted on the audit event",
      verification?.presentedCode === "PN-APP-QR-PAYLOAD-1" &&
        verification.idChecked === true &&
        verification.idType === "PASSPORT"
    );

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

  // --- Manager override: stranded customer, mandatory reason ---
  const ovr1 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}OVR01`, flow: "INBOUND_PICKUP" });
  const ovrNoReason = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}OVR01`,
    flow: "INBOUND_PICKUP",
    verification: { idChecked: false, override: true },
  });
  check("override: blocked without a reason", !ovrNoReason.ok && ovrNoReason.code === "VERIFICATION_FAILED");
  const ovr2 = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}OVR01`,
    flow: "INBOUND_PICKUP",
    verification: { idChecked: false, override: true, overrideReason: "Phone dead, known regular customer" },
  });
  check("override: completes the pickup with a reason", ovr2.ok && ovr2.package.status === "PICKED_UP");
  if (ovr1.ok) {
    const ovrRecord = await prisma.handoverVerification.findFirst({
      where: { scanEvent: { packageId: ovr1.package.id } },
    });
    check(
      "override: flagged on the audit record with the reason",
      ovrRecord?.override === true && ovrRecord.overrideReason === "Phone dead, known regular customer"
    );
  }

  // --- Returns: overdue pickup goes back to the carrier ---
  const ret1 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}RET01`, flow: "INBOUND_PICKUP" });
  if (ret1.ok) {
    const marked = await markForReturn({ pkg: ret1.package, ...ctx, reason: "Deadline passed" });
    check("return: AWAITING_PICKUP marked RETURN_PENDING", marked.ok && marked.package.status === "RETURN_PENDING");
    const returned = marked.ok
      ? await advanceStatus({
          pkg: marked.package,
          ...ctx,
          inputMethod: "STATUS_ACTION",
          courierRef: "ROUTE-42 / driver 117",
        })
      : marked;
    check("return: driver collection completes RETURNED_TO_CARRIER", returned.ok && returned.package.status === "RETURNED_TO_CARRIER");
    const returnEvent = await prisma.scanEvent.findFirst({
      where: { packageId: ret1.package.id, toStatus: "RETURNED_TO_CARRIER" },
    });
    check("return: courier reference recorded", returnEvent?.courierRef === "ROUTE-42 / driver 117");
    const again = returned.ok
      ? await markForReturn({ pkg: returned.package, ...ctx })
      : returned;
    check("return: terminal package cannot be marked again", !again.ok);
  }

  // --- Pre-advice: announced parcel links and closes at intake ---
  await prisma.preAdvice.create({
    data: {
      storeId: store.id,
      carrier: "POSTNORD",
      trackingNumber: `${TEST_PREFIX}PA01`,
      customerName: "Announced Customer",
      customerPhone: "+46707777777",
    },
  });
  const pa1 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}PA01`, flow: "INBOUND_PICKUP", customerName: "Announced Customer" });
  const advice = await prisma.preAdvice.findUnique({
    where: { storeId_trackingNumber: { storeId: store.id, trackingNumber: `${TEST_PREFIX}PA01` } },
  });
  check(
    "pre-advice: intake marks it RECEIVED and links the package",
    pa1.ok && advice?.status === "RECEIVED" && advice.packageId === (pa1.ok ? pa1.package.id : null)
  );

  // --- FedEx pickup: ID-only policy, no proxy pickup ---
  const fed1 = await registerScan({
    ...base,
    carrier: "FEDEX" as const,
    trackingNumber: `${TEST_PREFIX}FED01`,
    flow: "INBOUND_PICKUP",
  });
  check("fedex pickup: created", fed1.ok && fed1.kind === "created");
  const fedProxy = await registerScan({
    ...base,
    carrier: "FEDEX" as const,
    trackingNumber: `${TEST_PREFIX}FED01`,
    flow: "INBOUND_PICKUP",
    verification: { idChecked: true, idType: "PASSPORT", collectorName: "Someone Else" },
  });
  check("fedex pickup: proxy pickup rejected", !fedProxy.ok && fedProxy.code === "VERIFICATION_FAILED");
  const fed2 = await registerScan({
    ...base,
    carrier: "FEDEX" as const,
    trackingNumber: `${TEST_PREFIX}FED01`,
    flow: "INBOUND_PICKUP",
    verification: { idChecked: true, idType: "DRIVERS_LICENSE" },
  });
  check("fedex pickup: ID check alone completes it", fed2.ok && fed2.package.status === "PICKED_UP");

  // --- Flow 3: outbound handoff from a private sender (no verification gate) ---
  const hand1 = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}HAND1`,
    flow: "OUTBOUND_HANDOFF",
    customerName: "Private Sender",
    customerPhone: "+46708888888",
  });
  check("handoff: first scan creates PENDING_HANDOFF", hand1.ok && hand1.kind === "created" && hand1.package.status === "PENDING_HANDOFF");
  check("handoff: sender contact stored on the package", hand1.ok && hand1.package.customerName === "Private Sender");
  const hand2 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}HAND1`, flow: "OUTBOUND_HANDOFF" });
  check("handoff: rescan transitions to HANDED_OFF", hand2.ok && hand2.kind === "transitioned" && hand2.package.status === "HANDED_OFF");
  const handNotifs = await prisma.notification.count({
    where: { package: { trackingNumber: `${TEST_PREFIX}HAND1`, direction: "OUTBOUND" } },
  });
  check("handoff: outbound never notifies, even with contact info", handNotifs === 0, `got ${handNotifs}`);

  // --- Same tracking number, both directions = two distinct packages ---
  const both = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}HAND1`, flow: "INBOUND_LOG" });
  check("same tracking number allowed in other direction", both.ok && both.kind === "created");

  // --- Cancel requires a reason, which lands on the audit event ---
  const cans = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}CANCEL1`, flow: "INBOUND_PICKUP" });
  if (cans.ok) {
    const noReason = await cancelPackage({ pkg: cans.package, ...ctx, reason: "  " });
    check("cancel: blank reason rejected", !noReason.ok && noReason.code === "INVALID_ACTION");
    const cancelled = await cancelPackage({ pkg: cans.package, ...ctx, reason: "Scanned the wrong label" });
    check("cancel: AWAITING_PICKUP can be cancelled with a reason", cancelled.ok && cancelled.package.status === "CANCELLED");
    const cancelEvent = await prisma.scanEvent.findFirst({
      where: { packageId: cans.package.id, toStatus: "CANCELLED" },
    });
    check("cancel: reason recorded on the event", cancelEvent?.note === "Scanned the wrong label");
    const again = await cancelPackage({
      pkg: cancelled.ok ? cancelled.package : cans.package,
      ...ctx,
      reason: "again",
    });
    check("cancel: CANCELLED cannot be cancelled again", !again.ok && again.code === "INVALID_ACTION");
  }

  // --- Audit trail ---
  const events = await prisma.scanEvent.count({
    where: { storeId: store.id, package: { trackingNumber: { startsWith: TEST_PREFIX } } },
  });
  check("audit: expected 16 scan events recorded", events === 16, `got ${events}`);

  // Audit rows survive package deletion attempts (Restrict, not Cascade)
  if (log1.ok) {
    const restricted = await prisma.package
      .delete({ where: { id: log1.package.id } })
      .then(() => false)
      .catch(() => true);
    check("audit: deleting a package with scan history is blocked", restricted);
  }

  // No notifications for flows without contact info
  const noContactNotifs = await prisma.notification.count({
    where: { package: { trackingNumber: { in: [`${TEST_PREFIX}LOG1`, `${TEST_PREFIX}FED01`, `${TEST_PREFIX}CANCEL1`] } } },
  });
  check("no notifications without contact info", noContactNotifs === 0, `got ${noContactNotifs}`);

  // Cleanup
  await deleteTestData(store.id);

  console.log(failures === 0 ? "\nAll scan-logic checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
