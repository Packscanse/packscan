/**
 * Exercises the user-lifecycle rules (src/lib/users.ts) against the real
 * database: deactivation, role changes, password reset, and the two
 * lockout guards (no self-lockout, always one active admin).
 * Run: npx tsx --env-file=.env scripts/test-user-admin.ts
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { resetUserPassword, setUserActive, setUserPin, setUserRole, setUserStore } from "../src/lib/users";

const TEST_EMAILS = ["ua-admin1@pkstest.local", "ua-admin2@pkstest.local", "ua-clerk1@pkstest.local"];
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const store = await prisma.store.findUniqueOrThrow({ where: { code: "DEMO-01" } });

  // Clean slate for rerunnability
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });

  const hash = await bcrypt.hash("initial-password", 10);
  const [admin1, admin2, clerk1] = await Promise.all(
    TEST_EMAILS.map((email, i) =>
      prisma.user.create({
        data: {
          email,
          name: `UA Test ${i}`,
          role: email.includes("clerk") ? "CLERK" : "ADMIN",
          storeId: store.id,
          passwordHash: hash,
        },
      })
    )
  );

  // --- Deactivate / reactivate ---
  const deact = await setUserActive({ actorId: admin1.id, targetId: clerk1.id, active: false });
  const clerkAfter = await prisma.user.findUniqueOrThrow({ where: { id: clerk1.id } });
  check("deactivate: admin deactivates a clerk", deact.ok && clerkAfter.active === false);

  const react = await setUserActive({ actorId: admin1.id, targetId: clerk1.id, active: true });
  const clerkBack = await prisma.user.findUniqueOrThrow({ where: { id: clerk1.id } });
  check("reactivate: account restored", react.ok && clerkBack.active === true);

  const self = await setUserActive({ actorId: admin1.id, targetId: admin1.id, active: false });
  check("guard: self-deactivation blocked", !self.ok);

  // --- Role changes ---
  const promote = await setUserRole({ actorId: admin1.id, targetId: clerk1.id, role: "ADMIN" });
  check("role: clerk promoted to admin", promote.ok);
  const demote = await setUserRole({ actorId: admin1.id, targetId: clerk1.id, role: "CLERK" });
  check("role: admin demoted back to clerk (others remain)", demote.ok);

  const selfRole = await setUserRole({ actorId: admin1.id, targetId: admin1.id, role: "CLERK" });
  check("guard: self role change blocked", !selfRole.ok);

  // --- Last-active-admin guards ---
  // Park every active admin outside the test set so the guard is testable,
  // then restore in finally below.
  const parkedAdmins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true, email: { notIn: TEST_EMAILS } },
    select: { id: true },
  });
  try {
    await prisma.user.updateMany({
      where: { id: { in: parkedAdmins.map((a) => a.id) } },
      data: { active: false },
    });

    const deactOther = await setUserActive({ actorId: admin1.id, targetId: admin2.id, active: false });
    check("last-admin: deactivating one of two admins allowed", deactOther.ok);

    const deactLast = await setUserActive({ actorId: admin2.id, targetId: admin1.id, active: false });
    check("last-admin: deactivating the final active admin blocked", !deactLast.ok);

    const demoteLast = await setUserRole({ actorId: admin2.id, targetId: admin1.id, role: "CLERK" });
    check("last-admin: demoting the final active admin blocked", !demoteLast.ok);
  } finally {
    await prisma.user.updateMany({
      where: { id: { in: parkedAdmins.map((a) => a.id) } },
      data: { active: true },
    });
  }

  // --- Password reset ---
  const reset = await resetUserPassword({ targetId: clerk1.id, password: "brand-new-password" });
  const clerkHash = await prisma.user.findUniqueOrThrow({ where: { id: clerk1.id } });
  check(
    "password: reset produces a hash matching the new password",
    reset.ok && (await bcrypt.compare("brand-new-password", clerkHash.passwordHash))
  );

  // --- Move between stores ---
  const otherStore = await prisma.store.findFirst({ where: { code: { not: "DEMO-01" } } });
  if (otherStore) {
    const moved = await setUserStore({ targetId: clerk1.id, storeId: otherStore.id });
    const afterMove = await prisma.user.findUniqueOrThrow({ where: { id: clerk1.id } });
    check("store move: user reassigned", moved.ok && afterMove.storeId === otherStore.id);
    const back = await setUserStore({ targetId: clerk1.id, storeId: store.id });
    check("store move: moved back", back.ok);
  }
  const badStore = await setUserStore({ targetId: clerk1.id, storeId: "nonexistent" });
  check("store move: unknown store rejected", !badStore.ok);

  // --- Counter PIN ---
  const badPin = await setUserPin({ targetId: clerk1.id, pin: "12345" });
  check("pin: non-6-digit PIN rejected", !badPin.ok);
  const setPin = await setUserPin({ targetId: clerk1.id, pin: "654321" });
  const withPin = await prisma.user.findUniqueOrThrow({ where: { id: clerk1.id } });
  check(
    "pin: 6-digit PIN set and hashed",
    setPin.ok && withPin.pinHash !== null && (await bcrypt.compare("654321", withPin.pinHash))
  );
  const clearPin = await setUserPin({ targetId: clerk1.id, pin: null });
  const withoutPin = await prisma.user.findUniqueOrThrow({ where: { id: clerk1.id } });
  check("pin: cleared", clearPin.ok && withoutPin.pinHash === null);

  const missing = await setUserActive({ actorId: admin1.id, targetId: "nonexistent-id", active: false });
  check("unknown user id returns an error", !missing.ok);

  // Cleanup
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });

  console.log(failures === 0 ? "\nAll user-admin checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
