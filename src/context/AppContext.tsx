import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { App } from 'obsidian';

const AppContext = createContext<App | null>(null);

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within AppProvider');
  return app;
}

export { AppContext };
