/**
 * PII retention job: strips customer/sender contact data once it has no
 * operational use — packages in a terminal status untouched for RETENTION_DAYS
 * (default 90, override via PII_RETENTION_DAYS). Deletes their notification
 * rows too (messages embed the recipient), and clears contact details from
 * consumed pre-advice. The parcel and its full audit trail remain.
 *
 * Run manually or from cron:  npm run purge:pii
 */
import { prisma } from "../src/lib/prisma";
import type { PackageStatus } from "@prisma/client";

const RETENTION_DAYS = Number.parseInt(process.env.PII_RETENTION_DAYS ?? "90", 10);

const TERMINAL: PackageStatus[] = [
  "LOGGED",
  "PICKED_UP",
  "HANDED_OFF",
  "RETURNED_TO_CARRIER",
  "CANCELLED",
];

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  console.log(`Purging contact data for terminal packages untouched since ${cutoff.toISOString()} (${RETENTION_DAYS} days)…`);

  const staleWhere = {
    status: { in: TERMINAL },
    updatedAt: { lt: cutoff },
    OR: [
      { customerName: { not: null } },
      { customerPhone: { not: null } },
      { customerEmail: { not: null } },
    ],
  };

  const notifications = await prisma.notification.deleteMany({
    where: { package: { status: { in: TERMINAL }, updatedAt: { lt: cutoff } } },
  });
  const packages = await prisma.package.updateMany({
    where: staleWhere,
    data: { customerName: null, customerPhone: null, customerEmail: null },
  });
  const preAdvice = await prisma.preAdvice.updateMany({
    where: {
      status: "RECEIVED",
      receivedAt: { lt: cutoff },
      OR: [
        { customerName: { not: null } },
        { customerPhone: { not: null } },
        { customerEmail: { not: null } },
      ],
    },
    data: { customerName: null, customerPhone: null, customerEmail: null },
  });

  // Announced-but-never-arrived pre-advice would otherwise hold recipient
  // PII forever; after the announce window it has no operational value.
  const announceCutoff = new Date(
    Date.now() - Number.parseInt(process.env.PREADVICE_RETENTION_DAYS ?? "30", 10) * 24 * 60 * 60 * 1000
  );
  const staleAnnounced = await prisma.preAdvice.deleteMany({
    where: { status: "ANNOUNCED", announcedAt: { lt: announceCutoff } },
  });

  console.log(`Packages scrubbed: ${packages.count}`);
  console.log(`Notifications deleted: ${notifications.count}`);
  console.log(`Pre-advice rows scrubbed: ${preAdvice.count}`);
  console.log(`Stale announced pre-advice deleted: ${staleAnnounced.count}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
