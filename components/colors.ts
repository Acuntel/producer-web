export const ROLE_COLOR: Record<string, string> = {
  kick: "#f59e0b", clap: "#f87171", snare: "#fb923c", hat: "#a1a1aa", openhat: "#d4d4d8", perc: "#fbbf24",
  bass: "#34d399", sub: "#2dd4bf", chords: "#818cf8", stab: "#c084fc", pad: "#60a5fa",
  lead: "#f472b6", pluck: "#e879f9", arp: "#a78bfa", fx: "#94a3b8", audio: "#fb7185",
};
export const colorOf = (role: string) => ROLE_COLOR[role] ?? "#a1a1aa";
