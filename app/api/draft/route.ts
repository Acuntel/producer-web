// A name to the numbers a draft is compiled from (lib/brain/draftDna.ts): the store and the studio's own
// hearing, never a model and never a download, so it answers in a few hundred milliseconds. GET warms the
// fingerprint store when the stage opens, so the first name is not the one that pays for loading it.
import { resolveDraftDna } from "@/lib/brain/draftDna";
import { prints } from "@/lib/brain/prints";

export const maxDuration = 15;

export async function GET() {
  const t0 = Date.now(); const ok = !!prints();
  return Response.json({ ok, ms: Date.now() - t0 });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name ?? "").toString().trim().slice(0, 160);
  if (!name) return Response.json({ found: false, name }, { status: 400 });
  const t0 = Date.now();
  const dna = await resolveDraftDna(name);
  return Response.json(dna ? { found: true, dna, ms: Date.now() - t0 } : { found: false, name, ms: Date.now() - t0 });
}
