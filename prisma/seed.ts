import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@packscan.local";
const CLERK_EMAIL = "clerk@packscan.local";
const ADMIN_PASSWORD = "admin-dev-password";
const CLERK_PASSWORD = "clerk-dev-password";

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
    },
  });

  await prisma.user.upsert({
    where: { email: CLERK_EMAIL },
    update: {},
    create: {
      email: CLERK_EMAIL,
      name: "Demo Clerk",
      role: "CLERK",
      storeId: store.id,
      passwordHash: await bcrypt.hash(CLERK_PASSWORD, 10),
    },
  });

  console.log(`Seeded store "${store.name}" (${store.code}) with users:`);
  console.log(`  ADMIN  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  CLERK  ${CLERK_EMAIL} / ${CLERK_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
