/**
 * Carrier-event outbox retry pass: delivers every due PENDING event with
 * exponential backoff (dead-letters to FAILED after 20 attempts). The scan
 * flow already attempts immediately; run this from cron for the retries.
 * Run: npm run dispatch:events
 */
import { prisma } from "../src/lib/prisma";
import { dispatchPendingCarrierEvents } from "../src/lib/carrier-events";

async function main() {
  const counts = await dispatchPendingCarrierEvents();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    total === 0
      ? "No carrier events due."
      : `Dispatched ${total} event(s): ${Object.entries(counts)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`
  );
  const backlog = await prisma.carrierEventOutbox.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log(
    "Outbox:",
    backlog.map((b) => `${b.status}=${b._count._all}`).join(", ") || "empty"
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
