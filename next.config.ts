import type { NextConfig } from "next";

// The fingerprints (data/prints, ~80 MB of flat binaries) are read from disk by the research lane and the
// source lookup; the function bundles carry them because nothing imports them statically.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/research": ["./data/prints/**/*"], "/api/source": ["./data/prints/**/*"], "/api/health": ["./data/prints/manifest.json"] },
};

export default nextConfig;
