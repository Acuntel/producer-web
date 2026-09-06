// One icon set, one geometry: 24x24 box, 1.75 stroke, round caps and joins.
// Emoji were the loudest "generated UI" tell in this product; nothing here uses them.
import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "logo" | "headphones" | "mic" | "undo" | "redo" | "library" | "download"
  | "play" | "pause" | "loop" | "ear" | "notes" | "up" | "down" | "close"
  | "sliders" | "waveform" | "chevron" | "spark" | "stop" | "send" | "check" | "plus"
  | "user" | "folder" | "key" | "trash" | "copy" | "edit" | "logout" | "search" | "more" | "link" | "scissors" | "cloud";

const P: Record<IconName, ReactElement> = {
  // Three faders — the product mark.
  logo: <><path d="M6 20V14M6 10V4M12 20v-9M12 7V4M18 20v-4M18 12V4" /><path d="M3.5 12.5h5M9.5 5.5h5M15.5 14.5h5" /></>,
  headphones: <><path d="M4 15v-3a8 8 0 1 1 16 0v3" /><path d="M4 15.5A2.5 2.5 0 0 1 6.5 13H7a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-.5A2.5 2.5 0 0 1 4 16.5Z" /><path d="M20 15.5a2.5 2.5 0 0 0-2.5-2.5H17a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h.5a2.5 2.5 0 0 0 2.5-2.5Z" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></>,
  undo: <><path d="M4 8h10a5.5 5.5 0 0 1 0 11h-6" /><path d="M7.5 4.5 4 8l3.5 3.5" /></>,
  redo: <><path d="M20 8H10a5.5 5.5 0 0 0 0 11h6" /><path d="M16.5 4.5 20 8l-3.5 3.5" /></>,
  library: <><path d="M4 5.5v13M8.5 5.5v13" /><rect x="12" y="5" width="8" height="14" rx="1.6" /></>,
  download: <><path d="M12 3.5v11" /><path d="M8 10.5 12 14.5l4-4" /><path d="M4.5 17v1.5A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V17" /></>,
  play: <path d="M8 5.2a.6.6 0 0 1 .93-.5l9 6.8a.6.6 0 0 1 0 1l-9 6.8a.6.6 0 0 1-.93-.5Z" />,
  pause: <><rect x="7" y="5" width="3.6" height="14" rx="1.3" /><rect x="13.4" y="5" width="3.6" height="14" rx="1.3" /></>,
  loop: <><path d="M4 9.5A3.5 3.5 0 0 1 7.5 6H17" /><path d="m14.5 3.5 3 2.5-3 2.5" /><path d="M20 14.5a3.5 3.5 0 0 1-3.5 3.5H7" /><path d="m9.5 20.5-3-2.5 3-2.5" /></>,
  ear: <><path d="M7 9a5 5 0 0 1 10 0c0 2.6-1.7 3.6-2.8 4.7-.9.9-1.2 1.7-1.2 2.8a2.5 2.5 0 0 1-5 0" /><path d="M10.5 9a1.6 1.6 0 0 1 3.2 0" /></>,
  notes: <><path d="M5 4.5h11l3.5 3.5v11.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" /><path d="M15.5 4.5V8H19" /><path d="M8 12.5h7M8 16h4.5" /></>,
  up: <><path d="M7 20.5H5.2a1.2 1.2 0 0 1-1.2-1.2v-6a1.2 1.2 0 0 1 1.2-1.2H7Z" /><path d="M7 12.1 11 3.6a2.4 2.4 0 0 1 2.3 3.2L12.5 9.4h4.9a2.3 2.3 0 0 1 2.2 2.9l-1.5 6a2.3 2.3 0 0 1-2.2 1.7H7Z" /></>,
  down: <><path d="M7 3.5H5.2A1.2 1.2 0 0 0 4 4.7v6a1.2 1.2 0 0 0 1.2 1.2H7Z" /><path d="M7 11.9 11 20.4a2.4 2.4 0 0 0 2.3-3.2l-.8-2.6h4.9a2.3 2.3 0 0 0 2.2-2.9l-1.5-6A2.3 2.3 0 0 0 15.9 4H7Z" /></>,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  sliders: <><path d="M4 7h4M12 7h8M4 17h8M16 17h4" /><circle cx="10" cy="7" r="2.2" /><circle cx="14" cy="17" r="2.2" /></>,
  waveform: <path d="M3 12h2.5M8 6.5v11M12 3.5v17M16 8v8M20 11h1.5" />,
  chevron: <path d="m8.5 5.5 6.5 6.5-6.5 6.5" />,
  spark: <><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" /><path d="M18.5 16.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7Z" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.2" />,
  send: <path d="M20 4 3.5 10.2a.5.5 0 0 0 0 .93L10 13.5m10-9.5-6.2 16.4a.5.5 0 0 1-.93.02L10 13.5m10-9.5L10 13.5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  folder: <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8.3A1.5 1.5 0 0 1 19 19.5H5a1.5 1.5 0 0 1-1.5-1.5Z" />,
  key: <><circle cx="8" cy="14" r="4" /><path d="M11 11 20 2M16 6l2.5 2.5M13.5 8.5 16 11" /></>,
  trash: <><path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" /><path d="M6.5 6.5 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5" /><path d="M10 10.5v6M14 10.5v6" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="1.8" /><path d="M5.5 15.5h-.7A1.3 1.3 0 0 1 3.5 14.2V4.8A1.3 1.3 0 0 1 4.8 3.5h9.4a1.3 1.3 0 0 1 1.3 1.3v.7" /></>,
  edit: <><path d="M4 20h4.2L19.5 8.7a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8Z" /><path d="m13.5 6.5 4 4" /></>,
  logout: <><path d="M10 4.5H6.5A2 2 0 0 0 4.5 6.5v11a2 2 0 0 0 2 2H10" /><path d="M14.5 8 18.5 12l-4 4M18.5 12h-9" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  more: <><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" /></>,
  scissors: <><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="6.5" cy="17.5" r="2.5" /><path d="M8.5 8.3 20 19M8.5 15.7 20 5" /></>,
  cloud: <path d="M7 18.5A4 4 0 0 1 6.6 10.5a5.5 5.5 0 0 1 10.6 1.2A3.5 3.5 0 0 1 17.5 18.5Z" />,
};

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = name === "play" || name === "pause" || name === "stop" || name === "up" || name === "down" || name === "spark";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {P[name]}
    </svg>
  );
}
