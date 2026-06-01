import type { SVGProps } from "react";

/** Jobby wordmark glyph (two brackets framing a synapse). */
export function BrandGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 4C5.5 4 5.5 9 5.5 9S5.5 12 3 12c2.5 0 2.5 3 2.5 3S5.5 20 8 20" />
      <path d="M16 4c2.5 0 2.5 5 2.5 5S18.5 12 21 12c-2.5 0-2.5 3-2.5 3S18.5 20 16 20" />
      <circle cx="10.4" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="13.6" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GreenhouseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M5 21c-1-9 4-15 15-16 .6 7-2.4 12-7.5 13.5C9 19.5 7 20 5 21z" />
    </svg>
  );
}

export function LeverIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      aria-hidden="true"
      {...props}
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function GlobeScanIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18" />
    </svg>
  );
}

export function NetworkNodesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
      {...props}
    >
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
      <path d="M8 7.6l8 0M7 8.6l4 6.4M17 8.6l-4 6.4" />
    </svg>
  );
}

export function DatabaseGateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
      {...props}
    >
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-5M4.5 10.5v5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-5" />
    </svg>
  );
}

export function VectorGateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
      {...props}
    >
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="18" cy="7" r="2.3" />
      <circle cx="9" cy="18" r="2.3" />
      <circle cx="18" cy="17" r="2.3" />
      <path d="M8 7l8 .6M7.8 8.1l1 7.8M16.4 9l-6 7.4M16 17.6l-5 .2" />
    </svg>
  );
}

export function ReasoningGateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
      {...props}
    >
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
      <path d="M9.5 6.5V4M14.5 6.5V4M9.5 20v-2.5M14.5 20v-2.5M6.5 9.5H4M6.5 14.5H4M20 9.5h-2.5M20 14.5h-2.5" />
      <circle cx="12" cy="12" r="2.3" />
    </svg>
  );
}
