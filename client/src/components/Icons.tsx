import type { CSSProperties, ReactNode } from 'react'

export type IconName =
  | 'check'
  | 'plus'
  | 'x'
  | 'menu'
  | 'search'
  | 'calendar'
  | 'calendar-days'
  | 'sun'
  | 'inbox'
  | 'list'
  | 'layers'
  | 'check-circle'
  | 'repeat'
  | 'timer'
  | 'flame'
  | 'chart'
  | 'sparkles'
  | 'trash'
  | 'sliders'
  | 'more'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-up'
  | 'clock'
  | 'tag'
  | 'note'
  | 'flag'
  | 'pencil'
  | 'download'
  | 'upload'
  | 'link'
  | 'moon'
  | 'target'
  | 'refresh'
  | 'cloud'
  | 'info'
  | 'play'
  | 'pause'
  | 'square'
  | 'arrow-right'
  | 'smartphone'
  | 'monitor'
  | 'key'
  | 'cpu'
  | 'eye'
  | 'eye-off'
  | 'bell'
  | 'mic'
  | 'kanban'
  | 'filter'
  | 'sort'
  | 'zap'

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
    </>
  ),
  'calendar-days': (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-5.5l-1.8 3h-5.4l-1.8-3H2" />
      <path d="M5.5 5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-7A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1Z" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4.2" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.2" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.2" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.4 12.2 2.4 2.4 4.8-5.2" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="8" />
      <path d="M12 9.5v4l2.5 2.5M9 2.5h6" />
    </>
  ),
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
  ),
  chart: (
    <>
      <path d="M3 21h18" />
      <path d="M6 21v-6M11 21V9M16 21v-9M21 21V5" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
      <path d="m18.5 15.5.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6.5h17" />
      <path d="M8.5 6.5V4.2c0-.7.5-1.2 1.2-1.2h4.6c.7 0 1.2.5 1.2 1.2v2.3" />
      <path d="M6 6.5 7 20a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-13.5" />
      <path d="M10 10.5v6.5M14 10.5v6.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3" />
      <path d="M1.8 15h4.4M9.8 12h4.4M17.8 17h4.4" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  tag: (
    <>
      <path d="M20.5 13.5 13 21a2 2 0 0 1-2.8 0L3 13.8V4a1 1 0 0 1 1-1h9.8l6.7 6.7a2 2 0 0 1 0 2.8Z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  note: (
    <>
      <path d="M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v10L15 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z" />
      <path d="M15 20.5V15h5.5M7.5 8h9M7.5 12h6" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V3.4" />
      <path d="M5 4.2h11.6l-2.2 3.4 2.2 3.4H5Z" fill="currentColor" stroke="none" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.7 3.3a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5Z" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 21h16" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 4v6h-6" />
    </>
  ),
  cloud: <path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6.5 6.5 0 0 0 5.4 10.6 4.2 4.2 0 0 0 6.5 19h11Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  pause: (
    <>
      <path d="M9 5v14M15 5v14" />
    </>
  ),
  square: <rect x="6" y="6" width="12" height="12" rx="2" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  smartphone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8 20.5h8M12 16.5v4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 9 9M17 17l2-2M14 14l2-2" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.9M6.2 7.6A16.6 16.6 0 0 0 2.5 12s3.5 6 9.5 6a9.6 9.6 0 0 0 3.6-.7" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5Z" />
      <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M9 20.5h6" />
    </>
  ),
  kanban: (
    <>
      <rect x="3" y="3" width="5" height="18" rx="1.6" />
      <rect x="10" y="3" width="5" height="12" rx="1.6" />
      <rect x="17" y="3" width="4" height="16" rx="1.6" />
    </>
  ),
  filter: <path d="M3 4h18l-7 8.2V19l-4 2v-8.8L3 4Z" />,
  sort: (
    <>
      <path d="M4 6h16M4 12h10M4 18h6" />
      <path d="M18 10v9M15 16l3 3 3-3" />
    </>
  ),
  zap: <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
}

interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span
      className="logo"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      aria-hidden="true"
    >
      <Icon name="check" size={Math.round(size * 0.58)} strokeWidth={2.8} />
    </span>
  )
}
