const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Use resolver for dynamic object types (supports overrides and custom objects)
const { getResolvedObjectTypes, getResolvedCategories, hasIconClass } = await requireModuleByName("objectTypeResolver.js");

// Ornamental Arrow SVG - Double Chevron Design
const OrnamentalArrow = ({ direction = "right" }) => {
  const rotation = direction === "left" ? 180 : 0;
  
  return (
    <svg 
      width="16" 
      height="16" 
      viewBox="0 0 16 16"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <defs>
        <filter id={`arrow-glow-${direction}`}>
          <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {/* First chevron */}
      <polyline 
        points="4,4 8,8 4,12" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        filter={`url(#arrow-glow-${direction})`}
      />
      {/* Second chevron */}
      <polyline 
        points="8,4 12,8 8,12" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        filter={`url(#arrow-glow-${direction})`}
      />
    </svg>
  );
};

const ObjectSidebar = ({ selectedObjectType, onObjectTypeSelect, onToolChange, isCollapsed, onCollapseChange }) => {
  // Get resolved object types and categories (includes overrides and custom)
  const allObjectTypes = getResolvedObjectTypes();
  const allCategories = getResolvedCategories();
  
  // Group objects by category (excluding 'notes' category which is handled specially)
  const objectsByCategory = allCategories
    .filter(category => category.id !== 'notes')
    .map(category => ({
      ...category,
      objects: allObjectTypes
        .filter(obj => obj.category === category.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))  // Sort by order
    }))
    .filter(category => category.objects.length > 0);  // Only show categories with objects
  
  const handleObjectSelect = (objectId) => {
    onObjectTypeSelect(objectId);
    if (onToolChange) {
      onToolChange('addObject');  // Automatically switch to add object tool
    }
  };
  
  const handleToggleCollapse = () => {
    onCollapseChange(!isCollapsed);
  };
  
  if (isCollapsed) {
    return (
      <div className="dmt-object-sidebar dmt-object-sidebar-collapsed">
        <button
          className="dmt-sidebar-toggle interactive-child"
          onClick={handleToggleCollapse}
          title="Show objects"
        >
          <OrnamentalArrow direction="right" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="dmt-object-sidebar">
      {/* Hidden element to force early emoji font loading */}
      <div className="dmt-font-preloader" aria-hidden="true">🔐🦪⬆️⬇️📍⚜️⚡🪐🧙‍♂️🗡️🏹⚔️⛏️🔱💀🎯🦡⚰️🛐🪔</div>
      
      <div className="dmt-sidebar-header">
        Objects
        <button
          className="dmt-sidebar-collapse-btn interactive-child"
          onClick={handleToggleCollapse}
          title="Hide sidebar"
        >
          <OrnamentalArrow direction="left" />
        </button>
      </div>
      
      <div className="dmt-sidebar-content">
        {/* Note Pin special button */}
        <div className="dmt-sidebar-note-section">
          <button
            className={`dmt-note-pin-btn ${selectedObjectType === 'note_pin' ? 'dmt-note-pin-btn-selected' : ''}`}
            onClick={() => handleObjectSelect('note_pin')}
            title="Place Note Pin"
          >
            <dc.Icon icon="lucide-map-pinned" />
            <span>Note Pin</span>
          </button>
        </div>
        
        {/* Existing category loop */}
        {objectsByCategory.map(category => (
          <div key={category.id} className="dmt-sidebar-category">
            <div className="dmt-category-label">{category.label}</div>
            
            {category.objects.map(objType => (
              <button
                key={objType.id}
                className={`dmt-object-item ${selectedObjectType === objType.id ? 'dmt-object-item-selected' : ''}`}
                onClick={() => handleObjectSelect(objType.id)}
                title={objType.label}
              >
                <div className="dmt-object-symbol">
                  {hasIconClass(objType) ? (
                    <span className={`ra ${objType.iconClass}`}></span>
                  ) : (
                    objType.symbol || '?'
                  )}
                </div>
                <div className="dmt-object-label">{objType.label}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
      
      {selectedObjectType && (
        <div className="dmt-sidebar-footer">
          <button
            className="dmt-deselect-btn"
            onClick={() => onObjectTypeSelect(null)}
            title="Deselect object"
          >
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );
};

return { ObjectSidebar };