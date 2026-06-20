import { Notice, Setting } from 'obsidian';
import { DragHelpers } from '../helpers/dragHelpers';
import { IconHelpers } from '../helpers/iconHelpers';
import { FolderSuggest } from '../helpers/FolderSuggest';
import { ObjectHelpers } from '../helpers/objectHelpers';
import { ObjectSetHelpers } from '../helpers/objectSetHelpers';
import { ObjectEditModal } from '../modals/ObjectEditModal';
import { CategoryEditModal } from '../modals/CategoryEditModal';
import { ExportModal } from '../modals/ExportModal';
import { ImportModal } from '../modals/ImportModal';
import { ObjectSetRenameModal } from '../modals/ObjectSetRenameModal';
import { ObjectSetExportModal } from '../modals/ObjectSetExportModal';
import { ObjectSetImportModal } from '../modals/ObjectSetImportModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { PromptModal } from '../modals/PromptModal';
import { ContentPackBrowserModal } from '../../content-packs/ContentPackBrowserModal';
import type { SettingsTabThis } from './settingsTabContext';
import type { CustomObject, CustomCategory, ObjectSet } from '#types/settings/settings.types';

/**
 * Extended this-type that includes the actual method signatures used internally.
 * The SettingsTabThis interface has simplified signatures for cross-mixin use,
 * but internal calls need the real parameter lists.
 */
interface TabRenderObjectsThis extends Omit<SettingsTabThis, 'renderObjectList' | 'setupDragDropForList' | 'renderObjectRow'> {
  renderObjectList(container: HTMLElement, allCategories: ResolvedCategory[], allObjects: ResolvedObject[], hiddenObjects: ResolvedObject[]): void;
  setupDragDropForList(objectList: HTMLElement, category: ResolvedCategory): void;
  renderObjectRow(container: HTMLElement, obj: ResolvedObject, isHiddenSection: boolean, canDrag?: boolean): void;
}

// settingsPlugin-TabRenderObjects.js
// WindroseMDSettingsTab render methods - Object types
// This file is concatenated into the settings plugin template by the assembler

/** Resolved object entry from ObjectHelpers.getResolved() */
interface ResolvedObject {
  id: string;
  category?: string;
  symbol?: string;
  label?: string;
  imagePath?: string;
  iconClass?: string;
  order: number;
  isBuiltIn: boolean;
  isModified?: boolean;
  isCustom?: boolean;
  isHidden?: boolean;
  [key: string]: unknown;
}

/** Resolved category entry from ObjectHelpers.getCategories() */
interface ResolvedCategory {
  id: string;
  label?: string;
  order: number;
  isBuiltIn: boolean;
  isCustom?: boolean;
}

/** Settings keys that hold Record<string, ObjectOverride> */
type OverridesKey = 'hexObjectOverrides' | 'gridObjectOverrides';

/** Settings keys that hold CustomObject[] */
type CustomObjectsKey = 'customHexObjects' | 'customGridObjects';

/** Settings keys that hold CustomCategory[] */
type CustomCategoriesKey = 'customHexCategories' | 'customGridCategories';

export const TabRenderObjectsMethods = {
  renderObjectTypesContent(this: TabRenderObjectsThis, containerEl: HTMLElement): void {
    containerEl.createEl('p', {
      text: 'Customize map objects: modify built-in objects, create custom objects, or hide objects you don\'t use.',
      cls: 'setting-item-description'
    });

    // =========================================================================
    // Object Sets
    // =========================================================================

    this.renderObjectSetsBlock(containerEl);

    containerEl.createEl('div', { cls: 'windrose-set-separator' });

    // Map Type selector dropdown
    new Setting(containerEl)
      .setName('Map type')
      .setDesc('Select which map type to configure objects for')
      .addDropdown(dropdown => dropdown
        .addOption('grid', 'Grid maps')
        .addOption('hex', 'Hex maps')
        .setValue(this.selectedMapType)
        .onChange((value: string) => {
          this.selectedMapType = value as 'grid' | 'hex';
          this.display();
        }));

    // Get settings for the selected map type
    const mapTypeSettings = this.getObjectSettingsForMapType();

    // Add Custom Object button
    new Setting(containerEl)
      .setName('Add custom object')
      .setDesc('Create a new map object with your own symbol')
      .addButton(btn => btn
        .setButtonText('+ Add Object')
        .setCta()
        .onClick(() => {
          new ObjectEditModal(this.app, this.plugin, null, () => {
            this.settingsChanged = true;
            void this.plugin.saveSettings();
            this.display();
          }, this.selectedMapType).open();
        }));

    // Add Custom Category button
    new Setting(containerEl)
      .setName('Add custom category')
      .setDesc('Create a new category to organize objects')
      .addButton(btn => btn
        .setButtonText('+ Add Category')
        .onClick(() => {
          new CategoryEditModal(this.app, this.plugin, null, () => {
            this.settingsChanged = true;
            void this.plugin.saveSettings();
            this.display();
          }, this.selectedMapType).open();
        }));

    // Import/Export buttons
    new Setting(containerEl)
      .setName('Import / Export')
      .setDesc('Share object configurations as JSON files')
      .addButton(btn => btn
        .setButtonText('Import')
        .onClick(() => {
          new ImportModal(this.app, this.plugin, () => {
            this.settingsChanged = true;
            this.display();
          }, this.selectedMapType).open();
        }))
      .addButton(btn => btn
        .setButtonText('Export')
        .onClick(() => {
          new ExportModal(this.app, this.plugin, this.selectedMapType).open();
        }));

    // Get resolved data using helpers with map-type-specific settings
    const allCategories = ObjectHelpers.getCategories(mapTypeSettings as unknown as Record<string, unknown>) as ResolvedCategory[];
    const allObjects = ObjectHelpers.getResolved(mapTypeSettings as unknown as Record<string, unknown>) as ResolvedObject[];
    const hiddenObjects = ObjectHelpers.getHidden(mapTypeSettings as unknown as Record<string, unknown>) as ResolvedObject[];

    // Check if there are any customizations for this map type
    const hasOverrides = Object.keys(mapTypeSettings.objectOverrides ?? {}).length > 0;
    const hasCustomObjects = (mapTypeSettings.customObjects ?? []).length > 0;
    const hasCustomCategories = (mapTypeSettings.customCategories ?? []).length > 0;
    const hasAnyCustomizations = hasOverrides || hasCustomObjects || hasCustomCategories;

    // Reset All button (only show if there are customizations)
    if (hasAnyCustomizations) {
      new Setting(containerEl)
        .setName(`Reset ${this.selectedMapType === 'hex' ? 'Hex' : 'Grid'} to Defaults`)
        .setDesc(`Restore built-in objects for ${this.selectedMapType} maps. Does not affect saved sets.`)
        .addButton(btn => btn
          .setButtonText('Reset to defaults')
          .setWarning()
          .onClick(async () => {
            const counts: string[] = [];
            if (hasOverrides) counts.push(`${Object.keys(mapTypeSettings.objectOverrides).length} modification(s)`);
            if (hasCustomObjects) counts.push(`${mapTypeSettings.customObjects.length} custom object(s)`);
            if (hasCustomCategories) counts.push(`${mapTypeSettings.customCategories.length} custom category(ies)`);

            if (await new ConfirmModal(this.app, {
              message: `This will remove ${counts.join(', ')} for ${this.selectedMapType} maps. Saved sets are not affected. Maps using custom objects will show "?" placeholders.`,
              confirmText: 'Reset to Defaults',
              isDestructive: true
            }).openAndGetValue()) {
              this.updateObjectSettingsForMapType({
                objectOverrides: {},
                customObjects: [],
                customCategories: []
              });
              this.settingsChanged = true;
              await this.plugin.saveSettings();
              this.display();
            }
          }));
    }

    // Search/filter input
    const searchContainer = containerEl.createDiv({ cls: 'windrose-settings-search-container' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      cls: 'windrose-settings-search-input',
      attr: { placeholder: 'Filter objects...' },
      value: this.objectFilter || ''
    });
    searchInput.addEventListener('input', (e: Event) => {
      this.objectFilter = (e.target as HTMLInputElement).value.toLowerCase().trim();
      this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
    });

    if (this.objectFilter) {
      const clearBtn = searchContainer.createEl('button', {
        cls: 'windrose-settings-search-clear',
        attr: { 'aria-label': 'Clear filter', title: 'Clear filter' }
      });
      IconHelpers.set(clearBtn, 'x');
      clearBtn.onclick = () => {
        this.objectFilter = '';
        searchInput.value = '';
        this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
      };
    }

    // Object list container (for filtered re-renders)
    const objectListContainer = containerEl.createDiv({ cls: 'windrose-settings-object-list-container' });
    this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
  },
  renderObjectList(this: TabRenderObjectsThis, container: HTMLElement, allCategories: ResolvedCategory[], allObjects: ResolvedObject[], hiddenObjects: ResolvedObject[]): void {
    container.empty();

    const filter = this.objectFilter || '';

    // Filter objects if search term present
    const filteredObjects = filter
      ? allObjects.filter((obj: ResolvedObject) =>
          (obj.label?.toLowerCase().includes(filter) ?? false) ||
          (obj.symbol?.toLowerCase().includes(filter) ?? false) ||
          (obj.iconClass?.toLowerCase().includes(filter) ?? false))
      : allObjects;

    const filteredHidden = filter
      ? hiddenObjects.filter((obj: ResolvedObject) =>
          (obj.label?.toLowerCase().includes(filter) ?? false) ||
          (obj.symbol?.toLowerCase().includes(filter) ?? false) ||
          (obj.iconClass?.toLowerCase().includes(filter) ?? false))
      : hiddenObjects;

    // Show "no results" message if filter returns nothing
    if (filter && filteredObjects.length === 0 && filteredHidden.length === 0) {
      container.createDiv({
        cls: 'windrose-settings-no-results',
        text: `No objects matching "${filter}"`
      });
      return;
    }

    // Render each category
    for (const category of allCategories) {

      let categoryObjects = filteredObjects.filter((obj: ResolvedObject) => obj.category === category.id);
      if (categoryObjects.length === 0 && category.isBuiltIn) continue;
      if (categoryObjects.length === 0 && filter) continue;

      // Sort by order
      categoryObjects = categoryObjects.slice().sort((a: ResolvedObject, b: ResolvedObject) => (a.order ?? 0) - (b.order ?? 0));

      const categoryContainer = container.createDiv({ cls: 'windrose-settings-category' });

      // Category header with object count
      const categoryHeader = categoryContainer.createDiv({ cls: 'windrose-settings-category-header' });
      const labelText = (category.label ?? '') + (categoryObjects.length > 0 ? ` (${categoryObjects.length})` : '');
      categoryHeader.createSpan({ text: labelText, cls: 'windrose-settings-category-label' });

      // Edit/Delete for custom categories
      if (category.isCustom === true) {
        const categoryActions = categoryHeader.createDiv({ cls: 'windrose-settings-category-actions' });

        const editBtn = categoryActions.createEl('button', { cls: 'windrose-settings-icon-btn', attr: { 'aria-label': 'Edit category', title: 'Edit category' } });
        IconHelpers.set(editBtn, 'pencil');
        editBtn.onclick = () => {
          new CategoryEditModal(this.app, this.plugin, category as CustomCategory, () => {
            this.settingsChanged = true;
            void this.plugin.saveSettings();
            this.display();
          }, this.selectedMapType).open();
        };

        // Get unfiltered count for delete validation
        const allCategoryObjects = allObjects.filter((obj: ResolvedObject) => obj.category === category.id);
        const deleteBtn = categoryActions.createEl('button', { cls: 'windrose-settings-icon-btn windrose-settings-icon-btn-danger', attr: { 'aria-label': 'Delete category', title: 'Delete category' } });
        IconHelpers.set(deleteBtn, 'trash-2');
        deleteBtn.onclick = async () => {
          if (allCategoryObjects.length > 0) {
            new Notice(`Cannot delete "${category.label}" - it contains ${allCategoryObjects.length} object(s). Move or delete them first.`);
            return;
          }
          if (await new ConfirmModal(this.app, {
              message: `Delete category "${category.label}"?`,
              confirmText: 'Delete',
              isDestructive: true
            }).openAndGetValue()) {
            const categoriesKey: CustomCategoriesKey = this.selectedMapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
            if (this.plugin.settings[categoriesKey]) {
              this.plugin.settings[categoriesKey] = this.plugin.settings[categoriesKey].filter((c: CustomCategory) => c.id !== category.id);
            }
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }

      // Object list with drag/drop support
      const objectList = categoryContainer.createDiv({ cls: 'windrose-settings-object-list' });
      objectList.dataset.categoryId = category.id;

      // Only enable drag/drop when not filtering
      if (!filter) {
        this.setupDragDropForList(objectList, category);
      }

      for (const obj of categoryObjects) {
        this.renderObjectRow(objectList, obj, false, !filter);
      }
    }

    // Hidden objects section
    if (filteredHidden.length > 0) {
      const hiddenContainer = container.createDiv({ cls: 'windrose-settings-hidden-section' });

      new Setting(hiddenContainer)
        .setName(`Hidden Objects (${filteredHidden.length})`)
        .setDesc('Built-in objects you\'ve hidden from the palette');

      const hiddenList = hiddenContainer.createDiv({ cls: 'windrose-settings-object-list windrose-settings-hidden-list' });
      hiddenList.hide();

      new Setting(hiddenContainer)
        .addButton(btn => btn
          .setButtonText('Show')
          .onClick(() => {
            const isVisible = hiddenList.style.display !== 'none';
            hiddenList.toggle(!isVisible);
            btn.setButtonText(isVisible ? 'Show' : 'Hide');
          }));

      for (const obj of filteredHidden) {
        this.renderObjectRow(hiddenList, obj, true);
      }
    }
  },

  // ---------------------------------------------------------------------------
  // Drag/drop setup for object lists
  // ---------------------------------------------------------------------------

  setupDragDropForList(this: TabRenderObjectsThis, objectList: HTMLElement, category: ResolvedCategory): void {
    objectList.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }

      const dragging = objectList.querySelector('.windrose-dragging');
      if (!dragging) return;

      const afterElement = DragHelpers.getAfterElement(objectList, e.clientY);
      if (afterElement == null) {
        objectList.appendChild(dragging);
      } else {
        objectList.insertBefore(dragging, afterElement);
      }
    });

    objectList.addEventListener('dragenter', (e: DragEvent) => {
      e.preventDefault();
    });

    objectList.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();

      // Get the correct settings keys for the selected map type
      const overridesKey: OverridesKey = this.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
      const customObjectsKey: CustomObjectsKey = this.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';

      // Get new order from DOM positions
      const rows = [...objectList.querySelectorAll('.windrose-settings-object-row')] as HTMLElement[];

      // Get default ID order for this category
      const defaultIdOrder = ObjectHelpers.getDefaultIdOrder(category.id, this.getObjectSettingsForMapType() as unknown as Record<string, unknown>);

      // Apply new orders to settings
      rows.forEach((row: HTMLElement, actualPosition: number) => {
        const id = row.dataset.objectId;
        if (id == null || id === '') return;
        const isBuiltIn = row.dataset.isBuiltIn === 'true';
        const newOrder = actualPosition * 10;

        if (isBuiltIn) {
          const defaultPosition = defaultIdOrder.indexOf(id);

          if (actualPosition === defaultPosition) {
            // In default position - remove order override if present
            if (this.plugin.settings[overridesKey]?.[id]) {
              delete this.plugin.settings[overridesKey][id].order;
              if (Object.keys(this.plugin.settings[overridesKey][id]).length === 0) {
                delete this.plugin.settings[overridesKey][id];
              }
            }
          } else {
            // Not in default position - save order override
            if (!this.plugin.settings[overridesKey]) {
              this.plugin.settings[overridesKey] = {};
            }
            this.plugin.settings[overridesKey][id] ??= {};
            this.plugin.settings[overridesKey][id].order = newOrder;
          }

          // Update modified indicator in DOM immediately
          const labelEl = row.querySelector('.windrose-settings-object-label');
          if (labelEl) {
            const override = this.plugin.settings[overridesKey]?.[id];
            const hasAnyOverride = override && Object.keys(override).length > 0;
            labelEl.classList.toggle('windrose-settings-modified', hasAnyOverride === true);
          }
        } else {
          // Custom objects - always save order
          const customObjects = this.plugin.settings[customObjectsKey] ?? [];
          const customObj = customObjects.find((o: CustomObject) => o.id === id);
          if (customObj) {
            customObj.order = newOrder;
          }
        }
      });

      this.settingsChanged = true;
      void this.plugin.saveSettings();
    });
  },
  renderObjectRow(this: TabRenderObjectsThis, container: HTMLElement, obj: ResolvedObject, isHiddenSection = false, canDrag = false): void {
    const row = container.createDiv({ cls: 'windrose-settings-object-row' });

    // Get the correct settings keys for the selected map type
    const overridesKey: OverridesKey = this.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey: CustomObjectsKey = this.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';

    // Data attributes for drag/drop
    row.dataset.objectId = obj.id;
    row.dataset.isBuiltIn = String(!!obj.isBuiltIn);
    row.dataset.originalOrder = String(obj.order ?? 0);

    // Drag handle (only if draggable and not in hidden section)
    if (canDrag && !isHiddenSection) {
      row.setAttribute('draggable', 'true');
      row.classList.add('windrose-draggable');

      const dragHandle = row.createSpan({ cls: 'windrose-drag-handle' });
      IconHelpers.set(dragHandle, 'grip-vertical');

      row.setCssStyles({ userSelect: 'none' });

      row.addEventListener('dragstart', (e: DragEvent) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', obj.id);
          e.dataTransfer.effectAllowed = 'move';
        }
        window.setTimeout(() => {
          row.classList.add('windrose-dragging');
        }, 0);
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('windrose-dragging');
      });
    }

    // Symbol, Icon, or Image
    const symbolEl = row.createSpan({ cls: 'windrose-settings-object-symbol' });
    ObjectHelpers.renderObjectSymbol(obj, symbolEl, this.app);

    // Label
    const labelEl = row.createSpan({ text: obj.label ?? '', cls: 'windrose-settings-object-label' });
    if (obj.isModified === true) {
      labelEl.addClass('windrose-settings-modified');
    }

    // Actions
    const actions = row.createDiv({ cls: 'windrose-settings-object-actions' });

    // Edit button
    const editBtn = actions.createEl('button', { cls: 'windrose-settings-icon-btn', attr: { 'aria-label': 'Edit', title: 'Edit object' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.onclick = () => {
      new ObjectEditModal(this.app, this.plugin, obj, () => {
        this.settingsChanged = true;
        void this.plugin.saveSettings();
        this.display();
      }, this.selectedMapType).open();
    };

    if (obj.isBuiltIn) {
      if (isHiddenSection) {
        // Unhide button
        const unhideBtn = actions.createEl('button', { cls: 'windrose-settings-icon-btn', attr: { 'aria-label': 'Unhide', title: 'Show in palette' } });
        IconHelpers.set(unhideBtn, 'eye');
        unhideBtn.onclick = async () => {
          if (this.plugin.settings[overridesKey]?.[obj.id]) {
            delete this.plugin.settings[overridesKey][obj.id].hidden;
            if (Object.keys(this.plugin.settings[overridesKey][obj.id]).length === 0) {
              delete this.plugin.settings[overridesKey][obj.id];
            }
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      } else {
        // Hide button
        const hideBtn = actions.createEl('button', { cls: 'windrose-settings-icon-btn', attr: { 'aria-label': 'Hide', title: 'Hide from palette' } });
        IconHelpers.set(hideBtn, 'eye-off');
        hideBtn.onclick = async () => {
          if (!this.plugin.settings[overridesKey]) {
            this.plugin.settings[overridesKey] = {};
          }
          this.plugin.settings[overridesKey][obj.id] ??= {};
          this.plugin.settings[overridesKey][obj.id].hidden = true;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      }

      // Reset button (only for modified)
      if (obj.isModified === true) {
        const resetBtn = actions.createEl('button', { cls: 'windrose-settings-icon-btn', attr: { 'aria-label': 'Reset to default', title: 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.onclick = async () => {
          if (await new ConfirmModal(this.app, {
              message: `Reset "${obj.label}" to its default symbol and name?`,
              confirmText: 'Reset',
              isDestructive: true
            }).openAndGetValue()) {
            if (this.plugin.settings[overridesKey]) {
              delete this.plugin.settings[overridesKey][obj.id];
            }
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
    } else {
      // Copy to other map type button for custom objects
      const targetType = this.selectedMapType === 'hex' ? 'grid' : 'hex';
      const targetLabel = targetType === 'hex' ? 'Hex' : 'Grid';
      const copyBtn = actions.createEl('button', { cls: 'windrose-settings-icon-btn', attr: { 'aria-label': `Copy to ${targetLabel}`, title: `Copy to ${targetLabel}` } });
      IconHelpers.set(copyBtn, 'copy');
      copyBtn.onclick = async () => {
        const targetObjectsKey: CustomObjectsKey = targetType === 'hex' ? 'customHexObjects' : 'customGridObjects';
        const targetCategoriesKey: CustomCategoriesKey = targetType === 'hex' ? 'customHexCategories' : 'customGridCategories';

        if (!this.plugin.settings[targetObjectsKey]) {
          this.plugin.settings[targetObjectsKey] = [];
        }

        // Generate new unique ID
        const newId = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);

        // Check if category exists in target
        const targetCategory = obj.category;
        const targetCategories = this.plugin.settings[targetCategoriesKey] ?? [];
        const builtInCategoryIds = ObjectHelpers.getCategories({
          objectOverrides: {},
          customObjects: [],
          customCategories: []
        }).map((c: ResolvedCategory) => c.id);

        if (targetCategory != null && targetCategory !== '' && !builtInCategoryIds.includes(targetCategory) && !targetCategories.find((c: CustomCategory) => c.id === obj.category)) {
          // Custom category doesn't exist in target - copy it over
          const sourceCategoriesKey: CustomCategoriesKey = this.selectedMapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
          const sourceCategories = this.plugin.settings[sourceCategoriesKey] ?? [];
          const sourceCat = sourceCategories.find((c: CustomCategory) => c.id === obj.category);
          if (sourceCat) {
            if (!this.plugin.settings[targetCategoriesKey]) {
              this.plugin.settings[targetCategoriesKey] = [];
            }
            this.plugin.settings[targetCategoriesKey].push({ ...sourceCat });
          }
        }

        // Copy the object with new ID — strip resolved-only fields
        const copiedObj: CustomObject = {
          id: newId,
          label: obj.label ?? '',
          category: targetCategory ?? '',
          ...(obj.symbol != null ? { symbol: obj.symbol } : {}),
          ...(obj.iconClass != null ? { iconClass: obj.iconClass } : {}),
          ...(obj.imagePath != null ? { imagePath: obj.imagePath } : {}),
          ...(obj.order != null ? { order: obj.order } : {}),
        };

        this.plugin.settings[targetObjectsKey].push(copiedObj);

        this.settingsChanged = true;
        await this.plugin.saveSettings();
        new Notice(`Copied "${obj.label}" to ${targetLabel} maps`);
      };

      // Delete button for custom objects
      const deleteBtn = actions.createEl('button', { cls: 'windrose-settings-icon-btn windrose-settings-icon-btn-danger', attr: { 'aria-label': 'Delete', title: 'Delete object' } });
      IconHelpers.set(deleteBtn, 'trash-2');
      deleteBtn.onclick = async () => {
        if (await new ConfirmModal(this.app, {
            message: `Delete "${obj.label}"? Maps using this object will show a "?" placeholder.`,
            confirmText: 'Delete',
            isDestructive: true
          }).openAndGetValue()) {
          if (this.plugin.settings[customObjectsKey]) {
            this.plugin.settings[customObjectsKey] = this.plugin.settings[customObjectsKey].filter((o: CustomObject) => o.id !== obj.id);
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }
      };
    }
  },

  // ---------------------------------------------------------------------------
  // Object Sets block - rendered at top of Object Types section
  // ---------------------------------------------------------------------------

  renderObjectSetsBlock(this: TabRenderObjectsThis, containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    const sets = s.objectSets ?? [];

    containerEl.createEl('div', { cls: 'windrose-settings-subheading', text: 'Object sets' });
    containerEl.createEl('p', {
      text: 'Save and swap between named collections of object customizations.',
      cls: 'setting-item-description'
    });

    // Active Set indicator
    const activeSet = sets.find((st: ObjectSet) => st.id === s.activeObjectSetId);
    const isDirty = ObjectSetHelpers.isDirty(this.plugin);

    if (activeSet) {
      const bar = containerEl.createDiv({ cls: 'windrose-set-active-bar' });
      bar.createSpan({ text: 'Active set: ' });
      bar.createSpan({ text: activeSet.name, cls: 'windrose-set-active-name' });
      if (isDirty) {
        bar.createSpan({ text: ' (modified)', cls: 'windrose-set-modified-badge' });
      }
    } else if (isDirty) {
      const bar = containerEl.createDiv({ cls: 'windrose-set-active-bar windrose-set-modified-bar' });
      bar.createSpan({ text: 'Objects modified from defaults', cls: 'windrose-set-modified-badge' });
    }

    // Active Set dropdown
    new Setting(containerEl)
      .setName('Active set')
      .setDesc('Switch to a saved set (overwrites current objects)')
      .addDropdown(dropdown => {
        dropdown.addOption('__defaults__', 'Defaults (built-in)');
        for (const set of sets) {
          const scope: string[] = [];
          if (set.data.hex) scope.push('hex');
          if (set.data.grid) scope.push('grid');
          dropdown.addOption(set.id, set.name + (scope.length ? ' [' + scope.join('+') + ']' : ''));
        }
        dropdown.setValue(s.activeObjectSetId != null && s.activeObjectSetId !== '' ? s.activeObjectSetId : '__defaults__');
        dropdown.onChange(async (value: string) => {
          // Prompt to save current objects before switching
          if (isDirty) {
            if (await new ConfirmModal(this.app, {
              message: 'Save your current objects as a set before switching?',
              confirmText: 'Save',
              cancelText: value === '__defaults__' ? 'Reset Without Saving' : 'Switch Without Saving'
            }).openAndGetValue()) {
              const name = await new PromptModal(this.app, {
                message: 'Name for the saved set:',
                defaultValue: 'My Objects'
              }).openAndGetValue();
              if (name != null && name !== '') {
                ObjectSetHelpers.saveCurrentAsSet(this.plugin, name);
              }
            }
          }

          if (value === '__defaults__') {
            ObjectSetHelpers.resetToDefaults(this.plugin);
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            window.dispatchEvent(new CustomEvent('windrose-settings-changed', {
              detail: { timestamp: Date.now() }
            }));
            this.display();
            return;
          }

          ObjectSetHelpers.activateSet(this.plugin, value);
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          window.dispatchEvent(new CustomEvent('windrose-settings-changed', {
            detail: { timestamp: Date.now() }
          }));
          this.display();
        });
      });

    // Saved Sets list
    if (sets.length > 0) {
      const listContainer = containerEl.createDiv({ cls: 'windrose-set-list' });
      for (const set of sets) {
        const row = listContainer.createDiv({ cls: 'windrose-set-row' });
        if (set.id === s.activeObjectSetId) row.addClass('windrose-set-row-active');

        // Name
        row.createSpan({ text: set.name, cls: 'windrose-set-name' });

        // Scope badges
        const badges = row.createSpan({ cls: 'windrose-set-badges' });
        if (set.data.hex) badges.createSpan({ text: 'hex', cls: 'windrose-set-badge' });
        if (set.data.grid) badges.createSpan({ text: 'grid', cls: 'windrose-set-badge' });
        badges.createSpan({ text: set.source, cls: 'windrose-set-badge windrose-set-badge-source' });

        // Actions
        const setActions = row.createDiv({ cls: 'windrose-set-actions' });

        const renameBtn = setActions.createEl('button', {
          cls: 'windrose-settings-icon-btn',
          attr: { 'aria-label': 'Rename', title: 'Rename set' }
        });
        IconHelpers.set(renameBtn, 'pencil');
        renameBtn.onclick = () => {
          new ObjectSetRenameModal(this.app, set.name, (newName: string) => {
            ObjectSetHelpers.renameSet(this.plugin, set.id, newName);
            void this.plugin.saveSettings();
            this.display();
          }).open();
        };

        const exportBtn = setActions.createEl('button', {
          cls: 'windrose-settings-icon-btn',
          attr: { 'aria-label': 'Export', title: 'Export set to folder' }
        });
        IconHelpers.set(exportBtn, 'download');
        exportBtn.onclick = () => {
          new ObjectSetExportModal(this.app, this.plugin, set).open();
        };

        const deleteBtn = setActions.createEl('button', {
          cls: 'windrose-settings-icon-btn windrose-settings-icon-btn-danger',
          attr: { 'aria-label': 'Delete', title: 'Delete set' }
        });
        IconHelpers.set(deleteBtn, 'trash-2');
        deleteBtn.onclick = async () => {
          if (await new ConfirmModal(this.app, {
              message: 'Delete set "' + set.name + '"?',
              confirmText: 'Delete',
              isDestructive: true
            }).openAndGetValue()) {
            ObjectSetHelpers.deleteSet(this.plugin, set.id);
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
    }

    // Action buttons
    const actionSetting = new Setting(containerEl)
      .setName('Manage sets');

    actionSetting.addButton(btn => btn
      .setButtonText('Save current as set')
      .onClick(async () => {
        const name = await new PromptModal(this.app, {
          message: 'Name for the new set:',
          defaultValue: 'My Objects'
        }).openAndGetValue();
        if (name == null || name === '') return;
        ObjectSetHelpers.saveCurrentAsSet(this.plugin, name);
        await this.plugin.saveSettings();
        new Notice('Saved set: ' + name);
        this.display();
      }));

    actionSetting.addButton(btn => btn
      .setButtonText('Import from folder')
      .onClick(() => {
        new ObjectSetImportModal(this.app, this.plugin, () => {
          this.settingsChanged = true;
          this.display();
        }).open();
      }));

    // Browse Content Packs
    new Setting(containerEl)
      .setName('Browse content packs')
      .setDesc('Download object packs from the Windrose content library')
      .addButton(btn => btn
        .setButtonText('Browse')
        .onClick(() => {
          new ContentPackBrowserModal(this.app, this.plugin, 'object-pack', () => {
            this.settingsChanged = true;
            this.display();
          }).open();
        }));

    // Auto-Load Folder
    new Setting(containerEl)
      .setName('Auto-load folder')
      .setDesc('Vault folder to scan for object set packages on startup')
      .addSearch(search => {
        new FolderSuggest(this.app, search.inputEl);
        search
          .setPlaceholder('E.g. Windrose-objects')
          .setValue(s.objectSetsAutoLoadFolder ?? '')
          .onChange(async (value: string) => {
            s.objectSetsAutoLoadFolder = value.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => btn
        .setButtonText('Scan now')
        .onClick(async () => {
          const added = await ObjectSetHelpers.scanAutoLoadFolder(this.plugin);
          await this.plugin.saveSettings();
          if (added > 0) {
            new Notice('Found ' + added + ' new set(s)');
          } else {
            new Notice('No new sets found');
          }
          this.display();
        }));
  }

};
