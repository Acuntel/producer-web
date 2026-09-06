// The user's own API keys: saved encrypted, read only on the server, never logged.
import { decryptSecret, encryptSecret, hintOf } from "./crypto";
import { supabaseAdmin, userFromRequest } from "./supabase";

export type KeyHints = { anthropic: string | null; elevenlabs: string | null };

async function profileFor(req: Request) {
  const user = await userFromRequest(req);
  const admin = supabaseAdmin();
  if (!user || !admin) return null;
  const { data } = await admin.from("profiles").select("id, anthropic_key_enc, anthropic_key_hint, elevenlabs_key_enc, elevenlabs_key_hint").eq("id", user.id).maybeSingle();
  return data ? { user, row: data as { anthropic_key_enc: string | null; anthropic_key_hint: string | null; elevenlabs_key_enc: string | null; elevenlabs_key_hint: string | null } } : { user, row: null };
}

export async function userAnthropicKey(req: Request): Promise<string | null> {
  const p = await profileFor(req);
  if (!p?.row?.anthropic_key_enc) return null;
  try { return decryptSecret(p.row.anthropic_key_enc); } catch { return null; }
}

export async function userElevenLabsKey(req: Request): Promise<string | null> {
  const p = await profileFor(req);
  if (!p?.row?.elevenlabs_key_enc) return null;
  try { return decryptSecret(p.row.elevenlabs_key_enc); } catch { return null; }
}

export async function keyHints(req: Request): Promise<KeyHints | null> {
  const p = await profileFor(req);
  if (!p) return null;
  return { anthropic: p.row?.anthropic_key_hint ?? null, elevenlabs: p.row?.elevenlabs_key_hint ?? null };
}

/** Is this Anthropic key alive? A models list costs no tokens. */
export async function validateAnthropicKey(key: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    if (r.ok) return { ok: true };
    const body = await r.text();
    if (r.status === 401) return { ok: false, reason: "Anthropic rejected that key (401). Check for a missing character." };
    return { ok: false, reason: `Anthropic answered ${r.status}: ${body.slice(0, 120)}` };
  } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "network error" }; }
}

export async function validateElevenLabsKey(key: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
    return r.ok ? { ok: true } : { ok: false, reason: `ElevenLabs answered ${r.status}` };
  } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "network error" }; }
}

export async function saveKeys(req: Request, keys: { anthropic?: string | null; elevenlabs?: string | null }): Promise<{ ok: boolean; hints?: KeyHints; error?: string }> {
  const user = await userFromRequest(req);
  const admin = supabaseAdmin();
  if (!user || !admin) return { ok: false, error: "not signed in" };
  const patch: Record<string, string | null> = {};
  if (keys.anthropic !== undefined) {
    if (keys.anthropic) {
      const v = await validateAnthropicKey(keys.anthropic);
      if (!v.ok) return { ok: false, error: v.reason };
      patch.anthropic_key_enc = encryptSecret(keys.anthropic); patch.anthropic_key_hint = hintOf(keys.anthropic);
    } else { patch.anthropic_key_enc = null; patch.anthropic_key_hint = null; }
  }
  if (keys.elevenlabs !== undefined) {
    if (keys.elevenlabs) {
      const v = await validateElevenLabsKey(keys.elevenlabs);
      if (!v.ok) return { ok: false, error: v.reason };
      patch.elevenlabs_key_enc = encryptSecret(keys.elevenlabs); patch.elevenlabs_key_hint = hintOf(keys.elevenlabs);
    } else { patch.elevenlabs_key_enc = null; patch.elevenlabs_key_hint = null; }
  }
  const { error } = await admin.from("profiles").upsert({ id: user.id, email: user.email, ...patch }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  const hints = await keyHints(req);
  return { ok: true, hints: hints ?? { anthropic: null, elevenlabs: null } };
}
