/**
 * Data-subject tooling (GDPR Art. 15 & 17) keyed on a phone number or
 * email address:
 *
 *   npm run privacy lookup <phone-or-email>   # Art. 15: export what we hold
 *   npm run privacy erase  <phone-or-email>   # Art. 17: anonymize it
 *
 * Erasure nulls contact fields on packages and pre-advice and deletes the
 * notification rows (their message text embeds the recipient). The parcels
 * and the full scan/audit history remain — retained on legitimate-interest
 * grounds for carrier-dispute evidence, and no longer linkable to a person.
 */
import { prisma } from "../src/lib/prisma";

const [mode, term] = process.argv.slice(2);

function contactWhere(value: string) {
  return {
    OR: [{ customerPhone: value }, { customerEmail: value.toLowerCase() }],
  };
}

async function lookup(value: string) {
  const [packages, preAdvice, notifications] = await Promise.all([
    prisma.package.findMany({
      where: contactWhere(value),
      select: {
        trackingNumber: true,
        carrier: true,
        direction: true,
        status: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        createdAt: true,
        store: { select: { name: true, code: true } },
      },
    }),
    prisma.preAdvice.findMany({
      where: contactWhere(value),
      select: { trackingNumber: true, carrier: true, status: true, customerName: true, announcedAt: true },
    }),
    prisma.notification.findMany({
      where: { recipient: value },
      select: { trigger: true, channel: true, message: true, createdAt: true },
    }),
  ]);
  console.log(
    JSON.stringify(
      { subject: value, exportedAt: new Date().toISOString(), packages, preAdvice, notifications },
      null,
      2
    )
  );
}

async function erase(value: string) {
  const [notifications, packages, preAdvice] = await prisma.$transaction([
    prisma.notification.deleteMany({ where: { recipient: value } }),
    prisma.package.updateMany({
      where: contactWhere(value),
      data: { customerName: null, customerPhone: null, customerEmail: null },
    }),
    prisma.preAdvice.updateMany({
      where: contactWhere(value),
      data: { customerName: null, customerPhone: null, customerEmail: null },
    }),
  ]);
  console.log(`Anonymized: ${packages.count} package(s), ${preAdvice.count} pre-advice row(s).`);
  console.log(`Deleted: ${notifications.count} notification(s).`);
  console.log("Parcels and audit history remain, no longer linkable to the subject.");
}

async function main() {
  if ((mode !== "lookup" && mode !== "erase") || !term) {
    console.error("Usage: npm run privacy lookup|erase <phone-or-email>");
    process.exit(1);
  }
  await (mode === "lookup" ? lookup(term) : erase(term));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
