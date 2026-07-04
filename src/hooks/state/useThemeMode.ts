import { useState, useEffect } from 'preact/hooks';

function useThemeMode(): boolean {
  const [isLight, setIsLight] = useState(
    () => activeDocument.body.classList.contains('theme-light')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsLight(activeDocument.body.classList.contains('theme-light'));
    });
    observer.observe(activeDocument.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isLight;
}

export { useThemeMode };
