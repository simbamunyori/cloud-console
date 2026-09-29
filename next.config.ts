import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

// The content security policy is set per request in src/proxy.ts,
// because it carries a fresh nonce each time.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The site and the website editor have separate root layouts, so an unknown address gets its own page.
  experimental: { globalNotFound: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withEditor = withPayload(nextConfig, { devBundleServerPackages: false });

export default {
  ...withEditor,
  // Payload asks every page for the colour-scheme client hint with Critical-CH,
  // which makes browsers load each page twice. Only the editor needs it.
  async headers() {
    const all = (await withEditor.headers?.()) ?? [];
    return all.map((rule) => (rule.headers.some((h) => h.key === "Critical-CH") ? { ...rule, source: "/admin/content/:path*" } : rule));
  },
} satisfies NextConfig;
