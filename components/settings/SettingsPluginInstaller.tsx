/**
 * SettingsPluginInstaller.tsx
 *
 * Inline prompt for settings plugin installation/upgrade.
 * Handles installing or upgrading the Windrose MapDesigner Settings plugin
 * which provides global customization options.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");

const { requireModuleByName } = await dc.require(pathResolverPath);

const { THEME, DEFAULTS } = await requireModuleByName("dmtConstants.ts");
const { WindroseCompass } = await requireModuleByName("WindroseCompass.jsx");

// NOTE: Assembler is lazy-loaded only when install/upgrade is triggered
// This avoids running assembly on every app load

const { OBJECT_TYPES, CATEGORIES } = await requireModuleByName("objectTypes.ts");
const { RA_ICONS, RA_CATEGORIES } = await requireModuleByName("rpgAwesomeIcons.ts");
const QUICK_SYMBOLS = await requireModuleByName("settingsPlugin-quickSymbols.js");

/** Plugin version from template */
const PACKAGED_PLUGIN_VERSION = '0.14.7.4';

/** LocalStorage keys for tracking user preferences */
const STORAGE_KEYS = {
  INSTALL_DECLINED: 'dmt-plugin-install-declined',
  UPGRADE_DECLINED_VERSION: 'dmt-plugin-upgrade-declined-version'
} as const;

/** Plugin mode type */
type PluginMode = 'auto' | 'install' | 'upgrade';

/** Action mode type */
type ActionMode = 'install' | 'upgrade';

/** Generated plugin files */
interface PluginFiles {
  mainJs: string;
  stylesCSS: string | null;
}

/** Plugin manifest structure */
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  isDesktopOnly: boolean;
}

/** Props for SettingsPluginInstaller component */
export interface SettingsPluginInstallerProps {
  onInstall: () => void;
  onDecline: () => void;
  mode?: PluginMode;
}

/**
 * Compare semantic version strings (e.g., "1.2.3" vs "1.1.0")
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

/**
 * Get the installed plugin's version from its manifest
 */
function getInstalledPluginVersion(): string | null {
  try {
    // Use manifests object directly - plugin.manifest may be undefined even when plugin exists
    return dc.app.plugins.manifests['dungeon-map-tracker-settings']?.version || null;
  } catch {
    return null;
  }
}

/**
 * Check if plugin is installed
 */
function isPluginInstalled(): boolean {
  try {
    // We'll do an async check in the component, this is just a quick sync check
    return !!dc.app.plugins.plugins['dungeon-map-tracker-settings'];
  } catch {
    return false;
  }
}

/**
 * Check if an upgrade is available and not declined
 */
function shouldOfferUpgrade(): boolean {
  const installedVersion = getInstalledPluginVersion();
  if (!installedVersion) return false;

  // Check if upgrade is available
  const upgradeAvailable = compareVersions(PACKAGED_PLUGIN_VERSION, installedVersion) > 0;
  if (!upgradeAvailable) return false;

  // Check if user declined this specific version
  const declinedVersion = localStorage.getItem(STORAGE_KEYS.UPGRADE_DECLINED_VERSION);
  if (declinedVersion === PACKAGED_PLUGIN_VERSION) return false;

  return true;
}

/**
 * Generate manifest object with current version
 */
function generateManifest(): PluginManifest {
  return {
    id: 'dungeon-map-tracker-settings',
    name: 'Windrose MapDesigner',
    version: PACKAGED_PLUGIN_VERSION,
    minAppVersion: '0.15.0',
    description: 'Global settings and commands for Windrose MapDesigner - customize default colors, hex orientation, and visual preferences.',
    author: 'Windrose MD',
    isDesktopOnly: false
  };
}

/**
 * Escape non-ASCII unicode characters in a string as \uXXXX sequences.
 * Required for PUA (Private Use Area) characters in RA_ICONS that can
 * cause parsing issues on some platforms when embedded as raw characters.
 */
function escapeUnicode(str: string): string {
  return str.replace(/[\u0080-\uffff]/g, (c) => {
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

/**
 * Generate main.js content from template with injected constants.
 * Assembles fresh each time to ensure upgrades get latest code.
 */
async function generatePluginFiles(): Promise<PluginFiles> {
  // Lazy-load assembler only when actually installing/upgrading
  const { assembleSettingsPlugin, getStylesCSS } = await requireModuleByName("settingsPluginAssembler.js");

  // Assemble the plugin fresh (loads all source files)
  const SETTINGS_PLUGIN_TEMPLATE = await assembleSettingsPlugin();
  const stylesCSS = await getStylesCSS();

  // Build category order map from CATEGORIES
  const categoryOrder: Record<string, number> = {};
  CATEGORIES.forEach((c: { id: string; order: number }) => { categoryOrder[c.id] = c.order; });

  const mainJs = SETTINGS_PLUGIN_TEMPLATE
    .replace(/\{\{PLUGIN_VERSION\}\}/g, PACKAGED_PLUGIN_VERSION)
    .replace(/\{\{DEFAULT_HEX_ORIENTATION\}\}/g, DEFAULTS.hexOrientation)
    .replace(/\{\{DEFAULT_GRID_LINE_COLOR\}\}/g, THEME.grid.lines)
    .replace(/\{\{DEFAULT_BACKGROUND_COLOR\}\}/g, THEME.grid.background)
    .replace(/\{\{DEFAULT_BORDER_COLOR\}\}/g, THEME.cells.border)
    .replace(/\{\{DEFAULT_COORDINATE_KEY_COLOR\}\}/g, THEME.coordinateKey.color)
    .replace(/\{\{DEFAULT_COORDINATE_TEXT_COLOR\}\}/g, THEME.coordinateText.color)
    .replace(/\{\{DEFAULT_COORDINATE_TEXT_SHADOW\}\}/g, THEME.coordinateText.shadow)
    .replace('{{BUILT_IN_OBJECTS}}', JSON.stringify(OBJECT_TYPES, null, 2))
    .replace('{{BUILT_IN_CATEGORIES}}', JSON.stringify(CATEGORIES, null, 2))
    .replace('{{CATEGORY_ORDER}}', JSON.stringify(categoryOrder, null, 2))
    .replace('{{RA_ICONS}}', escapeUnicode(JSON.stringify(RA_ICONS, null, 2)))
    .replace('{{RA_CATEGORIES}}', JSON.stringify(RA_CATEGORIES, null, 2))
    .replace('{{QUICK_SYMBOLS}}', JSON.stringify(QUICK_SYMBOLS));

  return { mainJs, stylesCSS };
}

const SettingsPluginInstaller = ({
  onInstall,
  onDecline,
  mode = 'auto'
}: SettingsPluginInstallerProps): React.ReactElement => {
  const [isInstalling, setIsInstalling] = dc.useState(false);
  const [installError, setInstallError] = dc.useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = dc.useState(false);

  // Determine if we're in install or upgrade mode
  const installedVersion = getInstalledPluginVersion();
  const isUpgradeMode = mode === 'upgrade' || (mode === 'auto' && installedVersion && shouldOfferUpgrade());
  const actionMode: ActionMode = isUpgradeMode ? 'upgrade' : 'install';

  const handleInstall = async (): Promise<void> => {
    setIsInstalling(true);
    setInstallError(null);

    try {
      const pluginDir = '.obsidian/plugins/dungeon-map-tracker-settings';
      const adapter = dc.app.vault.adapter;

      // Check if plugin directory already exists
      const exists = await adapter.exists(pluginDir);
      if (exists) {
        setInstallError('Plugin directory already exists. Please enable it in Community Plugins settings.');
        setIsInstalling(false);
        return;
      }

      // Create plugin directory
      await adapter.mkdir(pluginDir);

      // Write manifest.json
      await adapter.write(
        `${pluginDir}/manifest.json`,
        JSON.stringify(generateManifest(), null, 2)
      );

      // Write main.js from template
      const { mainJs, stylesCSS } = await generatePluginFiles();
      await adapter.write(`${pluginDir}/main.js`, mainJs);

      // Write styles.css for Obsidian to load automatically
      if (stylesCSS) {
        await adapter.write(`${pluginDir}/styles.css`, stylesCSS);
      } else {
        console.warn('[SettingsPluginInstaller] No CSS content available - inline styles will be used');
      }

      // Create initial data.json with defaults from dmtConstants
      const defaultData = {
        version: '1.0.0',
        hexOrientation: DEFAULTS.hexOrientation,
        gridLineColor: THEME.grid.lines,
        gridLineWidth: THEME.grid.lineWidth,
        backgroundColor: THEME.grid.background,
        borderColor: THEME.cells.border,
        coordinateKeyColor: THEME.coordinateKey.color,
        expandedByDefault: false,
        // Object customization
        objectOverrides: {},
        customObjects: [],
        customCategories: []
      };
      await adapter.write(
        `${pluginDir}/data.json`,
        JSON.stringify(defaultData, null, 2)
      );

      try {
        const communityPluginsPath = '.obsidian/community-plugins.json';
        let enabledPlugins: string[] = [];

        // Read existing community-plugins.json if it exists
        if (await adapter.exists(communityPluginsPath)) {
          const content = await adapter.read(communityPluginsPath);
          enabledPlugins = JSON.parse(content);
        }

        // Add our plugin if not already in the list
        if (!enabledPlugins.includes('dungeon-map-tracker-settings')) {
          enabledPlugins.push('dungeon-map-tracker-settings');
          await adapter.write(communityPluginsPath, JSON.stringify(enabledPlugins, null, 2));
        }

        // Reload plugins to detect the new plugin (but don't enable yet)
        await dc.app.plugins.loadManifests();
      } catch (manifestError) {
        console.warn('[SettingsPluginInstaller] Could not reload manifests:', manifestError);
        // Not critical - plugin will be detected on next Obsidian restart
      }

      setIsInstalling(false);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('[SettingsPluginInstaller] Installation error:', error);
      setInstallError(`Installation failed: ${(error as Error).message}`);
      setIsInstalling(false);
    }
  };

  const handleUpgrade = async (): Promise<void> => {
    setIsInstalling(true);
    setInstallError(null);

    try {
      const pluginDir = '.obsidian/plugins/dungeon-map-tracker-settings';
      const adapter = dc.app.vault.adapter;

      // Verify plugin exists
      const exists = await adapter.exists(pluginDir);
      if (!exists) {
        setInstallError('Plugin not found. Please install it first.');
        setIsInstalling(false);
        return;
      }

      // Write updated manifest.json
      await adapter.write(
        `${pluginDir}/manifest.json`,
        JSON.stringify(generateManifest(), null, 2)
      );

      // Write updated main.js from template
      const { mainJs, stylesCSS } = await generatePluginFiles();
      await adapter.write(`${pluginDir}/main.js`, mainJs);

      // Write/update styles.css for Obsidian to load automatically
      if (stylesCSS) {
        await adapter.write(`${pluginDir}/styles.css`, stylesCSS);
      }

      // DO NOT overwrite data.json - preserve user settings

      // Reload the plugin
      try {
        await dc.app.plugins.disablePlugin('dungeon-map-tracker-settings');
        await dc.app.plugins.loadManifests();
        await dc.app.plugins.enablePlugin('dungeon-map-tracker-settings');
      } catch (reloadError) {
        console.warn('[SettingsPluginInstaller] Could not reload plugin:', reloadError);
        // Not critical - plugin will be updated on next Obsidian restart
      }

      setIsInstalling(false);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('[SettingsPluginInstaller] Upgrade error:', error);
      setInstallError(`Upgrade failed: ${(error as Error).message}`);
      setIsInstalling(false);
    }
  };

  const handleAction = (): void => {
    if (actionMode === 'upgrade') {
      handleUpgrade();
    } else {
      handleInstall();
    }
  };

  const handleDecline = (): void => {
    if (actionMode === 'upgrade') {
      // Store the declined version
      localStorage.setItem(STORAGE_KEYS.UPGRADE_DECLINED_VERSION, PACKAGED_PLUGIN_VERSION);
    } else {
      // Store that install was declined
      localStorage.setItem(STORAGE_KEYS.INSTALL_DECLINED, 'true');
    }
    onDecline();
  };

  const handleEnableNow = async (): Promise<void> => {
    try {
      // Small delay to ensure manifest is loaded
      await new Promise(resolve => setTimeout(resolve, 100));

      // Enable the plugin
      await dc.app.plugins.enablePlugin('dungeon-map-tracker-settings');

      setShowSuccessModal(false);
      onInstall();
    } catch (enableError) {
      console.error('[SettingsPluginInstaller] Failed to enable plugin:', enableError);
      setInstallError(`Failed to enable plugin: ${(enableError as Error).message}`);
      setShowSuccessModal(false);
    }
  };

  const handleContinueWithoutEnabling = (): void => {
    setShowSuccessModal(false);
    onInstall();
  };

  return (
    <div className="dmt-plugin-installer">
      <div className="dmt-plugin-installer-card">
        <div className="dmt-plugin-installer-icon">
          <WindroseCompass size={84} />
        </div>
        <div className="dmt-plugin-installer-content">
          <h3>
            {actionMode === 'upgrade'
              ? `Update Available (v${installedVersion} → v${PACKAGED_PLUGIN_VERSION})`
              : 'Enhance Your Mapping Experience'
            }
          </h3>
          <p>
            {actionMode === 'upgrade'
              ? `A new version of the Windrose MapDesigner Settings plugin is available.`
              : `Install the Windrose MapDesigner Settings plugin to customize:`
            }
          </p>
          {actionMode === 'install' && (
            <ul>
              <li>Default colors for grids, borders, and backgrounds</li>
              <li>Hex grid orientation (flat-top or pointy-top)</li>
              <li>Coordinate label colors</li>
              <li>Custom map objects and symbols</li>
              <li>Visual preferences across all your maps</li>
            </ul>
          )}
          {actionMode === 'upgrade' && (
            <p className="dmt-plugin-installer-note">
              Your settings will be preserved during the update.
            </p>
          )}
          <p className="dmt-plugin-installer-note">
            {actionMode === 'upgrade'
              ? 'You can update now or continue with your current version.'
              : 'This is a one-time setup. You can change settings anytime in Obsidian\'s Settings panel. If you decline, default colors will be used.'
            }
          </p>
          {installError && (
            <div className="dmt-plugin-installer-error">
              {installError}
            </div>
          )}
        </div>
        <div className="dmt-plugin-installer-actions">
          <button
            className="dmt-plugin-installer-btn dmt-plugin-installer-btn-primary"
            onClick={handleAction}
            disabled={isInstalling}
          >
            {isInstalling
              ? (actionMode === 'upgrade' ? 'Updating...' : 'Installing...')
              : (actionMode === 'upgrade' ? 'Update Plugin' : 'Install Plugin')
            }
          </button>
          <button
            className="dmt-plugin-installer-btn dmt-plugin-installer-btn-secondary"
            onClick={handleDecline}
            disabled={isInstalling}
          >
            {actionMode === 'upgrade' ? 'Not Now' : 'Use Defaults'}
          </button>
        </div>
      </div>

      {showSuccessModal && (
        <div className="dmt-plugin-success-modal-overlay">
          <div className="dmt-plugin-success-modal">
            <div className="dmt-plugin-success-icon">
              <dc.Icon icon="lucide-check-circle" />
            </div>
            <h3>
              {actionMode === 'upgrade'
                ? 'Plugin Updated Successfully!'
                : 'Plugin Installed Successfully!'
              }
            </h3>
            <p>
              {actionMode === 'upgrade'
                ? `The Windrose MD Settings plugin has been updated to v${PACKAGED_PLUGIN_VERSION}.`
                : `The Windrose MD Settings plugin has been installed.`
              }
              {actionMode === 'install' && ' Would you like to enable it now?'}
            </p>
            {actionMode === 'install' && (
              <p className="dmt-plugin-success-note">
                You can always enable or disable this plugin later in Obsidian's Community Plugins settings.
              </p>
            )}
            <div className="dmt-plugin-success-actions">
              {actionMode === 'install' ? (
                <>
                  <button
                    className="dmt-plugin-installer-btn dmt-plugin-installer-btn-primary"
                    onClick={handleEnableNow}
                  >
                    Enable Now
                  </button>
                  <button
                    className="dmt-plugin-installer-btn dmt-plugin-installer-btn-secondary"
                    onClick={handleContinueWithoutEnabling}
                  >
                    Continue Without Enabling
                  </button>
                </>
              ) : (
                <button
                  className="dmt-plugin-installer-btn dmt-plugin-installer-btn-primary"
                  onClick={() => {
                    setShowSuccessModal(false);
                    onInstall();
                  }}
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

return {
  SettingsPluginInstaller,
  // Export utilities for other components to check upgrade status
  PACKAGED_PLUGIN_VERSION,
  shouldOfferUpgrade,
  getInstalledPluginVersion,
  isPluginInstalled,
  compareVersions,
  STORAGE_KEYS
};
