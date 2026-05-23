import type { App, Plugin } from 'obsidian';
import { Modal } from 'obsidian';

type DungeonModalCallback = (
  mapName: string,
  cells: Array<{ x: number; y: number; [key: string]: unknown }>,
  objects: unknown[],
  edges: unknown[],
  options: Record<string, unknown>
) => void | Promise<void>;

declare class InsertDungeonModal extends Modal {
  constructor(app: App, plugin: Plugin, onInsert: DungeonModalCallback);
}

export { InsertDungeonModal };
