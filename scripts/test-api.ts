/**
 * HTTP tests for /api/v1 — the device-app seam. Unlike the other suites
 * this one talks to a RUNNING dev server (default http://localhost:3100,
 * override with API_BASE_URL) so it exercises the real route handlers,
 * middleware pass-through, and bearer auth end to end.
 *
 *   npm run dev -- -p 3100   (in one terminal)
 *   npm run test:api         (in another)
 */
import { prisma } from "../src/lib/prisma";

const BASE = process.env.API_BASE_URL ?? "http://localhost:3100";
const TEST_PREFIX = "APITEST";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function call(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { token, ...rest } = init;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

async function deleteTestData(storeId: string) {
  await prisma.scanEvent.deleteMany({
    where: { storeId, package: { trackingNumber: { startsWith: TEST_PREFIX } } },
  });
  await prisma.package.deleteMany({
    where: { storeId, trackingNumber: { startsWith: TEST_PREFIX } },
  });
}

async function main() {
  // Is the server up at all?
  const alive = await fetch(`${BASE}/login`).catch(() => null);
  if (!alive) {
    console.error(`No server at ${BASE} — start one with: npm run dev -- -p 3100`);
    process.exit(1);
  }

  const store = await prisma.store.findUniqueOrThrow({ where: { code: "DEMO-01" } });
  await deleteTestData(store.id);

  // --- Login ---
  const badLogin = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "nobody@packscan.local", password: "wrong" }),
  });
  check(
    "login: unknown user → 401 with one generic code",
    badLogin.status === 401 &&
      (badLogin.body.error as { code?: string })?.code === "INVALID_CREDENTIALS"
  );

  const adminLogin = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@packscan.local", password: "admin-dev-password" }),
  });
  const adminToken = adminLogin.body.token as string | undefined;
  const adminUser = adminLogin.body.user as { role?: string; authMethod?: string } | undefined;
  check(
    "login: admin password → token + PASSWORD authMethod + store branding",
    adminLogin.status === 200 &&
      !!adminToken &&
      adminUser?.role === "ADMIN" &&
      adminUser?.authMethod === "PASSWORD" &&
      !!(adminLogin.body.store as { code?: string })?.code
  );

  const pinLogin = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "clerk@packscan.local", pin: "123456" }),
  });
  const pinToken = pinLogin.body.token as string | undefined;
  check(
    "login: clerk PIN → token with PIN authMethod",
    pinLogin.status === 200 &&
      !!pinToken &&
      (pinLogin.body.user as { authMethod?: string })?.authMethod === "PIN"
  );

  // --- Token gate ---
  const noToken = await call("/me");
  const garbage = await call("/me", { token: "not-a-token" });
  check("auth: /me without token → 401 JSON (no login redirect)", noToken.status === 401);
  check("auth: /me with garbage token → 401", garbage.status === 401);

  const me = await call("/me", { token: pinToken });
  const meStore = me.body.store as { code?: string; pickupDeadlineDays?: number } | undefined;
  check(
    "auth: /me resolves user + store fresh from DB",
    me.status === 200 &&
      (me.body.user as { role?: string })?.role === "CLERK" &&
      meStore?.code === "DEMO-01" &&
      typeof meStore?.pickupDeadlineDays === "number"
  );

  // --- Scan context: server-side detection + pre-advice in one call ---
  const context = await call("/scan-context?tracking=RR123456785SE", { token: pinToken });
  const candidates =
    (context.body.candidates as { carrier: string }[] | undefined) ?? [];
  check(
    "scan-context: detection candidates come from the server's rules",
    context.status === 200 && candidates.some((c) => c.carrier === "POSTNORD"),
    candidates.map((c) => c.carrier).join(", ") || "none"
  );

  // --- Scan: register a new inbound parcel (PostNord ⇒ code+ID at pickup) ---
  const scanBody = {
    trackingNumber: `${TEST_PREFIX}PICK1`,
    flow: "INBOUND_PICKUP",
    carrier: "POSTNORD",
    carrierManual: true,
    inputMethod: "HARDWARE_SCANNER",
    customerName: "Api Testperson",
  };
  const created = await call("/scans", {
    method: "POST",
    token: pinToken,
    body: JSON.stringify(scanBody),
  });
  const packageId = created.body.packageId as string | undefined;
  check(
    "scan: new parcel registered as AWAITING_PICKUP",
    created.status === 200 &&
      created.body.ok === true &&
      created.body.status === "AWAITING_PICKUP" &&
      !!packageId
  );

  // Second scan of the same label = pickup attempt → verification step.
  const again = await call("/scans", {
    method: "POST",
    token: pinToken,
    body: JSON.stringify(scanBody),
  });
  check(
    "scan: re-scan answers 409 VERIFICATION_REQUIRED with handover context",
    again.status === 409 &&
      again.body.code === "VERIFICATION_REQUIRED" &&
      (again.body.handover as { carrier?: string })?.carrier === "POSTNORD"
  );

  // --- Pickup verification path ---
  const overrideDenied = await call(`/packages/${packageId}/pickup`, {
    method: "POST",
    token: pinToken,
    body: JSON.stringify({ idChecked: false, override: true, overrideReason: "app test" }),
  });
  check(
    "pickup: override with a PIN token is refused (PIN acts as CLERK)",
    overrideDenied.status === 422 && overrideDenied.body.ok === false
  );

  const picked = await call(`/packages/${packageId}/pickup`, {
    method: "POST",
    token: pinToken,
    body: JSON.stringify({
      presentedCode: "APIQR123456",
      idChecked: true,
      idType: "DRIVERS_LICENSE",
    }),
  });
  check(
    "pickup: code + ID satisfies PostNord policy → PICKED_UP",
    picked.status === 200 && picked.body.status === "PICKED_UP"
  );

  // --- List / detail / carrier lookup ---
  const list = await call(`/packages?q=${TEST_PREFIX}`, { token: pinToken });
  const listed = (list.body.packages as { trackingNumber: string }[] | undefined) ?? [];
  check(
    "list: search finds the test parcel, store-scoped",
    list.status === 200 && listed.some((p) => p.trackingNumber === `${TEST_PREFIX}PICK1`)
  );

  const detail = await call(`/packages/${packageId}`, { token: pinToken });
  const events =
    ((detail.body.package as { scanEvents?: { verification: unknown }[] })?.scanEvents ?? []);
  check(
    "detail: scan history includes the verification summary",
    detail.status === 200 &&
      events.length === 2 &&
      events.some((e) => e.verification !== null)
  );

  const lookup = await call(`/packages/${packageId}/carrier-status`, { token: pinToken });
  check(
    "carrier-status: answers NOT_CONFIGURED until credentials exist",
    lookup.status === 200 && lookup.body.ok === false && lookup.body.code === "NOT_CONFIGURED"
  );

  // --- Actions: cancel with reason ---
  const toCancel = await call("/scans", {
    method: "POST",
    token: pinToken,
    body: JSON.stringify({ ...scanBody, trackingNumber: `${TEST_PREFIX}CANCEL1` }),
  });
  const cancelId = toCancel.body.packageId as string;
  const cancelled = await call(`/packages/${cancelId}/actions`, {
    method: "POST",
    token: pinToken,
    body: JSON.stringify({ action: "cancel", reason: "API test cleanup" }),
  });
  check(
    "actions: cancel with reason → CANCELLED",
    cancelled.status === 200 && cancelled.body.status === "CANCELLED"
  );

  // --- Scoping: the other store's clerk must not see this parcel ---
  const otherLogin = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "clerk2@packscan.local", password: "clerk2-dev-password" }),
  });
  if (otherLogin.status === 200) {
    const cross = await call(`/packages/${packageId}`, {
      token: otherLogin.body.token as string,
    });
    check("scoping: another store's clerk gets 404 on this parcel", cross.status === 404);
  } else {
    console.log("SKIP  scoping check (no second-store clerk in this environment)");
  }

  await deleteTestData(store.id);
  console.log(failures === 0 ? "\nAll API checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
