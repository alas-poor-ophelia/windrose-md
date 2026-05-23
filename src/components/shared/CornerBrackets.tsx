/**
 * CornerBrackets.tsx
 *
 * Shared decorative corner bracket SVGs used on panels and overlays.
 * Three visual variants: 'ornate' (main map chrome), 'compact' (toolbars),
 * and 'minimal' (selection overlays).
 */

import type { VNode } from 'preact';

type BracketPosition = 'tl' | 'tr' | 'bl' | 'br';

interface CornerBracketsProps {
  classPrefix: string;
  variant?: 'ornate' | 'compact' | 'minimal';
  filterId?: string;
}

const POSITIONS: readonly BracketPosition[] = ['tl', 'tr', 'bl', 'br'];

function CornerBracketSVG({ position, classPrefix, variant = 'compact', filterId = 'bracket' }: {
  position: BracketPosition;
  classPrefix: string;
  variant: 'ornate' | 'compact' | 'minimal';
  filterId: string;
}): VNode {
  const filterRef = `${filterId}-glow-${position}`;

  if (variant === 'ornate') {
    return (
      <svg className={`${classPrefix} ${classPrefix}-${position}`} viewBox="0 0 50 50">
        <defs>
          <filter id={filterRef}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M 0 18 L 0 0 L 18 0" stroke="#c4a57b" strokeWidth="3" fill="none" filter={`url(#${filterRef})`} />
        <path d="M 3 15 L 3 3 L 15 3" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1" fill="none" />
        <line x1="0" y1="9" x2="5" y2="9" stroke="#c4a57b" strokeWidth="2" />
        <line x1="9" y1="0" x2="9" y2="5" stroke="#c4a57b" strokeWidth="2" />
        <circle cx="18" cy="18" r="3" fill="none" stroke="#c4a57b" strokeWidth="1.5" filter={`url(#${filterRef})`} />
      </svg>
    );
  }

  return (
    <svg className={`${classPrefix} ${classPrefix}-${position}`} viewBox="-5 -5 25 25">
      <defs>
        <filter id={filterRef}>
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d="M 0 15 L 0 0 L 15 0" stroke="#c4a57b" strokeWidth="1.5" fill="none" filter={`url(#${filterRef})`} />
      <path d="M -2.5 18 L -2.5 -2.5 L 18 -2.5" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="0.8" fill="none" />
      {variant === 'compact' && (
        <>
          <line x1="-4" y1="7" x2="0" y2="7" stroke="#c4a57b" strokeWidth="1.5" />
          <line x1="7" y1="-4" x2="7" y2="0" stroke="#c4a57b" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

function CornerBrackets({ classPrefix, variant = 'compact', filterId = 'bracket' }: CornerBracketsProps): VNode {
  return (
    <>
      {POSITIONS.map(pos => (
        <CornerBracketSVG key={pos} position={pos} classPrefix={classPrefix} variant={variant} filterId={filterId} />
      ))}
    </>
  );
}

export { CornerBrackets };
export type { BracketPosition };
