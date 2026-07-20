/**
 * Exercises registerScan/advanceStatus/cancelPackage for all three flows
 * against the real database. Run: npx tsx scripts/test-scan-logic.ts
 */
import { prisma } from "../src/lib/prisma";
import { advanceStatus, cancelPackage, markForReturn, registerScan } from "../src/lib/packages";
import { lookupScanContext } from "../src/lib/scan-flow";
import { dispatchEventsForPackage, requeueEvents } from "../src/lib/carrier-events";
import { ingestCarrierEvents } from "../src/lib/carrier-ingest";
import { postnordProvider } from "../src/lib/carriers/rules/postnord";

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
  // Alerts survive package deletion (packageId → null); match on the
  // tracking number embedded in the message.
  await prisma.adminAlert.deleteMany({
    where: { storeId, message: { contains: TEST_PREFIX } },
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

  // --- Flow 1: plain inventory log (with an offline-sync audit note) ---
  const log1 = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}LOG1`,
    flow: "INBOUND_LOG",
    note: "Offline scan captured 2026-07-05T08:00:00.000Z",
  });
  check("plain log: first scan creates LOGGED", log1.ok && log1.kind === "created" && log1.package.status === "LOGGED");
  if (log1.ok) {
    const createEvent = await prisma.scanEvent.findFirst({ where: { packageId: log1.package.id } });
    check("audit: note recorded on the create event", createEvent?.note?.startsWith("Offline scan captured") === true);
  }
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

  // --- Carrier code validation seam (simulating a configured API) ---
  const val1 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}VAL01`, flow: "INBOUND_PICKUP" });
  const realVerify = postnordProvider.verifyPickupCode;
  try {
    postnordProvider.verifyPickupCode = async () => ({ status: "INVALID" as const });
    const rejected = await registerScan({
      ...base,
      trackingNumber: `${TEST_PREFIX}VAL01`,
      flow: "INBOUND_PICKUP",
      verification: { presentedCode: "STALE-CODE", idChecked: true, idType: "PASSPORT" },
    });
    check("code validation: carrier INVALID blocks the handover", !rejected.ok && rejected.code === "VERIFICATION_FAILED");

    postnordProvider.verifyPickupCode = async () => ({ status: "VALID" as const });
    const accepted = await registerScan({
      ...base,
      trackingNumber: `${TEST_PREFIX}VAL01`,
      flow: "INBOUND_PICKUP",
      verification: { presentedCode: "FRESH-CODE", idChecked: true, idType: "PASSPORT" },
    });
    check("code validation: carrier VALID completes the handover", accepted.ok && accepted.package.status === "PICKED_UP");
    if (val1.ok) {
      const record = await prisma.handoverVerification.findFirst({
        where: { scanEvent: { packageId: val1.package.id } },
      });
      check("code validation: codeValidated persisted on the proof", record?.codeValidated === true);
    }
  } finally {
    postnordProvider.verifyPickupCode = realVerify;
  }

  // --- Manager override: admin-only, stranded customer, mandatory reason ---
  const ovr1 = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}OVR01`, flow: "INBOUND_PICKUP" });
  const ovrClerk = await registerScan({
    ...base,
    actorRole: "CLERK" as const,
    trackingNumber: `${TEST_PREFIX}OVR01`,
    flow: "INBOUND_PICKUP",
    verification: { idChecked: false, override: true, overrideReason: "clerk trying" },
  });
  check("override: clerk role rejected", !ovrClerk.ok && ovrClerk.code === "VERIFICATION_FAILED");
  const ovrNoReason = await registerScan({
    ...base,
    actorRole: "ADMIN" as const,
    trackingNumber: `${TEST_PREFIX}OVR01`,
    flow: "INBOUND_PICKUP",
    verification: { idChecked: false, override: true },
  });
  check("override: blocked without a reason", !ovrNoReason.ok && ovrNoReason.code === "VERIFICATION_FAILED");
  const ovr2 = await registerScan({
    ...base,
    actorRole: "ADMIN" as const,
    trackingNumber: `${TEST_PREFIX}OVR01`,
    flow: "INBOUND_PICKUP",
    verification: { idChecked: false, override: true, overrideReason: "Phone dead, known regular customer" },
  });
  check("override: admin completes the pickup with a reason", ovr2.ok && ovr2.package.status === "PICKED_UP");
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

  // --- Carrier ingest (the inbound webhook's engine): upsert semantics ---
  const ing1 = await ingestCarrierEvents({
    carrier: "SCHENKER",
    storeCode: "DEMO-01",
    parcels: [{ trackingNumber: `${TEST_PREFIX}ING01`, customerName: "First Name", customerPhone: "+46701111111" }],
  });
  check("ingest: announced parcel created", ing1.ok && ing1.created === 1);
  const ing2 = await ingestCarrierEvents({
    carrier: "SCHENKER",
    storeCode: "DEMO-01",
    parcels: [{ trackingNumber: `${TEST_PREFIX}ING01`, customerName: "Corrected Name" }],
  });
  const ingAdvice = await prisma.preAdvice.findUnique({
    where: { storeId_trackingNumber: { storeId: store.id, trackingNumber: `${TEST_PREFIX}ING01` } },
  });
  check(
    "ingest: re-announcement updates contact while ANNOUNCED",
    ing2.ok && ing2.updated === 1 && ingAdvice?.customerName === "Corrected Name" && ingAdvice.carrier === "SCHENKER"
  );
  const ingScan = await registerScan({
    ...base,
    carrier: "SCHENKER" as const,
    trackingNumber: `${TEST_PREFIX}ING01`,
    flow: "INBOUND_PICKUP",
    customerName: "Corrected Name",
  });
  const ing3 = await ingestCarrierEvents({
    carrier: "SCHENKER",
    storeCode: "DEMO-01",
    parcels: [{ trackingNumber: `${TEST_PREFIX}ING01`, customerName: "Too Late" }],
  });
  check(
    "ingest: RECEIVED pre-advice never touched by later events",
    ingScan.ok && ing3.ok && ing3.skippedReceived === 1
  );
  const ingBadStore = await ingestCarrierEvents({
    carrier: "DHL",
    storeCode: "NOPE-99",
    parcels: [{ trackingNumber: `${TEST_PREFIX}ING02` }],
  });
  check("ingest: unknown store rejected", !ingBadStore.ok);

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

  // --- Carrier event outbox: enqueued atomically, dispatched immediately ---
  // With no API credentials every event lands as NOT_CONFIGURED (never lost,
  // re-queueable when credentials arrive).
  const outbox = await prisma.carrierEventOutbox.findMany({
    where: { package: { trackingNumber: { startsWith: TEST_PREFIX } } },
    select: { eventType: true, status: true },
  });
  const outboxTypes = outbox.map((e) => e.eventType).sort();
  check(
    "outbox: arrival, pickup, outbound-accept, and return events queued",
    outboxTypes.includes("ARRIVAL") &&
      outboxTypes.includes("PICKED_UP") &&
      outboxTypes.includes("ACCEPTED_OUTBOUND") &&
      outboxTypes.includes("RETURNED"),
    outboxTypes.join(", ")
  );
  check(
    "outbox: all events attempted, none stuck PENDING",
    outbox.length > 0 && outbox.every((e) => e.status === "NOT_CONFIGURED"),
    outbox.map((e) => `${e.eventType}:${e.status}`).join(", ")
  );

  // Dead-lettered events can be re-queued (same path backfills events once
  // a carrier's API credentials arrive).
  const someEvent = await prisma.carrierEventOutbox.findFirst({
    where: { package: { trackingNumber: { startsWith: TEST_PREFIX } } },
  });
  if (someEvent) {
    await prisma.carrierEventOutbox.update({
      where: { id: someEvent.id },
      data: { status: "FAILED", attempts: 20, lastError: "simulated dead-letter" },
    });
    const requeued = await requeueEvents({ status: "FAILED" });
    const after = await prisma.carrierEventOutbox.findUniqueOrThrow({ where: { id: someEvent.id } });
    check(
      "outbox: dead-lettered event re-queued with reset attempts",
      requeued >= 1 && after.status === "PENDING" && after.attempts === 0 && after.lastError === null
    );
    // Leave the table clean for the earlier all-NOT_CONFIGURED invariant on reruns.
    await prisma.carrierEventOutbox.update({
      where: { id: someEvent.id },
      data: { status: "NOT_CONFIGURED" },
    });
  }

  // --- Dead-letter: exhausting MAX_ATTEMPTS raises an AdminAlert ---
  // A NOT_CONFIGURED result is a clean outcome, so make delivery THROW by
  // patching the provider; with attempts already at 19 the next failure is
  // the 20th — the event dead-letters and "attempt 21" becomes an alert.
  const dl = await registerScan({ ...base, trackingNumber: `${TEST_PREFIX}DEADL1`, flow: "INBOUND_PICKUP" });
  if (dl.ok) {
    const dlEvent = await prisma.carrierEventOutbox.findFirstOrThrow({
      where: { packageId: dl.package.id, eventType: "ARRIVAL" },
    });
    await prisma.carrierEventOutbox.update({
      where: { id: dlEvent.id },
      data: { status: "PENDING", attempts: 19, nextAttemptAt: new Date() },
    });
    const originalReportArrival = postnordProvider.reportArrival;
    postnordProvider.reportArrival = async () => {
      throw new Error("simulated carrier outage");
    };
    try {
      await dispatchEventsForPackage(dl.package.id);
    } finally {
      postnordProvider.reportArrival = originalReportArrival;
    }
    const deadRow = await prisma.carrierEventOutbox.findUniqueOrThrow({
      where: { id: dlEvent.id },
    });
    check(
      "dead-letter: 20th failed attempt marks the event FAILED",
      deadRow.status === "FAILED" && deadRow.attempts === 20,
      `${deadRow.status} after ${deadRow.attempts} attempts`
    );
    const alert = await prisma.adminAlert.findFirst({
      where: { storeId: store.id, packageId: dl.package.id, type: "CARRIER_EVENT_FAILED" },
    });
    check(
      "dead-letter: AdminAlert raised for the store, unresolved, names the parcel",
      alert !== null &&
        alert.resolvedAt === null &&
        alert.message.includes(`${TEST_PREFIX}DEADL1`) &&
        alert.message.includes("simulated carrier outage"),
      alert?.message ?? "no alert row"
    );
    const alertCount = await prisma.adminAlert.count({
      where: { storeId: store.id, packageId: dl.package.id },
    });
    check("dead-letter: exactly one alert per exhaustion", alertCount === 1, String(alertCount));
  }

  // --- Concurrent duplicate scan: the create race resolves gracefully ---
  const [race1, race2] = await Promise.all([
    registerScan({ ...base, trackingNumber: `${TEST_PREFIX}RACE1`, flow: "INBOUND_LOG" }),
    registerScan({ ...base, trackingNumber: `${TEST_PREFIX}RACE1`, flow: "INBOUND_LOG" }),
  ]);
  const raceCreated = [race1, race2].filter((r) => r.ok && r.kind === "created").length;
  const raceHandled = [race1, race2].every((r) => r.ok || r.code === "TERMINAL_STATUS");
  check(
    "race: two simultaneous first scans — one creates, none crash",
    raceCreated === 1 && raceHandled,
    [race1, race2].map((r) => (r.ok ? r.kind : r.code)).join(" / ")
  );

  // --- Audit trail ---
  const events = await prisma.scanEvent.count({
    where: { storeId: store.id, package: { trackingNumber: { startsWith: TEST_PREFIX } } },
  });
  check("audit: expected 21 scan events recorded", events === 21, `got ${events}`);

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

  // --- Concurrent duplicate pickup: the compare-and-swap on the source status
  //     stops a double-tap / two-clerk race from writing two PICKED_UP events
  //     (and, with them, two customer notifications). ---
  const traceScan = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}TRACE1`,
    flow: "INBOUND_PICKUP",
    customerName: "Race Customer",
    customerPhone: "+46700000099",
  });
  if (traceScan.ok && traceScan.kind === "created") {
    const verification = { presentedCode: "PN-APP-QR-PAYLOAD-9", idChecked: true, idType: "PASSPORT" as const };
    // Both callers hold the same AWAITING_PICKUP snapshot and fire at once.
    const [h1, h2] = await Promise.all([
      advanceStatus({ ...ctx, pkg: traceScan.package, inputMethod: "MANUAL_ENTRY", verification }),
      advanceStatus({ ...ctx, pkg: traceScan.package, inputMethod: "MANUAL_ENTRY", verification }),
    ]);
    const completed = [h1, h2].filter((r) => r.ok && r.kind === "transitioned").length;
    const rejected = [h1, h2].filter((r) => !r.ok && r.code === "INVALID_ACTION").length;
    check(
      "race: two simultaneous pickups — exactly one completes, one is rejected",
      completed === 1 && rejected === 1,
      [h1, h2].map((r) => (r.ok ? r.kind : r.code)).join(" / ")
    );
    const picked = await prisma.scanEvent.count({
      where: { packageId: traceScan.package.id, toStatus: "PICKED_UP" },
    });
    check("race: only one PICKED_UP event written", picked === 1, `got ${picked}`);
  }

  // --- Visit companions: one customer's shelf parcels group by phone
  //     (strong key) or exact name (case-insensitive); parcels without
  //     contact info must never cross-match. ---
  await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}VISITA`,
    flow: "INBOUND_PICKUP",
    customerName: "Visit Kund",
    customerPhone: "+46700000042",
    shelfLocation: "V1",
  });
  await registerScan({
    ...base,
    carrier: "DHL" as const,
    trackingNumber: `${TEST_PREFIX}VISITB`,
    flow: "INBOUND_PICKUP",
    customerName: "visit kund", // name-only match, different casing
    shelfLocation: "V2",
  });
  await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}VISITC`,
    flow: "INBOUND_PICKUP",
    customerName: "Annan Mottagare", // phone-only match
    customerPhone: "+46700000042",
    shelfLocation: "V3",
  });
  await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}VISITD`,
    flow: "INBOUND_PICKUP", // anonymous walk-in: no name, no phone
  });

  const visitLookup = await lookupScanContext(store.id, `${TEST_PREFIX}VISITA`);
  check(
    "visit: scanned parcel resolves to its handover context",
    visitLookup.handover?.trackingNumber === `${TEST_PREFIX}VISITA`
  );
  const companionTrackings = visitLookup.companions.map((c) => c.trackingNumber).sort();
  check(
    "visit: phone match and case-insensitive name match group; anonymous stays out",
    companionTrackings.join(",") === `${TEST_PREFIX}VISITB,${TEST_PREFIX}VISITC`,
    companionTrackings.join(",") || "none"
  );
  const anonLookup = await lookupScanContext(store.id, `${TEST_PREFIX}VISITD`);
  check(
    "visit: anonymous parcel gets no companions",
    anonLookup.handover !== null && anonLookup.companions.length === 0,
    `got ${anonLookup.companions.length}`
  );

  // --- Proxy pickup: counter practice demands both documents — the
  //     collector's own ID and the addressee's. One is never enough. ---
  const proxyScan = await registerScan({
    ...base,
    trackingNumber: `${TEST_PREFIX}PROXY1`,
    flow: "INBOUND_PICKUP",
    customerName: "Proxy Mottagare",
  });
  if (proxyScan.ok && proxyScan.kind === "created") {
    const oneId = await advanceStatus({
      ...ctx,
      pkg: proxyScan.package,
      inputMethod: "MANUAL_ENTRY",
      verification: {
        presentedCode: "PN-PROXY-CODE-1",
        idChecked: true,
        idType: "PASSPORT" as const,
        collectorName: "Ombud Person",
      },
    });
    check(
      "proxy: one ID is rejected when someone else collects",
      !oneId.ok && oneId.code === "VERIFICATION_FAILED"
    );
    const bothIds = await advanceStatus({
      ...ctx,
      pkg: proxyScan.package,
      inputMethod: "MANUAL_ENTRY",
      verification: {
        presentedCode: "PN-PROXY-CODE-1",
        idChecked: true,
        idType: "PASSPORT" as const,
        collectorName: "Ombud Person",
        collectorIdChecked: true,
        collectorIdType: "DRIVERS_LICENSE" as const,
      },
    });
    check("proxy: both IDs complete the pickup", bothIds.ok && bothIds.kind === "transitioned");
    const proxyRecord = await prisma.handoverVerification.findFirst({
      where: { scanEvent: { packageId: proxyScan.package.id } },
    });
    check(
      "proxy: collector's ID recorded with its type",
      proxyRecord?.collectorIdChecked === true &&
        proxyRecord?.collectorIdType === "DRIVERS_LICENSE"
    );
  }

  // Cleanup
  await deleteTestData(store.id);

  console.log(failures === 0 ? "\nAll scan-logic checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
