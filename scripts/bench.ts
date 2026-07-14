/**
 * Response-time benchmark for the counter-critical operations, run against
 * the real database. Numbers from a laptop include the network round-trips
 * to the hosted DB; a co-located production deployment will be faster.
 * Run: npm run bench
 */
import { prisma } from "../src/lib/prisma";
import { registerScan } from "../src/lib/packages";

const PREFIX = "PKSBENCH";
const RUNS = 15;

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { avg, p50: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] };
}

function report(label: string, samples: number[]) {
  const s = stats(samples);
  console.log(
    `${label.padEnd(34)} avg ${s.avg.toFixed(0).padStart(5)} ms · p50 ${s.p50
      .toFixed(0)
      .padStart(5)} ms · p95 ${s.p95.toFixed(0).padStart(5)} ms · max ${s.max.toFixed(0).padStart(5)} ms`
  );
}

async function cleanup(storeId: string) {
  await prisma.preAdvice.deleteMany({ where: { storeId, trackingNumber: { startsWith: PREFIX } } });
  await prisma.scanEvent.deleteMany({
    where: { storeId, package: { trackingNumber: { startsWith: PREFIX } } },
  });
  await prisma.package.deleteMany({ where: { storeId, trackingNumber: { startsWith: PREFIX } } });
}

async function main() {
  const store = await prisma.store.findUniqueOrThrow({ where: { code: "DEMO-01" } });
  const clerk = await prisma.user.findUniqueOrThrow({ where: { email: "clerk@packscan.local" } });
  await cleanup(store.id);

  // Warm up connection pool / JIT before measuring.
  await prisma.package.count({ where: { storeId: store.id } });

  const base = {
    storeId: store.id,
    userId: clerk.id,
    carrier: "POSTNORD" as const,
    carrierManual: false,
    inputMethod: "HARDWARE_SCANNER" as const,
  };

  const intake: number[] = [];
  const handover: number[] = [];
  const listQuery: number[] = [];
  const adviceLookup: number[] = [];

  for (let i = 0; i < RUNS; i++) {
    const trackingNumber = `${PREFIX}${String(i).padStart(4, "0")}`;

    let t = performance.now();
    await registerScan({
      ...base,
      trackingNumber,
      flow: "INBOUND_PICKUP",
      customerName: "Bench Customer",
      shelfLocation: "B1",
    });
    intake.push(performance.now() - t);

    t = performance.now();
    await registerScan({
      ...base,
      trackingNumber,
      flow: "INBOUND_PICKUP",
      verification: { presentedCode: "BENCH-QR", idChecked: true, idType: "PASSPORT" },
    });
    handover.push(performance.now() - t);

    t = performance.now();
    await prisma.package.findMany({
      where: { storeId: store.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    listQuery.push(performance.now() - t);

    t = performance.now();
    await prisma.preAdvice.findUnique({
      where: { storeId_trackingNumber: { storeId: store.id, trackingNumber } },
    });
    adviceLookup.push(performance.now() - t);
  }

  console.log(`\n${RUNS} runs against ${process.env.DATABASE_URL?.split("@")[1]?.split(":")[0] ?? "db"}\n`);
  report("Intake (create + events + outbox)", intake);
  report("Verified handover (gate + POD)", handover);
  report("Packages list (50 rows)", listQuery);
  report("Pre-advice lookup (per scan)", adviceLookup);

  await cleanup(store.id);
  console.log("\nBench data cleaned up.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
