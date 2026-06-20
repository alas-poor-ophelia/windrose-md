/* eslint-disable obsidianmd/prefer-active-doc -- Obsidian's theme class lives on the MAIN app document body; a popout document doesn't carry it, so theme detection must read the main document. */
import { useState, useEffect } from 'preact/hooks';

function useThemeMode(): boolean {
  const [isLight, setIsLight] = useState(
    () => document.body.classList.contains('theme-light')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsLight(document.body.classList.contains('theme-light'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isLight;
}

export { useThemeMode };
