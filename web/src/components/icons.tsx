// Inline flat-line SVG icons, ported from the design bundle (utils.jsx).
import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement>;

export const Ic = {
  search: (p: Props = {}) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  chev: (p: Props = {}) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path
        d="M3 2l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  down: (p: Props = {}) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path
        d="M2 3l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  file: (p: Props = {}) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}>
      <path
        d="M3 1h4l2 2v7a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  ),
  folder: (p: Props = {}) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}>
      <path
        d="M1 3a1 1 0 011-1h3l1 1h4a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V3z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  ),
  branch: (p: Props = {}) => (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" {...p}>
      <circle cx="3" cy="2.5" r="1.2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="3" cy="9.5" r="1.2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9" cy="4.5" r="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 3.7v4.6M3 6.5c0-1.5 1-2 3-2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  split: (p: Props = {}) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}>
      <rect x="1.5" y="2.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 3v8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  unified: (p: Props = {}) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}>
      <rect x="1.5" y="2.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 5.5h8M3 8.5h8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  send: (p: Props = {}) => (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" {...p}>
      <path
        d="M2 7L12 2l-3 10-2-4-5-1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  attach: (p: Props = {}) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}>
      <path
        d="M8.5 5.5L5 9a2 2 0 01-2.8-2.8l4.5-4.5a1.3 1.3 0 011.8 1.8L4.2 7.8a.6.6 0 11-.8-.8L7 3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  check: (p: Props = {}) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path
        d="M2 5l2 2 4-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  x: (p: Props = {}) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  dot: (p: Props = {}) => (
    <svg width="4" height="4" viewBox="0 0 4 4" {...p}>
      <circle cx="2" cy="2" r="2" fill="currentColor" />
    </svg>
  ),
  sparkle: (p: Props = {}) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}>
      <path
        d="M6 1v3M6 8v3M1 6h3M8 6h3M3 3l1.5 1.5M7.5 7.5L9 9M9 3L7.5 4.5M4.5 7.5L3 9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  play: (p: Props = {}) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path d="M2 1.5v7l6-3.5-6-3.5z" fill="currentColor" />
    </svg>
  ),
  settings: (p: Props = {}) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}>
      <circle cx="6" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.5 2.5l1 1M8.5 8.5l1 1M2.5 9.5l1-1M8.5 3.5l1-1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  warning: (p: Props = {}) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M8 7v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor"/>
    </svg>
  ),
};
