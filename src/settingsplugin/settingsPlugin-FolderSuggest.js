return `// settingsPlugin-FolderSuggest.js
// Folder path autocomplete using Obsidian's AbstractInputSuggest
// This file is concatenated into the settings plugin template by the assembler

class FolderSuggest extends AbstractInputSuggest {
  getSuggestions(query) {
    const folders = this.app.vault.getAllFolders(true);
    if (!query) return folders;
    const lower = query.toLowerCase();
    return folders.filter(f => f.path.toLowerCase().includes(lower));
  }

  renderSuggestion(folder, el) {
    el.setText(folder.path === '' ? '/ (vault root)' : folder.path);
  }

  selectSuggestion(folder) {
    this.setValue(folder.path);
    this.textInputEl.dispatchEvent(new Event('input'));
    this.close();
  }
}`;
