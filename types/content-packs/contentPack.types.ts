export type PackType = 'object-pack' | 'fog-pack' | 'font-pack';

export interface RegistryPack {
  id: string;
  name: string;
  author: string;
  type: PackType;
  version: string;
  description: string;
  size: number;
  downloadUrl: string;
}

export interface ContentPackRegistry {
  version: number;
  packs: RegistryPack[];
}

export interface InstalledPack {
  id: string;
  name: string;
  type: PackType;
  version: string;
  installedAt: number;
  vaultPath: string;
}
