const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Use resolver for dynamic object types (supports overrides and custom objects)
const { getResolvedObjectTypes, getResolvedCategories, hasIconClass, hasImagePath } = await requireModuleByName("objectTypeResolver.ts");

const ObjectSidebar = ({ selectedObjectType, onObjectTypeSelect, onToolChange, isCollapsed, onCollapseChange, mapType = 'grid', objectSetId, isFreeformMode = false, onFreeformToggle }) => {
  const [searchFilter, setSearchFilter] = dc.useState('');
  const [collapsedCategories, setCollapsedCategories] = dc.useState(new Set());

  const allObjectTypes = getResolvedObjectTypes(mapType, objectSetId);
  const allCategories = getResolvedCategories(mapType, objectSetId);

  const filteredObjects = dc.useMemo(() => {
    if (!searchFilter) return allObjectTypes;
    const lower = searchFilter.toLowerCase();
    return allObjectTypes.filter(obj =>
      obj.label.toLowerCase().includes(lower) ||
      (obj.category && obj.category.toLowerCase().includes(lower))
    );
  }, [allObjectTypes, searchFilter]);

  const objectsByCategory = allCategories
    .map(category => ({
      ...category,
      objects: filteredObjects
        .filter(obj => obj.category === category.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }))
    .filter(category => category.objects.length > 0);

  const handleObjectSelect = (objectId) => {
    onObjectTypeSelect(objectId);
    if (onToolChange) {
      onToolChange('addObject');
    }
  };

  const handleToggleCollapse = () => {
    onCollapseChange(!isCollapsed);
  };

  const handleToggleCategory = (categoryId) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  if (isCollapsed) {
    return (
      <div className="dmt-object-sidebar dmt-object-sidebar-collapsed">
        <button
          className="dmt-sidebar-toggle interactive-child"
          onClick={handleToggleCollapse}
          title="Show objects"
        >
          <dc.Icon icon="lucide-panel-left-open" size={14} />
        </button>
        {isFreeformMode && (
          <button
            className="dmt-freeform-collapsed-indicator interactive-child"
            title="Freeform placement active (tap to disable)"
            onClick={onFreeformToggle}
          >
            <dc.Icon icon="lucide-diamond" size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="dmt-object-sidebar">
      <div className="dmt-object-sidebar-header">
        <span>Objects</span>
        <button
          className="dmt-sidebar-collapse-btn interactive-child"
          onClick={handleToggleCollapse}
          title="Hide sidebar"
        >
          <dc.Icon icon="lucide-panel-left-close" size={14} />
        </button>
      </div>

      <div className="dmt-object-sidebar-search">
        <input
          type="text"
          placeholder="Filter objects..."
          value={searchFilter}
          onInput={(e) => setSearchFilter(e.target.value)}
          className="dmt-object-sidebar-search-input"
        />
      </div>

      <div className="dmt-object-sidebar-content">
        {objectsByCategory.map(category => (
          <div key={category.id} className="dmt-object-sidebar-category">
            <button
              className="dmt-object-sidebar-category-label"
              onClick={() => handleToggleCategory(category.id)}
            >
              <dc.Icon
                icon={collapsedCategories.has(category.id) ? 'lucide-chevron-right' : 'lucide-chevron-down'}
                size={10}
              />
              <span>{category.label}</span>
              <span className="dmt-object-sidebar-category-count">{category.objects.length}</span>
            </button>

            {!collapsedCategories.has(category.id) && (
              <div className="dmt-object-sidebar-grid">
                {category.objects.map(objType => (
                  <button
                    key={objType.id}
                    className={`dmt-object-grid-item ${selectedObjectType === objType.id ? 'dmt-object-grid-item-selected' : ''}`}
                    onClick={() => handleObjectSelect(objType.id)}
                    title={objType.label}
                  >
                    <div className="dmt-object-grid-symbol">
                      {hasImagePath(objType) ? (
                        <img
                          src={dc.app.vault.adapter.getResourcePath(objType.imagePath)}
                          alt={objType.label}
                          className="dmt-object-grid-image"
                        />
                      ) : hasIconClass(objType) ? (
                        <span className={`ra ${objType.iconClass}`}></span>
                      ) : (
                        objType.symbol || '?'
                      )}
                    </div>
                    <div className="dmt-object-grid-label">{objType.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {objectsByCategory.length === 0 && (
          <div className="dmt-object-sidebar-empty">
            {searchFilter ? 'No matching objects' : 'No objects available'}
          </div>
        )}
      </div>

      <div className="dmt-object-sidebar-footer">
        <button
          className={`dmt-object-sidebar-action-btn ${isFreeformMode ? 'dmt-object-sidebar-action-active' : ''}`}
          onClick={onFreeformToggle}
          title={isFreeformMode ? 'Disable freeform placement' : 'Enable freeform placement'}
        >
          <dc.Icon icon="lucide-diamond" size={14} />
        </button>
        {selectedObjectType && (
          <button
            className="dmt-object-sidebar-action-btn"
            onClick={() => onObjectTypeSelect(null)}
            title="Clear selection"
          >
            <dc.Icon icon="lucide-x" size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

return { ObjectSidebar };
