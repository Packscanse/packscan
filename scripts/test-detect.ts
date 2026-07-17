import { CARRIER_PROVIDERS, detectCarrier, detectCarrierCandidates, getPickupPolicy } from "../src/lib/carriers";
import type { CarrierCode, Confidence } from "../src/lib/carriers";
import { classifyHandoverScan } from "../src/lib/verification";

let failures = 0;

function expectDetect(input: string, carrier: CarrierCode, confidence: Confidence, note = "") {
  const result = detectCarrier(input);
  const ok = result.carrier === carrier && result.confidence === confidence;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${input.padEnd(24)} → ${result.carrier}/${result.confidence} (${result.matchedRule})` +
      (ok ? "" : `  expected ${carrier}/${confidence}`) +
      (note ? `  [${note}]` : "")
  );
}

// S10 check digit for serial 12345678 is 5 (weights 8,6,4,2,3,5,9,7 → sum 204 → 11-(204%11)=5)
expectDetect("RR123456785SE", "POSTNORD", "high", "valid S10, Sweden");
expectDetect("RR123456785NO", "POSTNORD", "high", "valid S10, Norway");
expectDetect("RR123456789SE", "POSTNORD", "low", "bad checksum still surfaced");
expectDetect("rr 123456785 se", "POSTNORD", "high", "normalization: spaces + lowercase");

expectDetect("LA123456785NL", "POSTNL", "high", "valid S10, Netherlands");
expectDetect("3SABCD1234567", "POSTNL", "medium", "domestic 3S code");

expectDetect("JVGL06252526266", "DHL", "high", "DHL Parcel JVGL prefix");
expectDetect("JJD0003900078823134", "DHL", "high", "DHL Parcel JJD prefix");
expectDetect("1234567890", "DHL", "medium", "10-digit Express (not FedEx: wrong length)");
expectDetect("GM2951173225190123456", "DHL", "medium", "eCommerce GM prefix");

expectDetect("123456789012", "FEDEX", "high", "12-digit");
expectDetect("123456789012345", "FEDEX", "high", "15-digit");
expectDetect("12345678901234567890", "FEDEX", "high", "20-digit");

expectDetect("HELLO", "UNKNOWN", "low", "no rule matches");
expectDetect("12345678901", "UNKNOWN", "low", "11 digits matches nothing");

// Ambiguity surfacing: 3S… must yield BOTH PostNL (medium, first) and DHL (low)
const threeS = detectCarrierCandidates("3SABCD1234567");
const threeSOk =
  threeS.length === 2 && threeS[0].carrier === "POSTNL" && threeS[1].carrier === "DHL";
if (!threeSOk) failures++;
console.log(`${threeSOk ? "PASS" : "FAIL"}  3S collision → candidates: ${threeS.map((c) => `${c.carrier}/${c.confidence}`).join(", ")}`);

// LX…NL is simultaneously a valid PostNL S10 and DHL-eCommerce-shaped: PostNL high must win
const lx = detectCarrierCandidates("LX123456785NL");
const lxOk = lx.length === 2 && lx[0].carrier === "POSTNL" && lx[0].confidence === "high" && lx[1].carrier === "DHL";
if (!lxOk) failures++;
console.log(`${lxOk ? "PASS" : "FAIL"}  LX S10 overlap → candidates: ${lx.map((c) => `${c.carrier}/${c.confidence}`).join(", ")}`);

// Every carrier must demand at least one proof at handover; UNKNOWN falls
// back to a mandatory ID check.
for (const provider of CARRIER_PROVIDERS) {
  const p = provider.pickupPolicy;
  const hasProof = p.code === "required" || p.idCheck === "required";
  if (!hasProof) failures++;
  console.log(
    `${hasProof ? "PASS" : "FAIL"}  ${provider.code.padEnd(24)} pickup policy: code=${p.code}, id=${p.idCheck}, proxy=${p.proxyAllowed}`
  );
}
const unknownPolicy = getPickupPolicy("UNKNOWN");
const unknownOk = unknownPolicy.idCheck === "required";
if (!unknownOk) failures++;
console.log(`${unknownOk ? "PASS" : "FAIL"}  UNKNOWN carrier falls back to mandatory ID check`);

// Handover scan classification: ID documents vs pickup codes. Contents of a
// recognized ID are never stored, so only kind/idType matter here.
function expectClassify(label: string, input: string, expected: string) {
  const result = classifyHandoverScan(input);
  const actual = result.kind === "ID_DOCUMENT" ? `ID:${result.idType}` : "CODE";
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  classify ${label} → ${actual}${ok ? "" : ` (expected ${expected})`}`);
}
expectClassify("AAMVA driver's license", "@\n\x1e\rANSI 636000090002DL00410278ZV03190008DLDAQ123456789", "ID:DRIVERS_LICENSE");
expectClassify("passport MRZ (TD3)", "P<SWEBERGSTROM<<JOHAN<<<<<<<<<<<<<<<<<<<<<<<", "ID:PASSPORT");
expectClassify("national ID MRZ (TD1)", "I<SWE123456789<<<<<<<<<<<<<<<<8309120M2601015SWE<<<<<<<<<<<4", "ID:NATIONAL_ID");
expectClassify("carrier-app QR payload", "PNQR-8f3a2b1c-PICKUP", "CODE");
expectClassify("plain numeric pickup code", "482913", "CODE");
expectClassify("tracking-like code starting with I", "ID12345678", "CODE");

// Dwell-time formatting (pure).
import { formatDuration } from "../src/lib/duration";
function expectDuration(label: string, ms: number, expected: string) {
  const actual = formatDuration(ms);
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  duration ${label} → ${actual}${ok ? "" : ` (expected ${expected})`}`);
}
expectDuration("30 min", 30 * 60_000, "30 min");
expectDuration("5.5 hours", 5.5 * 3_600_000, "5.5 h");
expectDuration("3 days", 72 * 3_600_000, "3 d");

// Store logo upload validation (pure).
import { LOGO_MAX_BYTES, validateLogo } from "../src/lib/branding";
function expectLogo(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}
expectLogo("logo: PNG within limit accepted", validateLogo("image/png", 10_000) === null);
expectLogo("logo: SVG accepted", validateLogo("image/svg+xml", 5_000) === null);
expectLogo("logo: GIF rejected", validateLogo("image/gif", 10_000) !== null);
expectLogo("logo: oversize rejected", validateLogo("image/png", LOGO_MAX_BYTES + 1) !== null);
expectLogo("logo: empty file rejected", validateLogo("image/png", 0) !== null);

// Webhook HMAC verification (pure).
import { createHmac } from "crypto";
import { verifyWebhookSignature } from "../src/lib/webhook-security";
{
  const expectHmac = (label: string, ok: boolean) => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  };
  const secret = "test-secret";
  const body = '{"carrier":"DHL","storeCode":"DEMO-01","parcels":[]}';
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));
  const sign = (t: string, b: string) =>
    "sha256=" + createHmac("sha256", secret).update(`${t}.${b}`).digest("hex");

  expectHmac(
    "webhook hmac: valid signature accepted",
    verifyWebhookSignature({ secret, timestamp: ts, body, signature: sign(ts, body), nowMs: now })
  );
  expectHmac(
    "webhook hmac: tampered body rejected",
    !verifyWebhookSignature({ secret, timestamp: ts, body: body + " ", signature: sign(ts, body), nowMs: now })
  );
  const staleTs = String(Math.floor(now / 1000) - 600);
  expectHmac(
    "webhook hmac: stale timestamp rejected (replay)",
    !verifyWebhookSignature({ secret, timestamp: staleTs, body, signature: sign(staleTs, body), nowMs: now })
  );
  expectHmac(
    "webhook hmac: wrong secret rejected",
    !verifyWebhookSignature({ secret: "other", timestamp: ts, body, signature: sign(ts, body), nowMs: now })
  );
}

// Failed-login rate limiter (in-memory backend): per-email and per-IP scopes.
import { clearFailures, isRateLimited, recordFailure } from "../src/lib/rate-limit";

async function rateLimitChecks() {
  const expectLimit = (label: string, ok: boolean) => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  };
  for (let i = 0; i < 10; i++) await recordFailure("email", "victim@test.local");
  expectLimit("rate limit: email locked after 10 failures", await isRateLimited("email", "victim@test.local"));
  expectLimit("rate limit: other emails unaffected", !(await isRateLimited("email", "other@test.local")));
  await clearFailures("email", "victim@test.local");
  expectLimit("rate limit: cleared on successful login", !(await isRateLimited("email", "victim@test.local")));
  for (let i = 0; i < 29; i++) await recordFailure("ip", "10.0.0.9");
  expectLimit("rate limit: IP not locked at 29 failures", !(await isRateLimited("ip", "10.0.0.9")));
  await recordFailure("ip", "10.0.0.9");
  expectLimit("rate limit: IP locked at 30 failures", await isRateLimited("ip", "10.0.0.9"));
}

// i18n: every locale dictionary must have exactly the English key shape.
import { getMessages, LOCALES } from "../src/lib/i18n";
import { en } from "../src/lib/i18n/messages/en";
function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}
const enKeys = keyPaths(en).sort().join("\n");
for (const locale of LOCALES) {
  const keys = keyPaths(getMessages(locale) as unknown as Record<string, unknown>).sort().join("\n");
  const ok = keys === enKeys;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  i18n: ${locale} dictionary matches the English key shape`);
}

rateLimitChecks().then(() => {
  console.log(failures === 0 ? "\nAll detection checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
});
