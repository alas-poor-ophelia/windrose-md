import type { App } from 'obsidian';

/**
 * Create every missing folder along `path` (like mkdir -p). A createFolder
 * failure is only reported when the folder still does not exist afterwards,
 * so the normal "already exists" race stays silent. Logs at most once per call.
 */
async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = path.split('/');
  let current = '';
  let logged = false;
  for (const part of parts) {
    if (part === '') continue;
    current = current === '' ? part : current + '/' + part;
    if (app.vault.getAbstractFileByPath(current) != null) continue;
    try {
      await app.vault.createFolder(current);
    } catch (err) {
      if (app.vault.getAbstractFileByPath(current) == null && !logged) {
        logged = true;
        console.warn('[Windrose] Could not create folder', current, err);
      }
    }
  }
}

export { ensureFolder };
