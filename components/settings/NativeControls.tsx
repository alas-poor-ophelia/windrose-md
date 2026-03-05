/**
 * NativeControls.tsx
 *
 * Native Obsidian control wrappers for use inside SettingItem.
 * Each wrapper creates the Obsidian component imperatively and
 * falls back to standard HTML controls when bridge is unavailable.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");

// ─── NativeToggle ───────────────────────────────────────────────

interface NativeToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function NativeToggle({ value, onChange, disabled }: NativeToggleProps): React.ReactElement {
  const containerRef = dc.useRef<HTMLDivElement>(null);
  const toggleRef = dc.useRef<any>(null);

  const bridgeAvailable = isBridgeAvailable();

  // Store latest onChange in ref to avoid recreating toggle
  const onChangeRef = dc.useRef(onChange);
  onChangeRef.current = onChange;

  dc.useEffect(() => {
    if (!bridgeAvailable || !containerRef.current) return;

    try {
      const obs = getObsidianModule();
      const SettingClass = obs.Setting as new (containerEl: HTMLElement) => {
        settingEl: HTMLElement;
        controlEl: HTMLElement;
        addToggle: (cb: (toggle: any) => void) => any;
      };

      // Create a temporary setting to extract its toggle component
      const tempContainer = document.createElement('div');
      const setting = new SettingClass(tempContainer);
      let toggleInstance: any = null;

      setting.addToggle((toggle: any) => {
        toggleInstance = toggle;
        toggle.setValue(value);
        toggle.onChange((newVal: boolean) => onChangeRef.current(newVal));
        if (disabled) {
          toggle.setDisabled(true);
        }
      });

      // Move just the toggle element into our container
      if (toggleInstance && setting.controlEl.firstChild) {
        containerRef.current.appendChild(setting.controlEl.firstChild);
      }

      toggleRef.current = toggleInstance;

      return () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      };
    } catch {
      // Fallback will render
    }
  }, []);

  // Update value without recreating
  dc.useEffect(() => {
    if (toggleRef.current) {
      toggleRef.current.setValue(value);
    }
  }, [value]);

  // Update disabled state without recreating
  dc.useEffect(() => {
    if (toggleRef.current) {
      toggleRef.current.setDisabled(!!disabled);
    }
  }, [disabled]);

  if (bridgeAvailable) {
    return h('div', { ref: containerRef });
  }

  // Fallback: standard checkbox
  return (
    <div class="checkbox-container" onClick={() => !disabled && onChange(!value)}>
      <input type="checkbox" checked={value} disabled={disabled} tabIndex={-1} />
    </div>
  );
}

// ─── NativeDropdown ─────────────────────────────────────────────

interface NativeDropdownOption {
  value: string;
  label: string;
}

interface NativeDropdownProps {
  value: string;
  options: NativeDropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

function NativeDropdown({ value, options, onChange, disabled }: NativeDropdownProps): React.ReactElement {
  const containerRef = dc.useRef<HTMLDivElement>(null);
  const dropdownRef = dc.useRef<any>(null);

  const bridgeAvailable = isBridgeAvailable();

  const onChangeRef = dc.useRef(onChange);
  onChangeRef.current = onChange;

  dc.useEffect(() => {
    if (!bridgeAvailable || !containerRef.current) return;

    try {
      const obs = getObsidianModule();
      const SettingClass = obs.Setting as new (containerEl: HTMLElement) => {
        settingEl: HTMLElement;
        controlEl: HTMLElement;
        addDropdown: (cb: (dropdown: any) => void) => any;
      };

      const tempContainer = document.createElement('div');
      const setting = new SettingClass(tempContainer);
      let dropdownInstance: any = null;

      setting.addDropdown((dropdown: any) => {
        dropdownInstance = dropdown;
        for (const opt of options) {
          dropdown.addOption(opt.value, opt.label);
        }
        dropdown.setValue(value);
        dropdown.onChange((newVal: string) => onChangeRef.current(newVal));
        if (disabled) {
          dropdown.setDisabled(true);
        }
      });

      if (dropdownInstance && setting.controlEl.firstChild) {
        containerRef.current.appendChild(setting.controlEl.firstChild);
      }

      dropdownRef.current = dropdownInstance;

      return () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      };
    } catch {
      // Fallback will render
    }
  }, []);

  dc.useEffect(() => {
    if (dropdownRef.current) {
      dropdownRef.current.setValue(value);
    }
  }, [value]);

  dc.useEffect(() => {
    if (dropdownRef.current) {
      dropdownRef.current.setDisabled(!!disabled);
    }
  }, [disabled]);

  if (bridgeAvailable) {
    return h('div', { ref: containerRef });
  }

  // Fallback: standard select
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e: Event) => onChange((e.target as HTMLSelectElement).value)}
      class="dropdown"
    >
      {options.map((opt: NativeDropdownOption) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ─── NativeSlider ───────────────────────────────────────────────

interface NativeSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function NativeSlider({ value, min, max, step, onChange, disabled }: NativeSliderProps): React.ReactElement {
  const containerRef = dc.useRef<HTMLDivElement>(null);
  const sliderRef = dc.useRef<any>(null);

  const bridgeAvailable = isBridgeAvailable();

  const onChangeRef = dc.useRef(onChange);
  onChangeRef.current = onChange;

  dc.useEffect(() => {
    if (!bridgeAvailable || !containerRef.current) return;

    try {
      const obs = getObsidianModule();
      const SettingClass = obs.Setting as new (containerEl: HTMLElement) => {
        settingEl: HTMLElement;
        controlEl: HTMLElement;
        addSlider: (cb: (slider: any) => void) => any;
      };

      const tempContainer = document.createElement('div');
      const setting = new SettingClass(tempContainer);
      let sliderInstance: any = null;

      setting.addSlider((slider: any) => {
        sliderInstance = slider;
        slider.setLimits(min, max, step ?? 1);
        slider.setValue(value);
        slider.onChange((newVal: number) => onChangeRef.current(newVal));
        if (disabled) {
          slider.setDisabled(true);
        }
      });

      if (sliderInstance && setting.controlEl.firstChild) {
        containerRef.current.appendChild(setting.controlEl.firstChild);
      }

      sliderRef.current = sliderInstance;

      return () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      };
    } catch {
      // Fallback will render
    }
  }, []);

  dc.useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.setValue(value);
    }
  }, [value]);

  dc.useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.setDisabled(!!disabled);
    }
  }, [disabled]);

  if (bridgeAvailable) {
    return h('div', { ref: containerRef, style: { width: '120px' } });
  }

  // Fallback: standard range input
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step ?? 1}
      value={value}
      disabled={disabled}
      onChange={(e: Event) => onChange(parseFloat((e.target as HTMLInputElement).value))}
      style={{ width: '120px', cursor: disabled ? 'not-allowed' : 'pointer' }}
    />
  );
}

return { NativeToggle, NativeDropdown, NativeSlider };
