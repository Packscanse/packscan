import type { NextConfig } from "next";

// Conservative security headers. CSP is intentionally omitted for now —
// a strict policy needs nonce wiring through Next's inline scripts; add it
// as a dedicated task rather than shipping a broken or watered-down one.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera is required on same origin for barcode scanning; deny the rest.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // No-op over plain HTTP (local dev); enforced once served over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
