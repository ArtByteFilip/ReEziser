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
  // Shape palette
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
