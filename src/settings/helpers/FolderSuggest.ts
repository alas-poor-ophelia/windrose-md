import type { TFolder } from 'obsidian';
import { AbstractInputSuggest } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  getSuggestions(query: string): TFolder[] {
    const folders = this.app.vault.getAllFolders(true);
    if (!query) return folders;
    const lower = query.toLowerCase();
    return folders.filter(f => f.path.toLowerCase().includes(lower));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path === '' ? '/ (vault root)' : folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.setValue(folder.path);
    this.textInputEl.dispatchEvent(new Event('input'));
    this.close();
  }
}
