import type { ReactNode } from 'react';

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  menu: () => (
    <Svg>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  ),
  plus: (p: { size?: number }) => (
    <Svg size={p.size}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  play: () => (
    <Svg>
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  stop: () => (
    <Svg>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />
    </Svg>
  ),
  camera: () => (
    <Svg>
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 10.5l5-3v9l-5-3z" />
    </Svg>
  ),
  director: () => (
    <Svg>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Svg>
  ),
  duplicate: () => (
    <Svg size={18}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Svg>
  ),
  trash: () => (
    <Svg size={18}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Svg>
  ),
  lock: (p: { open?: boolean }) => (
    <Svg size={18}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d={p.open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
    </Svg>
  ),
  eye: (p: { off?: boolean }) => (
    <Svg size={18}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {p.off && <path d="M4 4l16 16" />}
    </Svg>
  ),
  still: () => (
    <Svg size={18}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12h6" />
    </Svg>
  ),
  more: () => (
    <Svg size={18}>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
    </Svg>
  ),
  frame: () => (
    <Svg size={18}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <circle cx="12" cy="10" r="2.2" />
      <path d="M8.5 16.5c.6-2 2-3 3.5-3s2.9 1 3.5 3" />
    </Svg>
  ),
  group: () => (
    <Svg size={18}>
      <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 2.5" />
      <rect x="7" y="7" width="5" height="5" rx="1" />
      <rect x="12" y="12" width="5" height="5" rx="1" />
    </Svg>
  ),
  ungroup: () => (
    <Svg size={18}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </Svg>
  ),
  guides: () => (
    <Svg size={18}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M9 5v14M15 5v14M3 9.7h18M3 14.3h18" strokeWidth={1.1} />
    </Svg>
  ),
  warning: () => (
    <Svg size={14}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17.2v.3" />
    </Svg>
  ),
  share: () => (
    <Svg size={18}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </Svg>
  ),
  close: () => (
    <Svg size={18}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  storyboard: () => (
    <Svg>
      <rect x="3" y="4" width="8" height="6" rx="1" />
      <rect x="13" y="4" width="8" height="6" rx="1" />
      <rect x="3" y="14" width="8" height="6" rx="1" />
      <rect x="13" y="14" width="8" height="6" rx="1" />
    </Svg>
  ),
  list: () => (
    <Svg>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="0.9" fill="currentColor" />
      <circle cx="4.5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="4.5" cy="18" r="0.9" fill="currentColor" />
    </Svg>
  ),
  split: () => (
    <Svg size={18}>
      <path d="M12 3v18" strokeDasharray="2.5 2.5" />
      <rect x="3" y="7" width="6" height="10" rx="1.5" />
      <rect x="15" y="7" width="6" height="10" rx="1.5" />
    </Svg>
  ),
  chevronDown: () => (
    <Svg size={18}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  chevronUp: () => (
    <Svg size={18}>
      <path d="M6 15l6-6 6 6" />
    </Svg>
  ),
  path: () => (
    <Svg size={18}>
      <circle cx="5" cy="18" r="2" />
      <path d="M7 17c5-1 2-8 7-9s4 3 6-2" strokeDasharray="0" />
      <path d="M17 4l3 2-2 3" />
    </Svg>
  ),
  record: () => (
    <Svg size={18}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" fill="#ff5c5c" stroke="none" />
    </Svg>
  ),
  cube: () => (
    <Svg>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Svg>
  ),
  // Shape palette
  arrow: () => (
    <Svg size={28}>
      <path d="M4 18c4-1 9-4 13-10" />
      <path d="M12.5 7.5L17 8l.5 4.5" />
    </Svg>
  ),
  label: () => (
    <Svg size={28}>
      <rect x="4" y="5" width="16" height="7" rx="3.5" />
      <path d="M12 12v8" />
      <circle cx="12" cy="20" r="0.8" fill="currentColor" />
    </Svg>
  ),
  movieCamera: () => (
    <Svg size={28}>
      <rect x="3" y="9" width="12" height="9" rx="2" />
      <path d="M15 12l5-2.5v8L15 15z" />
      <circle cx="6.5" cy="5.5" r="2.5" />
      <circle cx="12" cy="5.5" r="2.5" />
    </Svg>
  ),
  person: () => (
    <Svg size={28}>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 8v7M8 11l4-1.5 4 1.5M9.5 21l2.5-6 2.5 6" />
    </Svg>
  ),
  box: () => (
    <Svg size={28}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Svg>
  ),
  sphere: () => (
    <Svg size={28}>
      <circle cx="12" cy="12" r="8.5" />
      <ellipse cx="12" cy="12" rx="8.5" ry="3" />
    </Svg>
  ),
  cylinder: () => (
    <Svg size={28}>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
    </Svg>
  ),
  cone: () => (
    <Svg size={28}>
      <path d="M12 3L5 18M12 3l7 15" />
      <ellipse cx="12" cy="18" rx="7" ry="2.5" />
    </Svg>
  ),
  wall: () => (
    <Svg size={28}>
      <path d="M4 20V6l16-2v14z" />
      <path d="M4 13l16-2" />
    </Svg>
  ),
  ramp: () => (
    <Svg size={28}>
      <path d="M3 19h18L3 8z" />
    </Svg>
  ),
};
