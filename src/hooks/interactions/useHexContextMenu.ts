import type { MapData, Region } from '#types/core/map.types';
import type { App } from 'obsidian';

import { useEffect } from 'preact/hooks';
import { Menu } from 'obsidian';
import type { MenuItem } from 'obsidian';
import { openNativeNoteLinkModal } from '../../components/modals/NoteLinkModal';
import type { HexContextMenuDetail } from '../../core/windroseEvents';

interface UseHexContextMenuOptions {
  app: App;
  mapData: MapData | null;
  enterSubHex: (q: number, r: number) => void;
  handleRegionsChange: (regions: Region[]) => void;
}

function useHexContextMenu({
  app,
  mapData,
  enterSubHex,
  handleRegionsChange,
}: UseHexContextMenuOptions): void {
  useEffect(() => {
    const handleHexContextMenu = (event: CustomEvent<HexContextMenuDetail>): void => {
      if (!mapData || mapData.mapType !== 'hex') return;

      const { q, r, screenX, screenY } = event.detail;
      const hexKey = `${q},${r}`;
      const hasSubHex = mapData.subHexMaps != null && mapData.subHexMaps[hexKey] != null;

      const menu = new Menu();

      menu.addItem((item: MenuItem) => {
        item.setTitle(hasSubHex ? `Enter Sub-Hex (${q}, ${r})` : `Create Sub-Hex (${q}, ${r})`);
        item.setIcon(hasSubHex ? 'lucide-arrow-down-right' : 'lucide-plus-circle');
        item.onClick(() => enterSubHex(q, r));
      });

      const region = (mapData.regions ?? []).find((reg: Region) =>
        reg.hexes.some((h: { x: number; y: number }) => h.x === q && h.y === r)
      );
      if (region) {
        menu.addSeparator();

        menu.addItem((item: MenuItem) => {
          item.setTitle(`Edit Region: ${region.name}`);
          item.setIcon('lucide-pencil');
          item.onClick(() => {
            document.dispatchEvent(new CustomEvent('windrose:edit-region', { detail: { regionId: region.id } }));
          });
        });

        menu.addItem((item: MenuItem) => {
          item.setTitle(region.visible ? 'Hide Region' : 'Show Region');
          item.setIcon(region.visible ? 'lucide-eye-off' : 'lucide-eye');
          item.onClick(() => {
            const updated = (mapData.regions ?? []).map((r: Region) =>
              r.id === region.id ? { ...r, visible: !r.visible } : r
            );
            handleRegionsChange(updated);
          });
        });

        if (region.linkedNote != null && region.linkedNote !== '') {
          const notePath = region.linkedNote;
          menu.addItem((item: MenuItem) => {
            item.setTitle('Open linked note');
            item.setIcon('lucide-external-link');
            item.onClick(() => {
              const linkPath = notePath.replace(/\.md$/, '');
              void app.workspace.openLinkText(linkPath, '', false);
            });
          });
        }

        menu.addItem((item: MenuItem) => {
          item.setTitle(region.linkedNote != null && region.linkedNote !== '' ? 'Change linked note' : 'Link note');
          item.setIcon('lucide-link');
          item.onClick(() => {
            openNativeNoteLinkModal(app, {
              onSave: (notePath: string | null) => {
                const updated = (mapData.regions ?? []).map((r: Region) =>
                  r.id === region.id ? { ...r, linkedNote: notePath ?? undefined } : r
                );
                handleRegionsChange(updated);
              },
              onClose: () => {},
              currentNotePath: region.linkedNote ?? null,
              objectType: null
            });
          });
        });

        menu.addSeparator();

        menu.addItem((item: MenuItem) => {
          item.setTitle('Delete region');
          item.setIcon('lucide-trash-2');
          item.setWarning(true);
          item.onClick(() => {
            handleRegionsChange((mapData.regions ?? []).filter((r: Region) => r.id !== region.id));
          });
        });
      }

      menu.showAtPosition({ x: screenX, y: screenY });
    };

    document.addEventListener('windrose:hex-context-menu', handleHexContextMenu);
    return () => document.removeEventListener('windrose:hex-context-menu', handleHexContextMenu);
  }, [app, mapData, enterSubHex, handleRegionsChange]);
}

export { useHexContextMenu };
