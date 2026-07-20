import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Dev-only credentials below — never let this run against production data.
if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
  console.error("Refusing to seed in production. Set ALLOW_SEED=true to override.");
  process.exit(1);
}

const ADMIN_EMAIL = "admin@packscan.local";
const CLERK_EMAIL = "clerk@packscan.local";
const ADMIN_PASSWORD = "admin-dev-password";
const CLERK_PASSWORD = "clerk-dev-password";
const CLERK_PIN = "123456";

async function main() {
  const store = await prisma.store.upsert({
    where: { code: "DEMO-01" },
    update: {},
    create: {
      name: "Demo Store",
      code: "DEMO-01",
      address: "Demogatan 1, 111 11 Stockholm",
    },
  });

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: "Demo Admin",
      role: "ADMIN",
      storeId: store.id,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      // The demo store is Swedish — a Swedish login page followed by an
      // English app reads as a bug, so the demo accounts match the store.
      locale: "SV",
    },
  });

  const clerkPinHash = await bcrypt.hash(CLERK_PIN, 10);
  await prisma.user.upsert({
    where: { email: CLERK_EMAIL },
    update: { pinHash: clerkPinHash },
    create: {
      email: CLERK_EMAIL,
      name: "Demo Clerk",
      role: "CLERK",
      storeId: store.id,
      passwordHash: await bcrypt.hash(CLERK_PASSWORD, 10),
      pinHash: clerkPinHash,
      locale: "SV",
    },
  });

  await prisma.user.upsert({
    where: { email: "manager@packscan.local" },
    update: {},
    create: {
      email: "manager@packscan.local",
      name: "Demo Manager",
      role: "MANAGER",
      storeId: store.id,
      passwordHash: await bcrypt.hash("manager-dev-password", 10),
      locale: "SV",
    },
  });

  console.log(`Seeded store "${store.name}" (${store.code}) with users:`);
  console.log(`  ADMIN    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  MANAGER  manager@packscan.local / manager-dev-password (own store only)`);
  console.log(`  CLERK    ${CLERK_EMAIL} / ${CLERK_PASSWORD} (counter PIN ${CLERK_PIN})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
