// The learning lane, end to end, against the real worker and the real store.
//
// It does exactly what /api/learn does, with the service role instead of a signed in session, so the
// whole path is exercised: pick famous records the studio has never heard, hand them to the worker,
// wait for the hearing, and write the DNA through the same function the route uses. It reports what
// the store knew before and after.
//   node --import ./tests/ts-resolve.mjs tests/learn.probe.mjs [count] [what]
import "./ts-resolve.mjs";
import { readFileSync } from "node:fs";
import { rememberHeard } from "../lib/dna/heard.ts";
import { familiesIn, yearIn } from "../lib/brain/families.ts";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER = env.STEMS_WORKER_URL?.replace(/\/$/, "");
const SECRET = env.STEMS_WORKER_SECRET;
if (!URL_ || !KEY || !WORKER || !SECRET) { console.error("[learn] .env.local is missing the supabase or worker settings"); process.exit(1); }

const COUNT = Number(process.argv[2]) || 3;
const WHAT = process.argv.slice(3).join(" ") || "house";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = async (path, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};
const countOf = async (table) => {
  const r = await fetch(`${URL_}/rest/v1/${table}?select=key`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
  return Number((r.headers.get("content-range") ?? "/0").split("/")[1]);
};

const owner = (await rest("profiles?select=id&limit=1"))?.[0]?.id;
if (!owner) { console.error("[learn] no account in this project to own the jobs"); process.exit(1); }
const before = await countOf("dna_heard");
const families = familiesIn(WHAT), year = yearIn(WHAT);
console.log(`[learn] the store has heard ${before} record${before === 1 ? "" : "s"} with its own ears. Learning ${COUNT} more of "${WHAT}"${families.length ? ` (family ${families.join(", ")})` : ""}${year ? ` from ${year}` : ""}.`);

const health = await fetch(`${WORKER}/health`).then((r) => r.json());
console.log(`[learn] worker: ${health.model}, drum parts ${health.drumParts === undefined ? "unknown" : health.drumParts ? "on" : "off"}, ${health.cpus} cpus, ${health.workers} at a time`);

// The famous end of what was named, minus anything already heard.
const fam = families.length ? `&store_family=in.(${families.join(",")})` : "";
const yr = year ? `&year=eq.${year}` : "";
const rows = await rest(`dna_charts?select=artist,title,artist_norm,title_norm,chart,year,position,store_family&artist=not.is.null&title=not.is.null${fam}${yr}&order=position.asc,year.desc&limit=${COUNT * 8}`);
const titles = [...new Set(rows.map((r) => r.title_norm))].slice(0, 200);
const known = titles.length ? await rest(`dna_heard?select=artist_norm,title_norm&title_norm=in.(${titles.map((t) => `"${t.replace(/"/g, "")}"`).join(",")})`) : [];
const heard = new Set(known.map((k) => `${k.artist_norm}|${k.title_norm}`));
const seen = new Set();
const picks = rows.filter((c) => { const id = `${c.artist_norm}|${c.title_norm}`; if (heard.has(id) || seen.has(id)) return false; seen.add(id); return true; }).slice(0, COUNT);
if (!picks.length) { console.log("[learn] nothing left to learn there"); process.exit(0); }
console.log(`[learn] picked: ${picks.map((p) => `${p.artist} - ${p.title} (${p.chart} ${p.year} #${p.position})`).join(" | ")}`);

const run = `learnprobe_${Date.now().toString(36)}`;
const jobs = [];
for (const p of picks) {
  const query = `${p.artist} ${p.title}`.replace(/\s+/g, " ").trim();
  const name = `${p.artist} - ${p.title}`;
  const [job] = await rest("jobs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner, kind: "stems", status: "queued", source: { query, name, learn: true, run } }) });
  const r = await fetch(`${WORKER}/jobs`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Secret": SECRET }, body: JSON.stringify({ job_id: job.id, owner, kind: "stems", source: { query, name } }) });
  if (!r.ok) { console.log(`[learn]   worker refused ${name}: ${r.status}`); continue; }
  jobs.push({ id: job.id, name });
}
console.log(`[learn] ${jobs.length} handed to the worker; listening now`);

const t0 = Date.now();
const learned = [], failed = [];
const pending = new Map(jobs.map((j) => [j.id, j.name]));
while (pending.size && Date.now() - t0 < 25 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 10000));
  for (const [jid, name] of [...pending]) {
    const [row] = await rest(`jobs?select=id,status,progress,result,error&id=eq.${jid}`);
    if (!row) { pending.delete(jid); continue; }
    if (row.status === "error") { failed.push(`${name}: ${String(row.error ?? "").slice(0, 80)}`); pending.delete(jid); continue; }
    if (row.status !== "done") continue;
    pending.delete(jid);
    // The same function the route calls, so the probe cannot pass on a path the product does not use.
    const admin = { from: (table) => makeQuery(table) };
    const pick = picks.find((x) => `${x.artist} - ${x.title}` === name);
    const out = await rememberHeard(admin, row.result, jid, { family: pick?.store_family ?? null, year: pick?.year ?? null });
    if (out.ok) learned.push(`${out.artist ? `${out.artist} - ` : ""}${out.title ?? name}${out.tempo ? ` at ${Math.round(out.tempo)} BPM` : ""}${out.dna.key_pc !== null ? `, ${out.dna.mode ?? ""}` : ""}${out.dna.family ? `, ${out.dna.family}` : ""}${out.dna.progression ? `, ${out.dna.progression}` : ""}`);
    else failed.push(`${name}: ${out.error}`);
    console.log(`[learn]   ${Math.round((Date.now() - t0) / 1000)} s: ${out.ok ? "learned" : "failed"} ${name}`);
  }
}
for (const [, name] of pending) failed.push(`${name}: still going after ${Math.round((Date.now() - t0) / 60000)} minutes`);

const after = await countOf("dna_heard");
console.log(`[learn] learned ${learned.length}: ${learned.join(" | ") || "none"}`);
if (failed.length) console.log(`[learn] could not hear ${failed.length}: ${failed.join(" | ")}`);
console.log(`[learn] the store has now heard ${after} records with its own ears (was ${before})`);
process.exit(after > before || learned.length ? 0 : 1);

// A tiny stand in for the supabase client, enough for what rememberHeard asks of it.
function makeQuery(table) {
  const state = { table, filters: [], selectCols: "*" };
  const api = {
    select(cols) { state.selectCols = cols ?? "*"; return api; },
    eq(col, val) { state.filters.push(`${col}=eq.${encodeURIComponent(val)}`); return api; },
    async maybeSingle() {
      const rows = await rest(`${state.table}?select=${state.selectCols}&${state.filters.join("&")}&limit=1`);
      return { data: rows?.[0] ?? null, error: null };
    },
    async upsert(row, opts) {
      try {
        await rest(`${state.table}?on_conflict=${opts?.onConflict ?? "key"}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
        return { error: null };
      } catch (e) { return { error: { message: e.message } }; }
    },
  };
  return api;
}
