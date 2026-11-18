/**
 * Line-art icons, drawn in `currentColor` so they follow the theme. One 24×24 grid,
 * 1.6 stroke, round caps — the same hand throughout so the set reads as one.
 */
export type IconName =
  | 'aircon'
  | 'fridge'
  | 'tv'
  | 'fan'
  | 'bulb'
  | 'heater'
  | 'ricecooker'
  | 'washer'
  | 'computer'
  | 'plug'
  | 'receipt'
  | 'info'
  | 'book'
  | 'list'
  | 'pencil'
  | 'check'

const PATHS: Record<IconName, JSX.Element> = {
  // Wall split unit with a louvre and three lines of air.
  aircon: (
    <>
      <rect x="2.5" y="4" width="19" height="8" rx="2" />
      <path d="M5 9.5h14" />
      <path d="M7 15.5c0 1.5-1 2-1 3.5M12 15.5v4M17 15.5c0 1.5 1 2 1 3.5" />
    </>
  ),
  // Two-door fridge: freezer on top, handles on the right.
  fridge: (
    <>
      <rect x="5.5" y="2.5" width="13" height="19" rx="2" />
      <path d="M5.5 9h13" />
      <path d="M15.5 5v2M15.5 11.5v3.5" />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="1.5" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  // Stand fan: three blades round a hub, on a pole.
  fan: (
    <>
      <circle cx="12" cy="9" r="6.5" />
      <circle cx="12" cy="9" r="1.2" />
      <path d="M12 7.8c-.4-2 .4-3.6 2-3.8M13.1 9.6c1.9.7 2.8 2.3 2 3.8M10.9 9.6c-1.6 1.3-3.4 1.2-4-.3" />
      <path d="M12 15.5v5M8.5 20.5h7" />
    </>
  ),
  bulb: (
    <>
      <path d="M8.5 14.5c-1.8-1.2-3-3.2-3-5.5a6.5 6.5 0 0 1 13 0c0 2.3-1.2 4.3-3 5.5v2h-7z" />
      <path d="M9 19.5h6M10 21.5h4" />
    </>
  ),
  // Instant water heater box with a shower head.
  heater: (
    <>
      <rect x="4" y="2.5" width="10" height="13" rx="2" />
      <circle cx="9" cy="7.5" r="1.5" />
      <path d="M9 12v.01M14 13h3.5a2 2 0 0 1 2 2v1" />
      <path d="M17.5 16h4M18.5 18.5l-.5 1.5M21 18.5l.5 1.5M19.75 18.5v2" />
    </>
  ),
  // Rice cooker: rounded pot, lid with a handle, button on the front.
  ricecooker: (
    <>
      <path d="M4 11h16v6.5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
      <path d="M4.5 11a7.5 4 0 0 1 15 0" />
      <path d="M10.5 5.5h3" />
      <path d="M10.5 15.5h3" />
    </>
  ),
  // Front-load washer: drum door and a control strip.
  washer: (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="2" />
      <path d="M4 7h16" />
      <circle cx="12" cy="14" r="4.5" />
      <path d="M7 4.75h.01M9.5 4.75h3" />
    </>
  ),
  // Laptop.
  computer: (
    <>
      <rect x="4.5" y="4.5" width="15" height="10" rx="1.5" />
      <path d="M2.5 18.5h19l-1.5-4h-16z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2.5v5M15 2.5v5" />
      <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16v5.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
      <path d="M9 7.5h6M9 11h6M9 14.5h4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v14c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" />
      <path d="M12 6.5v14" />
    </>
  ),
  pencil: (
    <>
      <path d="M15.5 4.5l4 4L8.5 19.5 4 20l.5-4.5z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </>
  ),
}

export function Icon(props: { name: IconName; size?: number; className?: string }) {
  const size = props.size ?? 24
  return (
    <svg
      className={props.className ? `icon ${props.className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[props.name]}
    </svg>
  )
}
