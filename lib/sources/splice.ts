// Splice, bring your own account, through Splice's own MCP server. A STUB behind a flag that stays off: nothing here
// talks to Splice. What it does hold is the hard line, in code that runs today (docs/SOURCES_SPLICE.md):
//
// Splice audio never touches our servers, our storage, the worker, logs, the clip vault, the DNA or Galton stores, or
// any training data. The Terms of 2026-07-24, section 3.1.1.3, forbid using Sounds as AI training material, in a way
// that competes with Splice, handed to a third party outside a finished work, or redistributed on their own. A Splice
// sound is licensed to one person, lands on that person's own machine, and is only ever part of their own record.
//
// The probe of 2026-09-23 (docs/SOURCES_SPLICE.md) found OAuth with open dynamic client registration and PKCE, and no
// CORS on /mcp or /oauth/token, so a web page cannot be the MCP client. The client has to run on the user's own device.
import type { Lane, License } from "./lane";

export const SPLICE_MCP_URL = "https://mcp.splice.com/mcp";
/** The flag. Off unless it is exactly "1", and nothing ships that sets it. */
export const SPLICE_FLAG = "NEXT_PUBLIC_SOURCES_SPLICE";
// Next inlines a public variable only where it is named in full, so the default reads it by name.
export const spliceOn = (flag: string | undefined = process.env.NEXT_PUBLIC_SOURCES_SPLICE) => flag === "1";

/** The clip-store key namespace for a Splice sound on the user's device: `splice:<asset id>`. */
export const SPLICE_KEY_PREFIX = "splice:";
export const isSpliceKey = (key: string) => key.startsWith(SPLICE_KEY_PREFIX);
export const spliceKey = (assetId: string) => `${SPLICE_KEY_PREFIX}${assetId.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

/** Every place audio can go in this product. */
export const DESTINATIONS = ["device", "vault", "storage", "worker", "server", "logs", "dna", "galton", "training"] as const;
export type Destination = (typeof DESTINATIONS)[number];
/** Where a Splice sound may go: the user's own device (their disk, their browser's clip store, their audio graph and the
 *  finished record they export). Nowhere else, whatever the reason. */
export const spliceMayGo = (d: Destination) => d === "device";
/** A clip whose bytes must stay on the user's device: the vault never mirrors it and nothing uploads it. */
export const staysOnDevice = (key: string) => isSpliceKey(key);
/** The tracks of a record whose audio stays on the device: anything that renders the record for a server leaves them out. */
export const deviceOnlyTracks = (song: { tracks: { id: string; clip?: { clipId: string } }[] }) =>
  song.tracks.filter((t) => !!t.clip && staysOnDevice(t.clip.clipId)).map((t) => t.id);

/** The license a Splice sound carries: Splice's certified license, in the subscriber's legal name, held by them. */
export const spliceLicense = (assetUrl = "https://splice.com/terms"): License =>
  ({ name: "Splice Sounds license (certified, in the subscriber's name)", holder: "user", url: assetUrl, credit: null });

/** The lane itself: on only with the flag, and even then it offers nothing until the client on the user's device exists. */
export function spliceLane(flag?: string): Lane {
  const on = spliceOn(flag);
  return {
    id: "splice", on,
    why: on
      ? "The Splice lane is switched on but not built yet. It needs your own Splice account, signed in on your own machine."
      : "The Splice lane is off.",
    async candidates() { return []; },
  };
}
