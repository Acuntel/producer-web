// Find a record anywhere public: ranked candidates from the worker's finder, about one second, no download.
export const maxDuration = 30;

export async function POST(req: Request) {
  const worker = process.env.STEMS_WORKER_URL, secret = process.env.STEMS_WORKER_SECRET;
  if (!worker || !secret) return Response.json({ error: "The finder is not configured yet." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { query?: string; want?: string; sources?: string[] };
  const query = (body.query ?? "").toString().trim().slice(0, 160);
  if (!query) return Response.json({ error: "Name a record." }, { status: 400 });
  try {
    const r = await fetch(`${worker.replace(/\/$/, "")}/find`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Secret": secret }, body: JSON.stringify({ query, want: body.want ?? null, sources: body.sources ?? null }) });
    if (!r.ok) return Response.json({ error: `finder ${r.status}` }, { status: 502 });
    return Response.json(await r.json(), { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "finder failed" }, { status: 502 }); }
}
