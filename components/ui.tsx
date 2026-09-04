"use client";
// Shared primitives. Every control in the studio comes from here so that
// padding, radius, hover, disabled and focus behave identically everywhere.
import { useId, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement>;

const TONE = {
  ghost: "bg-s2 text-ink-2 hover:bg-s3 hover:text-ink active:bg-s3",
  solid: "bg-s3 text-ink hover:brightness-125 active:brightness-95",
  accent: "bg-accent text-accent-ink font-semibold hover:brightness-110 active:brightness-95",
  live: "bg-live text-accent-ink font-semibold hover:brightness-110",
  quiet: "bg-transparent text-ink-3 hover:bg-s2 hover:text-ink",
} as const;

export function Button({
  children, tone = "ghost", icon, className = "", ...rest
}: BtnProps & { tone?: keyof typeof TONE; icon?: IconName }) {
  return (
    <button
      {...rest}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium
        transition-[background-color,color,filter,transform] duration-150 ease-snap
        disabled:pointer-events-none disabled:opacity-40 ${TONE[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/** Icon-only control. Always carries a real accessible name plus a hover label. */
export function IconButton({
  name, label, tone = "ghost", size = 36, className = "", ...rest
}: BtnProps & { name: IconName; label: string; tone?: keyof typeof TONE; size?: number }) {
  const [hover, setHover] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        {...rest}
        aria-label={label}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{ width: size, height: size }}
        className={`grid shrink-0 place-items-center rounded-full transition-[background-color,color,filter] duration-150
          disabled:pointer-events-none disabled:opacity-30 ${TONE[tone]} ${className}`}
      >
        <Icon name={name} size={Math.round(size * 0.5)} />
      </button>
      {hover && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap
            rounded-lg border border-line/60 bg-s3 px-2 py-1 text-xs text-ink shadow-panel animate-fade-up"
        >
          {label}
        </span>
      )}
    </span>
  );
}

export function Panel({ children, className = "", sunken = false }: { children: ReactNode; className?: string; sunken?: boolean }) {
  return <div className={`${sunken ? "panel-sunken" : "panel"} rounded-2xl ${className}`}>{children}</div>;
}

/** A titled, collapsible group. Replaces the old row of tiny "▾ mixer" toggles. */
export function Disclosure({
  title, icon, open, onToggle, badge, right, children,
}: {
  title: string; icon: IconName; open: boolean; onToggle: () => void;
  badge?: number; right?: ReactNode; children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="panel-sunken overflow-hidden rounded-2xl">
      <div className="flex items-center gap-1 pr-2">
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-s2/60"
        >
          <Icon name={icon} size={15} className="shrink-0 text-ink-3" />
          <span className="eyebrow truncate !text-ink-2">{title}</span>
          {badge ? (
            <span className="tnum grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
              {badge}
            </span>
          ) : null}
          <Icon
            name="chevron"
            size={14}
            className={`ml-auto shrink-0 text-ink-3 transition-transform duration-200 ease-snap ${open ? "rotate-90" : ""}`}
          />
        </button>
        {right}
      </div>
      {open && <div id={id} className="animate-fade-up px-3 pb-3">{children}</div>}
    </section>
  );
}

export function Chip({ children, tone = "quiet" }: { children: ReactNode; tone?: "quiet" | "accent" | "cool" }) {
  const c = tone === "accent" ? "bg-accent/15 text-accent" : tone === "cool" ? "bg-cool/15 text-cool" : "bg-s3 text-ink-3";
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${c}`}>{children}</span>;
}

/** Horizontal scroller that fades at both edges rather than slicing content. */
export function ScrollX({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="group" aria-label={label} className={`scroll-x flex gap-1.5 pb-1.5 ${className}`}>
      {children}
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-s2 text-ink-3">
        <Icon name={icon} size={18} />
      </span>
      <p className="text-sm text-ink-2">{title}</p>
      {hint && <p className="max-w-[38ch] text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
