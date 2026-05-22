import type { JSX, VNode } from 'preact';

import { useRef, useEffect } from 'preact/hooks';
import { setIcon } from 'obsidian';

interface IconProps {
  icon: string;
  size?: number;
  className?: string;
  style?: JSX.CSSProperties;
}

function Icon({ icon, size, className, style }: IconProps): VNode {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = '';
      setIcon(ref.current, icon);
      if (size != null) {
        const svg = ref.current.querySelector('svg');
        if (svg) {
          svg.setAttribute('width', String(size));
          svg.setAttribute('height', String(size));
        }
      }
    }
  }, [icon, size]);

  return <span ref={ref} className={className} style={style} />;
}

export { Icon };
