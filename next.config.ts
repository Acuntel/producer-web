import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The library pack's content hash: every file's name and bytes. It rides on every /samples URL (and the
// manifest's), so the browser keeps each one for a year and a changed pack is simply a new URL.
function packHash(dir: string): string {
  const h = createHash("sha1");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else { h.update(p.slice(dir.length)); h.update(readFileSync(p)); }
    }
  };
  try { walk(dir); } catch { return ""; }
  return h.digest("hex").slice(0, 12);
}

// The fingerprints (data/prints, ~80 MB of flat binaries) are read from disk by the research lane and the
// source lookup; the function bundles carry them because nothing imports them statically.
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SAMPLES_HASH: packHash(join(process.cwd(), "public", "samples")) },
  outputFileTracingIncludes: { "/api/research": ["./data/prints/**/*"], "/api/source": ["./data/prints/**/*"], "/api/health": ["./data/prints/manifest.json"] },
  async headers() {
    return [{ source: "/samples/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default nextConfig;
