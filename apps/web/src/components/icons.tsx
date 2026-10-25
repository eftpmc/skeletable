import type { SVGProps } from "react";

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function DiscoverIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7.5" height="10" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="6" rx="2" />
      <rect x="3" y="16" width="7.5" height="5" rx="2" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="2" />
    </svg>
  );
}

export function ClosetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5a2 2 0 1 1 2 2c-.8 0-2 .6-2 1.6V9" />
      <path d="M12 9 3.6 15.2A1.5 1.5 0 0 0 4.5 18h15a1.5 1.5 0 0 0 .9-2.8Z" />
    </svg>
  );
}

export function SavedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
