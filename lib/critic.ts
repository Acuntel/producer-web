// The critic: a background listener that turns the ears into recommendations.
// It never changes the song. Notes go to the user and to the brain as options;
// the user decides. Dismissed notes stay dismissed.
export type CriticNote = {
  id: string; area: "mix" | "arrangement" | "groove" | "harmony" | "sound" | "reference";
  severity: 1 | 2 | 3; what: string; why: string; fix: string; section?: string; ops?: unknown[];
  status: "open" | "applied" | "dismissed"; at: number;
};
export type CriticReply = { headline: string; notes: CriticNote[] };

const KEY = "producer.critic.v1";
let cache: CriticNote[] | null = null;

export function loadNotes(): CriticNote[] {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; }
  return cache!;
}
function save(notes: CriticNote[]) { cache = notes.slice(-60); try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} }

// Merge fresh notes: keep dismissed ones dismissed (same what), cap open notes at 6.
export function mergeNotes(fresh: CriticNote[]): CriticNote[] {
  const all = loadNotes();
  const dismissed = new Set(all.filter((n) => n.status === "dismissed").map((n) => n.what.toLowerCase().slice(0, 60)));
  const open = fresh.filter((n) => !dismissed.has(n.what.toLowerCase().slice(0, 60))).slice(0, 6);
  const kept = all.filter((n) => n.status !== "open");
  save([...kept, ...open]);
  return cache!;
}
export function setNoteStatus(id: string, status: CriticNote["status"]) { save(loadNotes().map((n) => (n.id === id ? { ...n, status } : n))); return cache!; }
export const openNotes = () => loadNotes().filter((n) => n.status === "open");

export function notesForBrain(): string | null {
  const open = openNotes();
  if (!open.length) return null;
  return open.map((n) => `[${n.id}] (${n.area}, sev ${n.severity}${n.section ? `, ${n.section}` : ""}) ${n.what}. Why: ${n.why}. Suggested move: ${n.fix}`).join("\n");
}

// Parse the critic model's JSON defensively.
export function parseCritic(obj: unknown): CriticReply {
  const o = (obj ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(o.notes) ? o.notes : [];
  const notes: CriticNote[] = raw.filter((n): n is Record<string, unknown> => !!n && typeof n === "object" && typeof (n as Record<string, unknown>).what === "string").slice(0, 6).map((n, i) => ({
    id: `c${Date.now().toString(36).slice(-4)}${i}`,
    area: (["mix", "arrangement", "groove", "harmony", "sound", "reference"].includes(String(n.area)) ? n.area : "mix") as CriticNote["area"],
    severity: (n.severity === 3 ? 3 : n.severity === 2 ? 2 : 1) as CriticNote["severity"],
    what: String(n.what).slice(0, 160), why: String(n.why ?? "").slice(0, 200), fix: String(n.fix ?? "").slice(0, 200),
    section: typeof n.section === "string" ? n.section : undefined, ops: Array.isArray(n.ops) && n.ops.length ? n.ops : undefined,
    status: "open", at: Date.now(),
  }));
  return { headline: typeof o.headline === "string" ? o.headline.slice(0, 200) : "", notes };
}
