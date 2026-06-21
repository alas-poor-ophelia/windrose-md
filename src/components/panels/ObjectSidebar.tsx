


// Use resolver for dynamic object types (supports overrides and custom objects)



import type { VNode } from 'preact';
import type { MapType } from '#types/core/map.types';
import type { ObjectSet } from '#types/settings/settings.types';
import type { ToolId } from '#types/tools/tool.types';

import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { getResolvedObjectTypes, getResolvedCategories, hasIconClass, hasImagePath } from '../../objects/objectTypeResolver';
import { Icon } from '../shared/Icon';

interface ObjectSidebarProps {
  selectedObjectType: string | null;
  onObjectTypeSelect: (id: string | null) => void;
  onToolChange?: (tool: ToolId) => void;
  isCollapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  mapType?: MapType;
  objectSetId?: string | null;
  onObjectSetChange: (id: string | null) => void;
  isFreeformMode?: boolean;
  onFreeformToggle?: () => void;
}

const ObjectSidebar = ({ selectedObjectType, onObjectTypeSelect, onToolChange, isCollapsed, onCollapseChange, mapType = 'grid', objectSetId, onObjectSetChange, isFreeformMode = false, onFreeformToggle }: ObjectSidebarProps): VNode => {
  const app = useApp();
  const [searchFilter, setSearchFilter] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Read available object sets from plugin settings
  const objectSets = useMemo(() => {
    try {
      const plugin = app.plugins.plugins['windrose-md'] as { settings?: { objectSets?: ObjectSet[] } } | undefined;
      return (plugin && plugin.settings && plugin.settings.objectSets) ?? [];
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once read of plugin settings; app.plugins.plugins is a stable mutable registry object
  }, []);

  // Validate that objectSetId references an existing set; fall back to Default if stale
  const validatedSetId = useMemo(() => {
    if (objectSetId == null || objectSetId === '') return null;
    return objectSets.some(s => s.id === objectSetId) ? objectSetId : null;
  }, [objectSetId, objectSets]);

  const [activeSetId, setActiveSetId] = useState(validatedSetId);
  useEffect(() => { setActiveSetId(validatedSetId); }, [validatedSetId]);

  const handleSetChange = (newSetId: string | null): void => {
    setActiveSetId(newSetId);
    onObjectSetChange(newSetId);
  };

  const allObjectTypes = getResolvedObjectTypes(mapType, activeSetId);
  const allCategories = getResolvedCategories(mapType, activeSetId);

  const filteredObjects = (searchFilter == null || searchFilter === '') ? allObjectTypes : allObjectTypes.filter(obj => {
    const lower = searchFilter.toLowerCase();
    return obj.label.toLowerCase().includes(lower) ||
      (obj.category != null && obj.category !== '' && obj.category.toLowerCase().includes(lower));
  });

  const objectsByCategory = allCategories
    .map(category => ({
      ...category,
      objects: filteredObjects
        .filter(obj => obj.category === category.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }))
    .filter(category => category.objects.length > 0);

  const handleObjectSelect = (objectId: string): void => {
    onObjectTypeSelect(objectId);
    if (onToolChange) {
      onToolChange('addObject');
    }
  };

  const handleToggleCollapse = (): void => {
    onCollapseChange(!isCollapsed);
  };

  const handleToggleCategory = (categoryId: string): void => {
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
      <div className="windrose-object-sidebar windrose-object-sidebar-collapsed">
        <button
          className="windrose-sidebar-toggle interactive-child"
          onClick={handleToggleCollapse}
          title="Show objects"
        >
          <Icon icon="lucide-panel-left-open" size={14} />
        </button>
        {isFreeformMode && (
          <button
            className="windrose-freeform-collapsed-indicator interactive-child"
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
    <div className="windrose-object-sidebar">
      <div className="windrose-object-sidebar-header">
        <span>Objects</span>
        <button
          className="windrose-sidebar-collapse-btn interactive-child"
          onClick={handleToggleCollapse}
          title="Hide sidebar"
        >
          <Icon icon="lucide-panel-left-close" size={14} />
        </button>
      </div>

      {objectSets.length > 0 && (
        <div className="windrose-object-sidebar-set-selector">
          <select
            value={activeSetId ?? ''}
            onChange={(e) => handleSetChange(e.currentTarget.value || null)}
            className="windrose-object-sidebar-select"
          >
            <option value="">Default</option>
            {objectSets.map((set: ObjectSet) => (
              <option key={set.id} value={set.id}>{set.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="windrose-object-sidebar-search">
        <input
          type="text"
          placeholder="Filter objects..."
          value={searchFilter}
          onInput={(e) => setSearchFilter((e.target as HTMLInputElement).value)}
          className="windrose-object-sidebar-search-input"
        />
      </div>

      <div className="windrose-object-sidebar-content">
        {objectsByCategory.map(category => (
          <div key={category.id} className="windrose-object-sidebar-category">
            <button
              className="windrose-object-sidebar-category-label"
              onClick={() => handleToggleCategory(category.id)}
            >
              <Icon
                icon={collapsedCategories.has(category.id) ? 'lucide-chevron-right' : 'lucide-chevron-down'}
                size={10}
              />
              <span>{category.label}</span>
              <span className="windrose-object-sidebar-category-count">{category.objects.length}</span>
            </button>

            {!collapsedCategories.has(category.id) && (
              <div className="windrose-object-sidebar-grid">
                {category.objects.map(objType => (
                  <button
                    key={objType.id}
                    className={`windrose-object-grid-item ${selectedObjectType === objType.id ? 'windrose-object-grid-item-selected' : ''}`}
                    onClick={() => handleObjectSelect(objType.id)}
                    title={objType.label}
                  >
                    <div className="windrose-object-grid-symbol">
                      {hasImagePath(objType) ? (
                        <img
                          src={app.vault.adapter.getResourcePath(objType.imagePath ?? '')}
                          alt={objType.label}
                          className="windrose-object-grid-image"
                        />
                      ) : hasIconClass(objType) ? (
                        <span className={`ra ${objType.iconClass}`}></span>
                      ) : (
                        objType.symbol ?? '?'
                      )}
                    </div>
                    <div className="windrose-object-grid-label">{objType.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {objectsByCategory.length === 0 && (
          <div className="windrose-object-sidebar-empty">
            {searchFilter != null && searchFilter !== '' ? 'No matching objects' : 'No objects available'}
          </div>
        )}
      </div>

      <div className="windrose-object-sidebar-footer">
        <button
          className={`windrose-object-sidebar-action-btn ${isFreeformMode ? 'windrose-object-sidebar-action-active' : ''}`}
          onClick={onFreeformToggle}
          title={isFreeformMode ? 'Disable freeform placement' : 'Enable freeform placement'}
        >
          <Icon icon="lucide-diamond" size={14} />
        </button>
        {selectedObjectType != null && selectedObjectType !== '' && (
          <button
            className="windrose-object-sidebar-action-btn"
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