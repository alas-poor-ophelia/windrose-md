// WindroseCompass.tsx - Reusable branded compass rose SVG component, with
// an optional wind needle (weather plugin present and the map has weather).


import type { VNode } from 'preact';
import { useRef } from 'preact/hooks';

/** Wind shown on the compass */
interface CompassWindProps {
  /** Bearing the wind blows TOWARD, degrees clockwise from map north (the rose's rotation carries it to the screen) */
  towardDeg: number;
  /** 0..12 */
  beaufort: number;
  /** Tooltip wording, e.g. "Wind: Fresh breeze from WSW" (shown by the host's tooltip) */
  label: string;
}

/** Radius (viewBox units) of the Beaufort badge's centre from the hub, on the upwind side */
const WIND_BADGE_RADIUS = 33;

/**
 * Slim needle through the hub pointing downwind, with a small fletched
 * tail, and the Beaufort force in a badge at the tail (upwind) end. The
 * badge counter-rotates against the rose so its number stays upright.
 */
function renderWindNeedle(wind: CompassWindProps, rotation: number): VNode {
  const toward = Number.isFinite(wind.towardDeg) ? wind.towardDeg : 0;
  const rad = (toward * Math.PI) / 180;
  const bx = 50 - WIND_BADGE_RADIUS * Math.sin(rad);
  const by = 50 + WIND_BADGE_RADIUS * Math.cos(rad);
  const calm = wind.beaufort <= 0;
  return (
    <g className={`windrose-compass-wind${calm ? ' is-calm' : ''}`} aria-hidden="true">
      {!calm && (
        <g transform={`rotate(${toward} 50 50)`}>
          <line className="windrose-compass-wind-casing" x1="50" y1="76" x2="50" y2="17" />
          <line className="windrose-compass-wind-shaft" x1="50" y1="76" x2="50" y2="17" />
          <path className="windrose-compass-wind-fletch" d="M 46 79 L 50 74 L 54 79 M 46 75 L 50 70 L 54 75" />
          <path className="windrose-compass-wind-head" d="M 50 7 L 55 19 L 50 16.5 L 45 19 Z" />
        </g>
      )}
      <g transform={`rotate(${-rotation} ${bx} ${by})`}>
        <circle className="windrose-compass-wind-badge" cx={bx} cy={by} r="8.5" />
        <text className="windrose-compass-wind-force" x={bx} y={by} textAnchor="middle" dominantBaseline="central">
          {wind.beaufort}
        </text>
      </g>
    </g>
  );
}

interface WindroseCompassProps {
  rotation?: number;
  size?: number;
  className?: string;
  /** Wind needle and Beaufort badge; omitted draws the plain rose */
  wind?: CompassWindProps | null;
}

const WindroseCompass = ({ rotation = 0, size, className = '', wind }: WindroseCompassProps): VNode => {
  // Unique filter IDs to avoid document-global collisions
  const instanceIdRef = useRef<string | undefined>();
  instanceIdRef.current ??= `windrose-${Math.random().toString(36).slice(2, 11)}`;
  const filterId = (name: string): string => `${name}-${instanceIdRef.current}`;
  
  const style = {
    width: size,
    height: size,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transition: rotation ? 'transform 0.3s ease' : undefined
  };
  
  return (
    <svg 
      className={`windrose-compass ${className}`}
      viewBox="0 0 100 100"
      style={style}
    >
      <defs>
        <filter id={filterId('glow')}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id={filterId('whiteGlow')}>
          <feGaussianBlur stdDeviation="1.0" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id={filterId('darkGlow')}>
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id={filterId('ringGlow')}>
          <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id={filterId('compassShadow')} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0, 0, 0, 0.8)"/>
        </filter>
      </defs>
      
      <g filter={`url(#${filterId('compassShadow')})`}>
      
        {/* Background circle */}
        <circle 
          cx="50" 
          cy="50" 
          r="28" 
          fill="rgba(0, 0, 0, 0.7)"
          stroke="rgba(196, 165, 123, 0.4)"
          strokeWidth="2"
          className="windrose-compass-bg"
        />
        
        {/* Outer decorative rings */}
        <circle 
          cx="50" 
          cy="50" 
          r="48" 
          fill="none" 
          stroke="rgba(255, 255, 255, 0.4)" 
          strokeWidth="0.8"
          filter={`url(#${filterId('ringGlow')})`}
        />
        <circle 
          cx="50" 
          cy="50" 
          r="48" 
          fill="none" 
          stroke="rgba(196, 165, 123, 0.3)" 
          strokeWidth="0.5"
        />
        <circle 
          cx="50" 
          cy="50" 
          r="45" 
          fill="none" 
          stroke="rgba(255, 255, 255, 0.4)" 
          strokeWidth="0.8"
          filter={`url(#${filterId('ringGlow')})`}
        />
        <circle 
          cx="50" 
          cy="50" 
          r="45" 
          fill="none" 
          stroke="rgba(196, 165, 123, 0.2)" 
          strokeWidth="0.5"
        />
        
        {/* Cardinal direction lines */}
        {/* North */}
        <line x1="50" y1="2" x2="50" y2="22" stroke="rgba(0, 0, 0, 0.9)" strokeWidth="7" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
        <line x1="50" y1="2" x2="50" y2="22" stroke="rgba(255, 255, 255, 0.8)" strokeWidth="6" strokeLinecap="round" filter={`url(#${filterId('whiteGlow')})`}/>
        <line x1="50" y1="2" x2="50" y2="22" stroke="#c4a57b" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="50" y1="2" x2="50" y2="22" stroke="#c4a57b" strokeWidth="1" strokeLinecap="round" opacity="0.5" filter={`url(#${filterId('glow')})`}/>
        
        {/* South */}
        <line x1="50" y1="78" x2="50" y2="98" stroke="rgba(0, 0, 0, 0.75)" strokeWidth="5" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
        <line x1="50" y1="78" x2="50" y2="98" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="4.5" strokeLinecap="round" filter={`url(#${filterId('whiteGlow')})`}/>
        <line x1="50" y1="78" x2="50" y2="98" stroke="rgba(196, 165, 123, 0.55)" strokeWidth="0.9" strokeLinecap="round"/>
        
        {/* East */}
        <line x1="78" y1="50" x2="98" y2="50" stroke="rgba(0, 0, 0, 0.75)" strokeWidth="5" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
        <line x1="78" y1="50" x2="98" y2="50" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="4.5" strokeLinecap="round" filter={`url(#${filterId('whiteGlow')})`}/>
        <line x1="78" y1="50" x2="98" y2="50" stroke="rgba(196, 165, 123, 0.55)" strokeWidth="0.9" strokeLinecap="round"/>
        
        {/* West */}
        <line x1="2" y1="50" x2="22" y2="50" stroke="rgba(0, 0, 0, 0.75)" strokeWidth="5" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
        <line x1="2" y1="50" x2="22" y2="50" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="4.5" strokeLinecap="round" filter={`url(#${filterId('whiteGlow')})`}/>
        <line x1="2" y1="50" x2="22" y2="50" stroke="rgba(196, 165, 123, 0.55)" strokeWidth="0.9" strokeLinecap="round"/>
        
        {/* Secondary direction lines (NE, SE, SW, NW) */}
        <line x1="71" y1="29" x2="82" y2="18" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
        <line x1="71" y1="29" x2="82" y2="18" stroke="rgba(196, 165, 123, 0.68)" strokeWidth="0.8" strokeLinecap="round"/>
        
        <line x1="71" y1="71" x2="82" y2="82" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
        <line x1="71" y1="71" x2="82" y2="82" stroke="rgba(196, 165, 123, 0.68)" strokeWidth="0.8" strokeLinecap="round"/>
        
        <line x1="29" y1="71" x2="18" y2="82" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
        <line x1="29" y1="71" x2="18" y2="82" stroke="rgba(196, 165, 123, 0.68)" strokeWidth="0.8" strokeLinecap="round"/>
        
        <line x1="29" y1="29" x2="18" y2="18" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
        <line x1="29" y1="29" x2="18" y2="18" stroke="rgba(196, 165, 123, 0.68)" strokeWidth="0.8" strokeLinecap="round"/>
        
        {/* Compass star points */}
        <g className="windrose-compass-star">
          {/* North point (primary, golden) */}
          <path 
            d="M 50 8 L 58 50 L 50 47 L 42 50 Z" 
            fill="rgba(0, 0, 0, 0.6)"
            stroke="rgba(0, 0, 0, 0.7)"
            strokeWidth="3"
            filter={`url(#${filterId('darkGlow')})`}
          />
          <path 
            d="M 50 8 L 58 50 L 50 47 L 42 50 Z" 
            fill="#c4a57b"
            stroke="#8b6842"
            strokeWidth="0.8"
          />
          <path 
            d="M 50 8 L 58 50 L 50 47 L 42 50 Z" 
            fill="none"
            stroke="#c4a57b"
            strokeWidth="1.5"
            opacity="0.4"
            filter={`url(#${filterId('glow')})`}
          />
          
          {/* South point */}
          <path 
            d="M 50 92 L 56 50 L 50 53 L 44 50 Z" 
            fill="rgba(0, 0, 0, 0.5)"
            stroke="rgba(0, 0, 0, 0.6)"
            strokeWidth="2.5"
            filter={`url(#${filterId('darkGlow')})`}
          />
          {/* East point */}
          <path 
            d="M 92 50 L 50 44 L 53 50 L 50 56 Z" 
            fill="rgba(0, 0, 0, 0.5)"
            stroke="rgba(0, 0, 0, 0.6)"
            strokeWidth="2.5"
            filter={`url(#${filterId('darkGlow')})`}
          />
          {/* West point */}
          <path 
            d="M 8 50 L 50 44 L 47 50 L 50 56 Z" 
            fill="rgba(0, 0, 0, 0.5)"
            stroke="rgba(0, 0, 0, 0.6)"
            strokeWidth="2.5"
            filter={`url(#${filterId('darkGlow')})`}
          />
        
          {/* Secondary point fills */}
          <path 
            d="M 50 92 L 56 50 L 50 53 L 44 50 Z" 
            fill="rgba(196, 165, 123, 0.88)"
            stroke="rgba(139, 104, 66, 0.88)"
            strokeWidth="0.5"
          />
          <path 
            d="M 92 50 L 50 44 L 53 50 L 50 56 Z" 
            fill="rgba(196, 165, 123, 0.88)"
            stroke="rgba(139, 104, 66, 0.88)"
            strokeWidth="0.5"
          />
          <path 
            d="M 8 50 L 50 44 L 47 50 L 50 56 Z" 
            fill="rgba(196, 165, 123, 0.88)"
            stroke="rgba(139, 104, 66, 0.88)"
            strokeWidth="0.5"
          />
        </g>
        
        {/* Inner decorative ring */}
        <circle 
          cx="50" 
          cy="50" 
          r="25" 
          fill="none"
          stroke="rgba(196, 165, 123, 0.3)"
          strokeWidth="0.5"
        />
        
        {/* "N" letter near north arrow, layered stroke for depth */}
        <text
          x="50"
          y="62"
          textAnchor="middle"
          fontSize="36"
          fontWeight="bold"
          letterSpacing="1"
          fill="none"
          stroke="rgba(0, 0, 0, 1)"
          strokeWidth="7.65"
          fontFamily="serif"
        >N</text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          fontSize="36"
          fontWeight="bold"
          letterSpacing="1"
          fill="none"
          stroke="rgba(0, 0, 0, 1)"
          strokeWidth="6.12"
          fontFamily="serif"
        >N</text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          fontSize="36"
          fontWeight="bold"
          letterSpacing="1"
          fill="none"
          stroke="rgba(0, 0, 0, 0.9)"
          strokeWidth="4.59"
          fontFamily="serif"
        >N</text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          fontSize="36"
          fontWeight="bold"
          letterSpacing="1"
          fill="#c4a57b"
          fontFamily="serif"
        >N</text>
        
        {/* Red north indicator arrow */}
        <path 
          d="M 50 14 L 44.4 25.2 L 50 21 L 55.6 25.2 Z"
          fill="rgba(0, 0, 0, 0.7)"
          stroke="rgba(0, 0, 0, 0.8)"
          strokeWidth="2.5"
          filter={`url(#${filterId('darkGlow')})`}
        />
        <path 
          d="M 50 14 L 44.4 25.2 L 50 21 L 55.6 25.2 Z"
          fill="#e74c3c"
          stroke="#c0392b"
          strokeWidth="0.8"
        />
        <circle 
          cx="50" 
          cy="14" 
          r="3" 
          fill="#e74c3c"
          opacity="0.4"
          filter={`url(#${filterId('glow')})`}
        />

        {wind != null && renderWindNeedle(wind, rotation)}
      </g>
    </svg>
  );
};

export { WindroseCompass };
export type { CompassWindProps };