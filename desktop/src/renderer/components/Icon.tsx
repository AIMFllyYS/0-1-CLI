import React from 'react';

// A small inline icon set (24px grid, 1.6 stroke) so the app has no icon font or network dependency.
const PATHS: Record<string, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />,
  rocket: <><path d="M5 19c.5-2.5 1.5-4 3-5.5M9 15l-2.5-.5L4 17l3 .5M9 15l.5 3 2.5-2.5" /><path d="M14 13c4-1 6-5 6.5-9.5C16 4 12 6 11 10z" /><circle cx="15.5" cy="8.5" r="1" /></>,
  wrench: <path d="M14.5 6.5a4 4 0 0 0 4.9 5.3l-9.2 9.2a2 2 0 0 1-2.8-2.8l9.2-9.2A4 4 0 0 0 14.5 6.5z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.6c.8-.3 1.5-.7 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></>,
  folder: <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />,
  file: <><path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5A1.5 1.5 0 0 1 6.5 3.5" /><path d="M14 3.5V8h4" /></>,
  terminal: <><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><path d="M8 10l3 2.5L8 15M13 15h3.5" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></>,
  list: <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  send: <path d="M12 19V6M6.5 11.5L12 6l5.5 5.5" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  shield: <path d="M12 3.5l7 2.5v5.5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6z" />,
  alert: <><path d="M12 4l9 15.5H3z" /><path d="M12 10v4.5M12 17.2h.01" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  github: <path d="M12 3.5a8.5 8.5 0 0 0-2.7 16.6c.4.1.6-.2.6-.4v-1.5c-2.4.5-2.9-1-2.9-1-.4-1-.9-1.3-.9-1.3-.8-.5.1-.5.1-.5.9.1 1.3.9 1.3.9.8 1.300 2 .9 2.500.700.1-.600.300-.900.500-1.100-1.900-.2-3.900-.9-3.900-4.200 0-.9.3-1.700.9-2.300-.1-.2-.4-1.100.1-2.300 0 0 .7-.2 2.300.9a8 8 0 0 1 4.200 0c1.600-1.100 2.300-.9 2.300-.9.5 1.200.2 2.100.1 2.300.6.6.9 1.400.9 2.300 0 3.300-2 4-3.900 4.200.3.3.6.8.6 1.600v2.300c0 .2.2.5.6.4A8.500 8.500 0 0 0 12 3.500z" />,
  sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20M6.3 6.3l1 1M16.7 16.7l1 1M6.3 17.7l1-1M16.7 7.3l1-1" /></>,
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.500 7.500 0 1 0 9.500 9.500z" />,
  play: <path d="M8 5.5v13l10-6.5z" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.400L17 7M10.500 11v5M13.500 11v5" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="1.5" /><path d="M15.500 8.500V6A1.500 1.500 0 0 0 14 4.500H6A1.500 1.500 0 0 0 4.500 6v8A1.500 1.500 0 0 0 6 15.500h2.500" /></>,
  external: <path d="M14 4.500h5.500V10M19.500 4.500L11 13M17 14v4a1.500 1.500 0 0 1-1.500 1.500h-9A1.500 1.500 0 0 1 5 18V9a1.500 1.500 0 0 1 1.500-1.500H10" />,
  refresh: <path d="M19.500 12a7.500 7.500 0 1 1-2.200-5.300M19.500 4.500v4h-4" />,
  brain: <path d="M9 4.500a3 3 0 0 0-3 3 3 3 0 0 0-1.500 5.500 3 3 0 0 0 2 4.500A3 3 0 0 0 12 19V6A2.500 2.500 0 0 0 9 4.500zM15 4.500a3 3 0 0 1 3 3 3 3 0 0 1 1.500 5.500 3 3 0 0 1-2 4.500A3 3 0 0 1 12 19" />,
};

export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; className?: string; label?: string }): React.ReactElement {
  const size = props.size ?? 18;
  return (
    <svg
      className={props.className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : true}
      focusable="false"
    >
      {PATHS[props.name]}
    </svg>
  );
}
