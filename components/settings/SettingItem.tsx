/**
 * SettingItem.tsx
 *
 * Preact components for settings rows.
 * Native path: uses Obsidian's Setting class imperatively for structure,
 * with Preact children rendered into the control area.
 * Fallback path: renders custom DOM with Obsidian's setting-item CSS classes.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");

interface SettingItemProps {
  name: string;
  description?: string;
  vertical?: boolean;
  children?: any;
}

/**
 * Standard setting row: name + optional description on left, control on right.
 * Native path: creates Obsidian Setting instance imperatively.
 * Fallback path: renders using Obsidian's .setting-item CSS classes.
 * When vertical=true, stacks label above control (for wide controls like color grids).
 */
function SettingItem({ name, description, vertical, children }: SettingItemProps): React.ReactElement {
  const containerRef = dc.useRef<HTMLDivElement>(null);
  const controlRef = dc.useRef<HTMLDivElement>(null);
  const settingRef = dc.useRef<any>(null);

  const bridgeAvailable = isBridgeAvailable();

  dc.useEffect(() => {
    if (!bridgeAvailable || !containerRef.current) return;

    try {
      const obs = getObsidianModule();
      const SettingClass = obs.Setting as new (containerEl: HTMLElement) => {
        setName: (name: string) => any;
        setDesc: (desc: string) => any;
        settingEl: HTMLElement;
        controlEl: HTMLElement;
        infoEl: HTMLElement;
      };

      const setting = new SettingClass(containerRef.current);
      setting.setName(name);
      if (description) {
        setting.setDesc(description);
      }

      if (vertical) {
        setting.settingEl.style.flexDirection = 'column';
        setting.settingEl.style.alignItems = 'flex-start';
        setting.controlEl.style.width = '100%';
        setting.controlEl.style.marginTop = '8px';
      }

      // Move Preact children into the native control area
      if (controlRef.current) {
        while (controlRef.current.firstChild) {
          setting.controlEl.appendChild(controlRef.current.firstChild);
        }
      }

      settingRef.current = setting;

      return () => {
        // Setting appends its own DOM to containerRef — clear it
        if (containerRef.current) {
          containerRef.current.empty?.() || (containerRef.current.innerHTML = '');
        }
      };
    } catch {
      // If Setting creation fails, fallback DOM is already visible
    }
  }, []);

  // Update name/description reactively
  dc.useEffect(() => {
    if (settingRef.current) {
      settingRef.current.setName(name);
    }
  }, [name]);

  dc.useEffect(() => {
    if (settingRef.current) {
      if (description) {
        settingRef.current.setDesc(description);
      }
    }
  }, [description]);

  if (bridgeAvailable) {
    return (
      <>
        <div ref={containerRef} />
        <div ref={controlRef} style={{ display: 'none' }}>{children}</div>
      </>
    );
  }

  // Fallback path
  return (
    <div class="setting-item" style={vertical ? { flexDirection: 'column', alignItems: 'flex-start' } : undefined}>
      <div class="setting-item-info">
        <div class="setting-item-name">{name}</div>
        {description && <div class="setting-item-description">{description}</div>}
      </div>
      <div class="setting-item-control" style={vertical ? { width: '100%', marginTop: '8px' } : undefined}>
        {children}
      </div>
    </div>
  );
}

interface SettingHeadingProps {
  text: string;
}

/**
 * Section heading matching Obsidian's setting-item-heading pattern.
 */
function SettingHeading({ text }: SettingHeadingProps): React.ReactElement {
  return (
    <div class="setting-item setting-item-heading">
      <div class="setting-item-info">
        <div class="setting-item-name">{text}</div>
      </div>
    </div>
  );
}

return { SettingItem, SettingHeading };
