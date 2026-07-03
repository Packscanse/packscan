import { CARRIER_PROVIDERS, detectCarrier, detectCarrierCandidates, getPickupPolicy } from "../src/lib/carriers";
import type { CarrierCode, Confidence } from "../src/lib/carriers";

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

console.log(failures === 0 ? "\nAll detection checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
