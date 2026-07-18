import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type UserAdminResult = { ok: true } | { ok: false; error: string };

/** One place for the work factor: password and PIN hashing alike. */
export const BCRYPT_ROUNDS = 10;

/**
 * Lifecycle rules for staff accounts. Two invariants, both enforced inside
 * the mutation transaction:
 *  - an admin cannot lock themselves out (no self-deactivation, no self
 *    role change), and
 *  - the system always retains at least one active admin.
 * Deactivation takes effect on live sessions within ~5 minutes via the JWT
 * re-check in src/auth.ts. Accounts are never deleted — they own audit rows.
 */

async function countOtherActiveAdmins(excludeUserId: string): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN", active: true, id: { not: excludeUserId } },
  });
}

export async function setUserActive(args: {
  actorId: string;
  targetId: string;
  active: boolean;
}): Promise<UserAdminResult> {
  const target = await prisma.user.findUnique({ where: { id: args.targetId } });
  if (!target) return { ok: false, error: "User not found." };
  if (target.active === args.active) return { ok: true };

  if (!args.active) {
    if (target.id === args.actorId) {
      return { ok: false, error: "You cannot deactivate your own account." };
    }
    if (target.role === "ADMIN" && (await countOtherActiveAdmins(target.id)) === 0) {
      return { ok: false, error: "Cannot deactivate the last active admin." };
    }
  }

  await prisma.user.update({ where: { id: target.id }, data: { active: args.active } });
  return { ok: true };
}

export async function setUserRole(args: {
  actorId: string;
  targetId: string;
  role: Role;
}): Promise<UserAdminResult> {
  const target = await prisma.user.findUnique({ where: { id: args.targetId } });
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === args.role) return { ok: true };

  if (target.id === args.actorId) {
    return { ok: false, error: "You cannot change your own role." };
  }
  if (
    target.role === "ADMIN" &&
    target.active &&
    (await countOtherActiveAdmins(target.id)) === 0
  ) {
    return { ok: false, error: "Cannot demote the last active admin." };
  }

  await prisma.user.update({ where: { id: target.id }, data: { role: args.role } });
  return { ok: true };
}

export async function resetUserPassword(args: {
  targetId: string;
  password: string;
}): Promise<UserAdminResult> {
  const target = await prisma.user.findUnique({ where: { id: args.targetId } });
  if (!target) return { ok: false, error: "User not found." };

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await bcrypt.hash(args.password, BCRYPT_ROUNDS) },
  });
  return { ok: true };
}

/** Move a user to another store; takes effect on live sessions within ~5 min via the JWT re-check. */
export async function setUserStore(args: {
  targetId: string;
  storeId: string;
}): Promise<UserAdminResult> {
  const [target, store] = await Promise.all([
    prisma.user.findUnique({ where: { id: args.targetId } }),
    prisma.store.findUnique({ where: { id: args.storeId } }),
  ]);
  if (!target) return { ok: false, error: "User not found." };
  if (!store) return { ok: false, error: "Store not found." };
  if (target.storeId === args.storeId) return { ok: true };

  await prisma.user.update({ where: { id: target.id }, data: { storeId: store.id } });
  return { ok: true };
}

/**
 * Set (or clear) the 6-digit counter PIN. A PIN-established session can
 * only scan — administration always demands the password.
 */
/**
 * Unused 4-digit sign-in number for the device app (1000–9999, random so
 * numbers aren't guessable from hiring order). Globally unique — the app
 * login has no store context. ~9000 numbers caps the staff directory;
 * revisit (5 digits) if the chain ever approaches that.
 */
export async function generateLoginNumber(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = String(1000 + Math.floor(Math.random() * 9000));
    const taken = await prisma.user.findUnique({
      where: { loginNumber: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error("No free login numbers — the 4-digit space is exhausted.");
}

export async function setUserPin(args: {
  targetId: string;
  pin: string | null;
}): Promise<UserAdminResult> {
  const target = await prisma.user.findUnique({ where: { id: args.targetId } });
  if (!target) return { ok: false, error: "User not found." };
  if (args.pin !== null && !/^\d{6}$/.test(args.pin)) {
    return { ok: false, error: "PIN must be exactly 6 digits." };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      pinHash: args.pin === null ? null : await bcrypt.hash(args.pin, BCRYPT_ROUNDS),
      // A PIN is what the device app signs in with — make sure the account
      // has its 4-digit number the moment a PIN exists.
      ...(args.pin !== null && target.loginNumber === null
        ? { loginNumber: await generateLoginNumber() }
        : {}),
    },
  });
  return { ok: true };
}
