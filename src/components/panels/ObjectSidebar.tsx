


// Use resolver for dynamic object types (supports overrides and custom objects)



import type { MapType } from '#types/core/map.types';
import type { ObjectSet } from '#types/settings/settings.types';

import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { getResolvedObjectTypes, getResolvedCategories, hasIconClass, hasImagePath } from '../../objects/objectTypeResolver';
import { Icon } from '../shared/Icon';

interface ObjectSidebarProps {
  selectedObjectType: string | null;
  onObjectTypeSelect: (id: string | null) => void;
  onToolChange?: (tool: string) => void;
  isCollapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  mapType?: MapType;
  objectSetId?: string | null;
  onObjectSetChange: (id: string | null) => void;
  isFreeformMode?: boolean;
  onFreeformToggle?: () => void;
}

const ObjectSidebar = ({ selectedObjectType, onObjectTypeSelect, onToolChange, isCollapsed, onCollapseChange, mapType = 'grid', objectSetId, onObjectSetChange, isFreeformMode = false, onFreeformToggle }: ObjectSidebarProps) => {
  const app = useApp();
  const [searchFilter, setSearchFilter] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Local state for immediate re-render; synced from prop and persisted via parent
  const [activeSetId, setActiveSetId] = useState(objectSetId ?? null);
  useEffect(() => { setActiveSetId(objectSetId ?? null); }, [objectSetId]);

  const handleSetChange = (newSetId: string | null) => {
    setActiveSetId(newSetId);
    onObjectSetChange(newSetId);
  };

  // Read available object sets from plugin settings
  const objectSets = useMemo(() => {
    try {
      const plugin = app.plugins.plugins['dungeon-map-tracker-settings'] as { settings?: { objectSets?: ObjectSet[] } } | undefined;
      return (plugin && plugin.settings && plugin.settings.objectSets) || [];
    } catch {
      return [];
    }
  }, []);

  const allObjectTypes = getResolvedObjectTypes(mapType, activeSetId);
  const allCategories = getResolvedCategories(mapType, activeSetId);

  const filteredObjects = !searchFilter ? allObjectTypes : allObjectTypes.filter(obj => {
    const lower = searchFilter.toLowerCase();
    return obj.label.toLowerCase().includes(lower) ||
      (obj.category && obj.category.toLowerCase().includes(lower));
  });

  const objectsByCategory = allCategories
    .map(category => ({
      ...category,
      objects: filteredObjects
        .filter(obj => obj.category === category.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }))
    .filter(category => category.objects.length > 0);

  const handleObjectSelect = (objectId: string) => {
    onObjectTypeSelect(objectId);
    if (onToolChange) {
      onToolChange('addObject');
    }
  };

  const handleToggleCollapse = () => {
    onCollapseChange(!isCollapsed);
  };

  const handleToggleCategory = (categoryId: string) => {
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
          <Icon icon="lucide-panel-left-open" size={14} />
        </button>
        {isFreeformMode && (
          <button
            className="dmt-freeform-collapsed-indicator interactive-child"
            title="Freeform placement active (tap to disable)"
            onClick={onFreeformToggle}
          >
            <Icon icon="lucide-diamond" size={12} />
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
          <Icon icon="lucide-panel-left-close" size={14} />
        </button>
      </div>

      {objectSets.length > 0 && (
        <div className="dmt-object-sidebar-set-selector">
          <select
            value={activeSetId || ''}
            onChange={(e) => handleSetChange(e.currentTarget.value || null)}
            className="dmt-object-sidebar-select"
          >
            <option value="">Default</option>
            {objectSets.map((set: ObjectSet) => (
              <option key={set.id} value={set.id}>{set.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="dmt-object-sidebar-search">
        <input
          type="text"
          placeholder="Filter objects..."
          value={searchFilter}
          onInput={(e) => setSearchFilter((e.target as HTMLInputElement).value)}
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
              <Icon
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
                          src={app.vault.adapter.getResourcePath(objType.imagePath!)}
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
          <Icon icon="lucide-diamond" size={14} />
        </button>
        {selectedObjectType && (
          <button
            className="dmt-object-sidebar-action-btn"
            onClick={() => onObjectTypeSelect(null)}
            title="Clear selection"
          >
            <Icon icon="lucide-x" size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export { ObjectSidebar };