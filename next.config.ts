import type { NextConfig } from "next";

// The fingerprints (data/prints, ~80 MB of flat binaries) are read from disk by the research lane;
// the function bundle carries them because nothing imports them statically.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/research": ["./data/prints/**/*"], "/api/health": ["./data/prints/manifest.json"] },
};

export default nextConfig;
