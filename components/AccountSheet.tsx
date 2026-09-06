"use client";
// Your account: sign in or create one, then your own API keys. As a gate it is the
// first thing a new visitor sees; as a sheet it is Settings.
import { useEffect, useState, type FormEvent } from "react";
import { Button, IconButton } from "./ui";
import { Icon } from "./Icon";
import type { useAccount } from "@/hooks/useAccount";

type Account = ReturnType<typeof useAccount>;

export function AccountSheet({ account, mode, onClose }: { account: Account; mode: "gate" | "sheet"; onClose: () => void }) {
  useEffect(() => {
    if (mode !== "sheet") return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [mode, onClose]);

  const body = account.user ? <Settings account={account} onClose={onClose} /> : <SignIn account={account} gate={mode === "gate"} onClose={onClose} />;
  if (mode === "gate") {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-base/85 p-4 backdrop-blur-md">
        <div className="panel w-full max-w-md animate-slide-up rounded-3xl p-6 sm:p-7">{body}</div>
      </div>
    );
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Account" className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="panel max-h-[88vh] w-full animate-slide-up overflow-y-auto rounded-t-3xl p-5 sm:max-w-md sm:rounded-3xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{account.user ? "Your account" : "Sign in"}</h2>
          <IconButton name="close" label="Close" onClick={onClose} size={32} />
        </div>
        {body}
      </div>
    </div>
  );
}

function SignIn({ account, gate, onClose }: { account: Account; gate: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"in" | "up">(gate ? "up" : "in");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const r = tab === "in" ? await account.signIn(email.trim(), password) : await account.signUp(email.trim(), password);
    setBusy(false);
    if (r) setErr(r); else onClose();
  }

  return (
    <div>
      {gate && (
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink"><Icon name="logo" size={20} /></span>
          <div>
            <h1 className="text-xl font-semibold text-ink">The Producer</h1>
            <p className="text-sm text-ink-2">Talk a song into existence. Your projects live in your account.</p>
          </div>
        </div>
      )}
      <div className="mb-4 flex rounded-full bg-s2 p-1 text-sm font-medium">
        {(["up", "in"] as const).map((k) => (
          <button key={k} onClick={() => { setTab(k); setErr(null); }} className={`flex-1 rounded-full px-3 py-1.5 transition-colors ${tab === k ? "bg-s3 text-ink" : "text-ink-3 hover:text-ink-2"}`}>
            {k === "up" ? "Create account" : "Sign in"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="eyebrow mb-1 block">Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-line/60 bg-base px-3 py-2.5 text-base text-ink placeholder:text-ink-3 focus:border-accent/60 focus:outline-none" placeholder="you@example.com" />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Password</span>
          <input type="password" required minLength={8} autoComplete={tab === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-line/60 bg-base px-3 py-2.5 text-base text-ink placeholder:text-ink-3 focus:border-accent/60 focus:outline-none" placeholder={tab === "up" ? "At least 8 characters" : "Your password"} />
        </label>
        {err && <p role="alert" className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">{err}</p>}
        <Button tone="accent" type="submit" disabled={busy} className="w-full justify-center">{busy ? "One moment" : tab === "up" ? "Create my account" : "Sign in"}</Button>
      </form>
      {gate && (
        <button onClick={account.continueAsGuest} className="mt-4 w-full text-center text-sm text-ink-3 transition-colors hover:text-ink-2">
          Try it without an account. Songs stay on this device only.
        </button>
      )}
    </div>
  );
}

function Settings({ account, onClose }: { account: Account; onClose: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl bg-s2/60 px-3.5 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-s3 text-ink-2"><Icon name="user" size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{account.user?.email}</div>
          <div className="text-xs text-ink-3">Signed in. Your projects save to your account as you work.</div>
        </div>
        <Button tone="quiet" icon="logout" onClick={() => { void account.signOut(); onClose(); }}>Sign out</Button>
      </div>
      <KeyField
        title="Your Anthropic API key"
        hint={account.hints.anthropic ? `Saved, ends in ${account.hints.anthropic}. The producer thinks on your key.` : account.hints.houseKey ? "Not set. The producer is thinking on the studio's key for now. Add yours to remove any limits." : "Not set. The producer needs a key to think."}
        placeholder="sk-ant-api03-..."
        saved={!!account.hints.anthropic}
        onSave={(v) => account.saveKey("anthropic", v)}
        onRemove={() => account.removeKey("anthropic")}
        help="Create one at console.anthropic.com. It is validated live, stored encrypted, and only ever used on the server to answer you."
      />
      <KeyField
        title="ElevenLabs key (optional)"
        hint={account.hints.elevenlabs ? `Saved, ends in ${account.hints.elevenlabs}. The producer speaks on your key.` : "Not set. The producer speaks on the studio's voice."}
        placeholder="sk_..."
        saved={!!account.hints.elevenlabs}
        onSave={(v) => account.saveKey("elevenlabs", v)}
        onRemove={() => account.removeKey("elevenlabs")}
        help="Only if you want the voice billed to your own ElevenLabs account."
      />
    </div>
  );
}

function KeyField({ title, hint, placeholder, saved, onSave, onRemove, help }: { title: string; hint: string; placeholder: string; saved: boolean; onSave: (v: string) => Promise<string | null>; onRemove: () => Promise<void>; help: string }) {
  const [value, setValue] = useState(""); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  async function save() {
    if (!value.trim()) return;
    setBusy(true); setErr(null); setOk(false);
    const r = await onSave(value.trim());
    setBusy(false);
    if (r) setErr(r); else { setOk(true); setValue(""); }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon name="key" size={15} className="text-ink-3" />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <p className={`text-xs ${saved ? "text-live" : "text-ink-3"}`}>{hint}</p>
      <div className="flex gap-2">
        <input type="password" autoComplete="off" spellCheck={false} value={value} onChange={(e) => { setValue(e.target.value); setOk(false); }} placeholder={placeholder} aria-label={title} className="min-w-0 flex-1 rounded-xl border border-line/60 bg-base px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent/60 focus:outline-none" />
        <Button tone="accent" onClick={() => void save()} disabled={busy || !value.trim()}>{busy ? "Checking" : "Save"}</Button>
        {saved && <IconButton name="trash" label="Remove this key" onClick={() => void onRemove()} />}
      </div>
      {err && <p role="alert" className="text-xs text-warn">{err}</p>}
      {ok && <p className="text-xs text-live">Saved. The key checked out.</p>}
      <p className="text-xs text-ink-3">{help}</p>
    </div>
  );
}
