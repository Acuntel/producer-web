// Supabase clients. Browser: one cookie-backed client so route handlers can see the
// session. Server: a per-request client that reads the caller's cookies, plus an
// admin client (service role) used only for the encrypted key columns.
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const accountsEnabled = () => !!SUPABASE_URL && !!SUPABASE_ANON;

let browser: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient | null {
  if (typeof window === "undefined" || !accountsEnabled()) return null;
  browser ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
  return browser;
}

function parseCookies(header: string | null): { name: string; value: string }[] {
  if (!header) return [];
  return header.split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf("=");
    return i < 0 ? { name: p, value: "" } : { name: p.slice(0, i), value: decodeURIComponent(p.slice(i + 1)) };
  });
}

/** The caller's identity from the request cookies, or null. */
export async function userFromRequest(req: Request): Promise<{ id: string; email: string | null } | null> {
  if (!accountsEnabled()) return null;
  const cookies = parseCookies(req.headers.get("cookie"));
  if (!cookies.some((c) => c.name.startsWith("sb-"))) return null;
  const client = createServerClient(SUPABASE_URL, SUPABASE_ANON, { cookies: { getAll: () => cookies, setAll: () => {} } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

let admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  admin ??= createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
