// settingsPlugin-TabRenderCore.js
// WindroseMDSettingsTab render methods - Core (search bar)
// This file is concatenated into the settings plugin template by the assembler

const TabRenderCoreMethods = {
  renderSearchBar(containerEl) {
    const wrapper = containerEl.createEl('div', { cls: 'dmt-settings-search-wrapper' });
    const searchBox = wrapper.createEl('div', { cls: 'dmt-settings-search-box' });
    
    // Search icon
    const searchIcon = searchBox.createEl('span', { cls: 'search-icon' });
    IconHelpers.set(searchIcon, 'search');
    
    // Input
    const input = searchBox.createEl('input', {
      type: 'text',
      placeholder: 'Search settings...'
    });
    
    // Clear button (hidden initially)
    const clearBtn = searchBox.createEl('button', { cls: 'clear-btn' });
    clearBtn.style.display = 'none';
    IconHelpers.set(clearBtn, 'x');
    
    // No results message (hidden initially)
    this.noResultsEl = containerEl.createEl('div', { 
      cls: 'dmt-settings-no-results',
      text: 'No settings found matching your search.'
    });
    this.noResultsEl.style.display = 'none';
    
    // Search handler
    const handleSearch = (query) => {
      const q = query.toLowerCase().trim();
      clearBtn.style.display = q ? 'block' : 'none';
      
      if (!q) {
        // Clear search - show all, collapse sections
        this.sections?.forEach(({ details }) => {
          details.style.display = '';
          details.settingItems?.forEach(item => {
            item.classList.remove('dmt-setting-hidden');
          });
          details.removeAttribute('open');
        });
        this.noResultsEl.style.display = 'none';
        return;
      }
      
      let anyMatches = false;
      
      this.sections?.forEach(({ details, title }) => {
        let sectionHasMatch = title.toLowerCase().includes(q);
        
        details.settingItems?.forEach(item => {
          const nameEl = item.querySelector('.setting-item-name');
          const descEl = item.querySelector('.setting-item-description');
          const name = nameEl?.textContent?.toLowerCase() || '';
          const desc = descEl?.textContent?.toLowerCase() || '';
          
          const matches = name.includes(q) || desc.includes(q);
          
          if (matches) {
            item.classList.remove('dmt-setting-hidden');
            sectionHasMatch = true;
          } else {
            item.classList.add('dmt-setting-hidden');
          }
        });
        
        if (sectionHasMatch) {
          details.style.display = '';
          details.setAttribute('open', '');
          anyMatches = true;
        } else {
          details.style.display = 'none';
        }
      });
      
      this.noResultsEl.style.display = anyMatches ? 'none' : 'block';
    };
    
    input.addEventListener('input', (e) => handleSearch(e.target.value));
    clearBtn.addEventListener('click', () => {
      input.value = '';
      handleSearch('');
      input.focus();
    });
  }

};