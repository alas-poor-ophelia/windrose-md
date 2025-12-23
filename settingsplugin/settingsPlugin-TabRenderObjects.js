return `// settingsPlugin-TabRenderObjects.js
// WindroseMDSettingsTab render methods - Object types
// This file is concatenated into the settings plugin template by the assembler

const TabRenderObjectsMethods = {
  renderObjectTypesContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'Customize map objects: modify built-in objects, create custom objects, or hide objects you don\\'t use.',
      cls: 'setting-item-description'
    });
    
    // Map Type selector dropdown
    new Setting(containerEl)
      .setName('Map Type')
      .setDesc('Select which map type to configure objects for')
      .addDropdown(dropdown => dropdown
        .addOption('grid', 'Grid Maps')
        .addOption('hex', 'Hex Maps')
        .setValue(this.selectedMapType)
        .onChange((value) => {
          this.selectedMapType = value;
          this.display();
        }));
    
    // Get settings for the selected map type
    const mapTypeSettings = this.getObjectSettingsForMapType();
    
    // Add Custom Object button
    new Setting(containerEl)
      .setName('Add Custom Object')
      .setDesc('Create a new map object with your own symbol')
      .addButton(btn => btn
        .setButtonText('+ Add Object')
        .setCta()
        .onClick(() => {
          new ObjectEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }, this.selectedMapType).open();
        }));
    
    // Add Custom Category button
    new Setting(containerEl)
      .setName('Add Custom Category')
      .setDesc('Create a new category to organize objects')
      .addButton(btn => btn
        .setButtonText('+ Add Category')
        .onClick(() => {
          new CategoryEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
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
          new ImportModal(this.app, this.plugin, async () => {
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
    const allCategories = ObjectHelpers.getCategories(mapTypeSettings);
    const allObjects = ObjectHelpers.getResolved(mapTypeSettings);
    const hiddenObjects = ObjectHelpers.getHidden(mapTypeSettings);
    
    // Check if there are any customizations for this map type
    const hasOverrides = Object.keys(mapTypeSettings.objectOverrides || {}).length > 0;
    const hasCustomObjects = (mapTypeSettings.customObjects || []).length > 0;
    const hasCustomCategories = (mapTypeSettings.customCategories || []).length > 0;
    const hasAnyCustomizations = hasOverrides || hasCustomObjects || hasCustomCategories;
    
    // Reset All button (only show if there are customizations)
    if (hasAnyCustomizations) {
      new Setting(containerEl)
        .setName('Reset All Customizations')
        .setDesc(\`Remove all custom objects, categories, and modifications for \${this.selectedMapType} maps\`)
        .addButton(btn => btn
          .setButtonText('Reset All')
          .setWarning()
          .onClick(async () => {
            const counts = [];
            if (hasOverrides) counts.push(\`\${Object.keys(mapTypeSettings.objectOverrides).length} modification(s)\`);
            if (hasCustomObjects) counts.push(\`\${mapTypeSettings.customObjects.length} custom object(s)\`);
            if (hasCustomCategories) counts.push(\`\${mapTypeSettings.customCategories.length} custom category(ies)\`);
            
            if (confirm(\`This will remove \${counts.join(', ')} for \${this.selectedMapType} maps. Maps using custom objects will show "?" placeholders.\\\\n\\\\nContinue?\`)) {
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
    const searchContainer = containerEl.createDiv({ cls: 'dmt-settings-search-container' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      cls: 'dmt-settings-search-input',
      attr: { placeholder: 'Filter objects...' },
      value: this.objectFilter || ''
    });
    searchInput.addEventListener('input', (e) => {
      this.objectFilter = e.target.value.toLowerCase().trim();
      this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
    });
    
    if (this.objectFilter) {
      const clearBtn = searchContainer.createEl('button', {
        cls: 'dmt-settings-search-clear',
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
    const objectListContainer = containerEl.createDiv({ cls: 'dmt-settings-object-list-container' });
    this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
  },
  renderObjectList(container, allCategories, allObjects, hiddenObjects) {
    container.empty();
    
    const filter = this.objectFilter || '';
    const isDraggable = !filter; // Disable drag when filtering
    
    // Filter objects if search term present
    const filteredObjects = filter
      ? allObjects.filter(obj => 
          obj.label.toLowerCase().includes(filter) || 
          (obj.symbol && obj.symbol.toLowerCase().includes(filter)) ||
          (obj.iconClass && obj.iconClass.toLowerCase().includes(filter)))
      : allObjects;
    
    const filteredHidden = filter
      ? hiddenObjects.filter(obj =>
          obj.label.toLowerCase().includes(filter) ||
          (obj.symbol && obj.symbol.toLowerCase().includes(filter)) ||
          (obj.iconClass && obj.iconClass.toLowerCase().includes(filter)))
      : hiddenObjects;
    
    // Show "no results" message if filter returns nothing
    if (filter && filteredObjects.length === 0 && filteredHidden.length === 0) {
      container.createDiv({ 
        cls: 'dmt-settings-no-results',
        text: \`No objects matching "\${filter}"\`
      });
      return;
    }
    
    // Render each category (skip 'notes' - note_pin is handled specially in the map UI)
    for (const category of allCategories) {
      if (category.id === 'notes') continue;
      
      let categoryObjects = filteredObjects.filter(obj => obj.category === category.id);
      if (categoryObjects.length === 0 && category.isBuiltIn) continue;
      if (categoryObjects.length === 0 && filter) continue;
      
      // Sort by order
      categoryObjects = categoryObjects.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      const categoryContainer = container.createDiv({ cls: 'dmt-settings-category' });
      
      // Category header with object count
      const categoryHeader = categoryContainer.createDiv({ cls: 'dmt-settings-category-header' });
      const labelText = category.label + (categoryObjects.length > 0 ? \` (\${categoryObjects.length})\` : '');
      categoryHeader.createSpan({ text: labelText, cls: 'dmt-settings-category-label' });
      
      // Edit/Delete for custom categories
      if (category.isCustom) {
        const categoryActions = categoryHeader.createDiv({ cls: 'dmt-settings-category-actions' });
        
        const editBtn = categoryActions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit category', title: 'Edit category' } });
        IconHelpers.set(editBtn, 'pencil');
        editBtn.onclick = () => {
          new CategoryEditModal(this.app, this.plugin, category, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        };
        
        // Get unfiltered count for delete validation
        const allCategoryObjects = allObjects.filter(obj => obj.category === category.id);
        const deleteBtn = categoryActions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete category', title: 'Delete category' } });
        IconHelpers.set(deleteBtn, 'trash-2');
        deleteBtn.onclick = async () => {
          if (allCategoryObjects.length > 0) {
            alert(\`Cannot delete "\${category.label}" - it contains \${allCategoryObjects.length} object(s). Move or delete them first.\`);
            return;
          }
          if (confirm(\`Delete category "\${category.label}"?\`)) {
            const categoriesKey = this.selectedMapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
            if (this.plugin.settings[categoriesKey]) {
              this.plugin.settings[categoriesKey] = this.plugin.settings[categoriesKey].filter(c => c.id !== category.id);
            }
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
      
      // Object list with drag/drop support
      const objectList = categoryContainer.createDiv({ cls: 'dmt-settings-object-list' });
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
      const hiddenContainer = container.createDiv({ cls: 'dmt-settings-hidden-section' });
      
      const hiddenHeader = new Setting(hiddenContainer)
        .setName(\`Hidden Objects (\${filteredHidden.length})\`)
        .setDesc('Built-in objects you\\'ve hidden from the palette');
      
      const hiddenList = hiddenContainer.createDiv({ cls: 'dmt-settings-object-list dmt-settings-hidden-list' });
      hiddenList.style.display = 'none';
      
      hiddenHeader.addButton(btn => btn
        .setButtonText('Show')
        .onClick(() => {
          const isVisible = hiddenList.style.display !== 'none';
          hiddenList.style.display = isVisible ? 'none' : 'block';
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
  
  setupDragDropForList(objectList, category) {
    objectList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const dragging = objectList.querySelector('.dmt-dragging');
      if (!dragging) return;
      
      const afterElement = DragHelpers.getAfterElement(objectList, e.clientY);
      if (afterElement == null) {
        objectList.appendChild(dragging);
      } else {
        objectList.insertBefore(dragging, afterElement);
      }
    });
    
    objectList.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });
    
    objectList.addEventListener('drop', async (e) => {
      e.preventDefault();
      
      // Get the correct settings keys for the selected map type
      const overridesKey = this.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
      const customObjectsKey = this.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
      
      // Get new order from DOM positions
      const rows = [...objectList.querySelectorAll('.dmt-settings-object-row')];
      
      // Get default ID order for this category
      const defaultIdOrder = ObjectHelpers.getDefaultIdOrder(category.id, this.getObjectSettingsForMapType());
      
      // Apply new orders to settings
      rows.forEach((row, actualPosition) => {
        const id = row.dataset.objectId;
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
            if (!this.plugin.settings[overridesKey][id]) {
              this.plugin.settings[overridesKey][id] = {};
            }
            this.plugin.settings[overridesKey][id].order = newOrder;
          }
          
          // Update modified indicator in DOM immediately
          const labelEl = row.querySelector('.dmt-settings-object-label');
          if (labelEl) {
            const override = this.plugin.settings[overridesKey]?.[id];
            const hasAnyOverride = override && Object.keys(override).length > 0;
            labelEl.classList.toggle('dmt-settings-modified', !!hasAnyOverride);
          }
        } else {
          // Custom objects - always save order
          const customObjects = this.plugin.settings[customObjectsKey] || [];
          const customObj = customObjects.find(o => o.id === id);
          if (customObj) {
            customObj.order = newOrder;
          }
        }
      });
      
      this.settingsChanged = true;
      await this.plugin.saveSettings();
    });
  },
  renderObjectRow(container, obj, isHiddenSection = false, canDrag = false) {
    const row = container.createDiv({ cls: 'dmt-settings-object-row' });
    
    // Get the correct settings keys for the selected map type
    const overridesKey = this.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    
    // Data attributes for drag/drop
    row.dataset.objectId = obj.id;
    row.dataset.isBuiltIn = String(!!obj.isBuiltIn);
    row.dataset.originalOrder = String(obj.order ?? 0);
    
    // Drag handle (only if draggable and not in hidden section)
    if (canDrag && !isHiddenSection) {
      row.setAttribute('draggable', 'true');
      row.classList.add('dmt-draggable');
      
      const dragHandle = row.createSpan({ cls: 'dmt-drag-handle' });
      IconHelpers.set(dragHandle, 'grip-vertical');
      
      row.style.userSelect = 'none';
      row.style.webkitUserSelect = 'none';
      
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', obj.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
          row.classList.add('dmt-dragging');
        }, 0);
      });
      
      row.addEventListener('dragend', (e) => {
        row.classList.remove('dmt-dragging');
      });
    }
    
    // Symbol or Icon
    const symbolEl = row.createSpan({ cls: 'dmt-settings-object-symbol' });
    if (obj.iconClass && RPGAwesomeHelpers.isValid(obj.iconClass)) {
      const iconInfo = RPGAwesomeHelpers.getInfo(obj.iconClass);
      const iconSpan = symbolEl.createEl('span', { cls: 'ra' });
      iconSpan.textContent = iconInfo.char;
    } else {
      symbolEl.textContent = obj.symbol || '?';
    }
    
    // Label
    const labelEl = row.createSpan({ text: obj.label, cls: 'dmt-settings-object-label' });
    if (obj.isModified) {
      labelEl.addClass('dmt-settings-modified');
    }
    
    // Actions
    const actions = row.createDiv({ cls: 'dmt-settings-object-actions' });
    
    // Edit button
    const editBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit', title: 'Edit object' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.onclick = () => {
      new ObjectEditModal(this.app, this.plugin, obj, async () => {
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      }, this.selectedMapType).open();
    };
    
    if (obj.isBuiltIn) {
      if (isHiddenSection) {
        // Unhide button
        const unhideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Unhide', title: 'Show in palette' } });
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
        const hideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Hide', title: 'Hide from palette' } });
        IconHelpers.set(hideBtn, 'eye-off');
        hideBtn.onclick = async () => {
          if (!this.plugin.settings[overridesKey]) {
            this.plugin.settings[overridesKey] = {};
          }
          if (!this.plugin.settings[overridesKey][obj.id]) {
            this.plugin.settings[overridesKey][obj.id] = {};
          }
          this.plugin.settings[overridesKey][obj.id].hidden = true;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      }
      
      // Reset button (only for modified)
      if (obj.isModified) {
        const resetBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Reset to default', title: 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.onclick = async () => {
          if (confirm(\`Reset "\${obj.label}" to its default symbol and name?\`)) {
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
      // Delete button for custom objects
      const deleteBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete', title: 'Delete object' } });
      IconHelpers.set(deleteBtn, 'trash-2');
      deleteBtn.onclick = async () => {
        if (confirm(\`Delete "\${obj.label}"? Maps using this object will show a "?" placeholder.\`)) {
          if (this.plugin.settings[customObjectsKey]) {
            this.plugin.settings[customObjectsKey] = this.plugin.settings[customObjectsKey].filter(o => o.id !== obj.id);
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }
      };
    }
  }

};`;