export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class Modal {
  app: any;
  contentEl: HTMLDivElement;
  constructor(app: any) {
    this.app = app;
    this.contentEl = document.createElement('div');
  }
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export class Plugin {
  app: any;
  manifest: any;
  loadData() { return Promise.resolve({}); }
  saveData(_data: any) { return Promise.resolve(); }
}

export class Setting {
  settingEl: HTMLDivElement;
  constructor(_containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
  }
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addText(_cb: any) { return this; }
  addToggle(_cb: any) { return this; }
  addDropdown(_cb: any) { return this; }
  addButton(_cb: any) { return this; }
  addSlider(_cb: any) { return this; }
}

export class AbstractInputSuggest {
  constructor(_app: any, _inputEl: HTMLInputElement) {}
  getSuggestions(_query: string): unknown[] { return []; }
  renderSuggestion(_value: any, _el: HTMLElement) {}
  selectSuggestion(_value: any) {}
  open() {}
  close() {}
}

export class Menu {
  addItem(_cb: any) { return this; }
  addSeparator() { return this; }
  showAtMouseEvent(_event: MouseEvent) {}
  showAtPosition(_pos: any) {}
}

export const Platform = {
  isMobile: false,
  isDesktop: true,
};
