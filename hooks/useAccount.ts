"use client";
// Who is signed in, and the actions around it. Accounts are optional in the code
// (a guest can still play) but the product asks for one so projects live in the cloud.
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser, accountsEnabled } from "@/lib/account/supabase";

export type KeyHints = { anthropic: string | null; elevenlabs: string | null; houseKey?: boolean };
const GUEST_KEY = "producer.guest.v1";
const REMEMBER_KEY = "producer.account.v1";   // the email that signed in here before, so the gate opens on Sign in with it filled

export function useAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);
  const [hints, setHints] = useState<KeyHints>({ anthropic: null, elevenlabs: null });
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);
  const enabled = accountsEnabled();
  const remember = (email: string) => { try { localStorage.setItem(REMEMBER_KEY, email); } catch {} setRememberedEmail(email); };

  useEffect(() => {
    try { if (localStorage.getItem(GUEST_KEY) === "1" || /[?&](e2e|guest)=1/.test(window.location.search)) setGuest(true); } catch {}
    try { const r = localStorage.getItem(REMEMBER_KEY); if (r) setRememberedEmail(r); } catch {}
    const sb = supabaseBrowser();
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); if (data.session?.user?.email) remember(data.session.user.email); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => { setUser(session?.user ?? null); if (session?.user?.email) remember(session.user.email); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshHints = useCallback(async () => {
    try { const r = await fetch("/api/account/keys").then((x) => x.json()); if (r.signedIn) setHints({ anthropic: r.anthropic, elevenlabs: r.elevenlabs, houseKey: r.houseKey }); }
    catch { /* offline is fine */ }
  }, []);
  useEffect(() => { if (user) void refreshHints(); else setHints({ anthropic: null, elevenlabs: null }); }, [user, refreshHints]);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    const sb = supabaseBrowser(); if (!sb) return "Accounts are not configured.";
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return friendlyAuth(error.message);
    remember(email); return null;
  }, []);
  const signUp = useCallback(async (email: string, password: string): Promise<string | null> => {
    const sb = supabaseBrowser(); if (!sb) return "Accounts are not configured.";
    const { data, error } = await sb.auth.signUp({ email, password });
    // An email that already has an account is not a dead end: try signing in with what they typed.
    if (error && /already registered|already exists|already been registered/i.test(error.message)) {
      const r = await sb.auth.signInWithPassword({ email, password });
      if (r.error) return "That email already has an account, and that password did not match it. Switch to Sign in and try again.";
      remember(email); return null;
    }
    if (error) return friendlyAuth(error.message);
    if (!data.session) { const r = await sb.auth.signInWithPassword({ email, password }); if (r.error) return friendlyAuth(r.error.message); }
    remember(email); return null;
  }, []);
  const signOut = useCallback(async () => { const sb = supabaseBrowser(); await sb?.auth.signOut(); setUser(null); }, []);
  const continueAsGuest = useCallback(() => { try { localStorage.setItem(GUEST_KEY, "1"); } catch {} setGuest(true); }, []);
  const leaveGuest = useCallback(() => { try { localStorage.removeItem(GUEST_KEY); } catch {} setGuest(false); }, []);

  const saveKey = useCallback(async (which: "anthropic" | "elevenlabs", value: string): Promise<string | null> => {
    const r = await fetch("/api/account/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [which]: value }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "network error" }));
    if (!r.ok) return r.error ?? "Could not save the key.";
    if (r.hints) setHints((h) => ({ ...h, ...r.hints }));
    return null;
  }, []);
  const removeKey = useCallback(async (which: "anthropic" | "elevenlabs") => {
    const r = await fetch("/api/account/keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ which }) }).then((x) => x.json()).catch(() => null);
    if (r?.hints) setHints((h) => ({ ...h, ...r.hints }));
  }, []);

  return { enabled, ready, user, guest, hints, rememberedEmail, signIn, signUp, signOut, continueAsGuest, leaveGuest, saveKey, removeKey, refreshHints };
}

function friendlyAuth(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "That email and password do not match. Check the password, or create the account if this is your first time.";
  if (/email not confirmed/i.test(msg)) return "That account is not confirmed yet.";
  if (/already registered|already exists/i.test(msg)) return "That email already has an account. Sign in instead.";
  if (/password.*(short|least)/i.test(msg)) return "Use at least 8 characters for the password.";
  if (/rate limit/i.test(msg)) return "Too many tries. Give it a minute.";
  return msg;
}
