const MapControls = ({ onZoomIn, onZoomOut, onCompassClick, northDirection, currentZoom, isExpanded, onToggleExpand, onSettingsClick, mapType, showVisibilityToolbar, onToggleVisibilityToolbar }) => {
    // Compass SVG ids can collide, make unique
    const instanceIdRef = dc.useRef();
    if (!instanceIdRef.current) {
      instanceIdRef.current = `dmt-${Math.random().toString(36).substr(2, 9)}`;
    }
    const instanceId = instanceIdRef.current;
    const filterId = (name) => `${name}-${instanceId}`;
    
    return (
      <div className="dmt-controls">
        {/* Expand/Collapse Button */}
        <button
          className="dmt-expand-btn"
          onClick={onToggleExpand}
          title={isExpanded ? "Collapse to normal width" : "Expand to full width"}
        >
          <dc.Icon icon={isExpanded ? "lucide-minimize" : "lucide-expand"} />
        </button>
        
        {/* Compass Rose */}
        <div 
          className={`dmt-compass ${mapType === 'hex' ? 'dmt-compass-disabled' : ''}`}
          onClick={mapType === 'hex' ? () => {} : onCompassClick}
          title={mapType === 'hex' 
            ? "Map rotation temporarily disabled (coordinate key feature in development)"
            : `North is at ${northDirection}° (click to rotate)`
          }
        >
          <svg 
            className="dmt-compass-svg"
            viewBox="0 0 100 100"
            style={{
              transform: `rotate(${northDirection}deg)`,
              transition: 'transform 0.3s ease'
            }}
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
            
            <circle 
              cx="50" 
              cy="50" 
              r="28" 
              fill="rgba(0, 0, 0, 0.7)"
              stroke="rgba(196, 165, 123, 0.4)"
              strokeWidth="2"
              className="dmt-compass-bg"
            />
            
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
            

            <g className="dmt-compass-star">

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
              
              <path 
                d="M 50 92 L 56 50 L 50 53 L 44 50 Z" 
                fill="rgba(0, 0, 0, 0.5)"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth="2.5"
                filter={`url(#${filterId('darkGlow')})`}
              />
              <path 
                d="M 92 50 L 50 44 L 53 50 L 50 56 Z" 
                fill="rgba(0, 0, 0, 0.5)"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth="2.5"
                filter={`url(#${filterId('darkGlow')})`}
              />
              <path 
                d="M 8 50 L 50 44 L 47 50 L 50 56 Z" 
                fill="rgba(0, 0, 0, 0.5)"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth="2.5"
                filter={`url(#${filterId('darkGlow')})`}
              />
            
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
            
            <circle 
              cx="50" 
              cy="50" 
              r="25" 
              fill="none"
              stroke="rgba(196, 165, 123, 0.3)"
              strokeWidth="0.5"
            />
            
            <text 
              x="50" 
              y="62" 
              textAnchor="middle" 
              fontSize="36" 
              fontWeight="bold" 
              fill="none"
              stroke="rgba(0, 0, 0, 1)"
              strokeWidth="7.65"
              fontFamily="serif"
              letterSpacing="1"
            >N</text>

            <text 
              x="50" 
              y="62" 
              textAnchor="middle" 
              fontSize="36" 
              fontWeight="bold" 
              fill="none"
              stroke="rgba(0, 0, 0, 1)"
              strokeWidth="6.12"
              fontFamily="serif"
              letterSpacing="1"
            >N</text>

            <text 
              x="50" 
              y="62" 
              textAnchor="middle" 
              fontSize="36" 
              fontWeight="bold" 
              fill="none"
              stroke="rgba(0, 0, 0, 0.9)"
              strokeWidth="4.59"
              fontFamily="serif"
              letterSpacing="1"
            >N</text>

            <text 
              x="50" 
              y="62" 
              textAnchor="middle" 
              fontSize="36" 
              fontWeight="bold" 
              fill="#c4a57b"
              fontFamily="serif"
              letterSpacing="1"
            >N</text>
            
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
            </g>
          </svg>
        </div>
        
        {/* Zoom Controls */}
        <div className="dmt-zoom-controls">
          <button
            className="dmt-zoom-btn"
            onClick={onZoomIn}
            title="Zoom In"
          >
            +
          </button>
          <div className="dmt-zoom-level" title={`Zoom: ${Math.round(currentZoom * 100)}%`}>
            {Math.round(currentZoom * 100)}%
          </div>
          <button 
            className="dmt-zoom-btn"
            onClick={onZoomOut}
            title="Zoom Out"
          >
            -
          </button>
        </div>
        
        {/* Visibility Toggle Button */}
        <button
          className={`dmt-expand-btn ${showVisibilityToolbar ? 'dmt-expand-btn-active' : ''}`}
          onClick={onToggleVisibilityToolbar}
          title="Toggle layer visibility"
        >
          <dc.Icon icon="lucide-eye" />
        </button>
        
        {/* Settings Button */}
        <button
          className="dmt-expand-btn"
          onClick={onSettingsClick}
          title="Map Settings"
        >
          <dc.Icon icon="lucide-settings" />
        </button>
      </div>
    );
  };
  
  return { MapControls };