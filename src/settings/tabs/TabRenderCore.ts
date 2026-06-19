import type { SettingsTabThis } from './settingsTabContext';
import { IconHelpers } from '../helpers/iconHelpers';

// settingsPlugin-TabRenderCore.ts
// WindroseMDSettingsTab render methods - Core (search bar)

export const TabRenderCoreMethods = {
  renderSearchBar(this: SettingsTabThis, containerEl: HTMLElement): void {
    const wrapper = containerEl.createEl('div', { cls: 'windrose-settings-search-wrapper' });
    const searchBox = wrapper.createEl('div', { cls: 'windrose-settings-search-box' });

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
    clearBtn.hide();
    IconHelpers.set(clearBtn, 'x');

    // No results message (hidden initially)
    this.noResultsEl = containerEl.createEl('div', {
      cls: 'windrose-settings-no-results',
      text: 'No settings found matching your search.'
    });
    this.noResultsEl.hide();

    // Search handler
    const handleSearch = (query: string): void => {
      const q = query.toLowerCase().trim();
      clearBtn.toggle(Boolean(q));

      if (!q) {
        // Clear search - show all, collapse sections
        this.sections?.forEach(({ details }) => {
          details.show();
          details.settingItems?.forEach(item => {
            item.classList.remove('windrose-setting-hidden');
          });
          details.removeAttribute('open');
        });
        this.noResultsEl.hide();
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
            item.classList.remove('windrose-setting-hidden');
            sectionHasMatch = true;
          } else {
            item.classList.add('windrose-setting-hidden');
          }
        });

        if (sectionHasMatch) {
          details.show();
          details.setAttribute('open', '');
          anyMatches = true;
        } else {
          details.hide();
        }
      });

      this.noResultsEl.toggle(!anyMatches);
    };

    input.addEventListener('input', (e: Event) => handleSearch((e.target as HTMLInputElement).value));
    clearBtn.addEventListener('click', () => {
      input.value = '';
      handleSearch('');
      input.focus();
    });
  }

};
