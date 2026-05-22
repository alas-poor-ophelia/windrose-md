import type { ComponentChildren, VNode } from 'preact';

import { useApp } from '../../context/AppContext';

interface InternalLinkProps {
  link: string;
  children?: ComponentChildren;
  onClick?: (e: Event) => void;
  [key: string]: unknown;
}

function InternalLink({ link, children }: InternalLinkProps): VNode {
  const app = useApp();

  const handleClick = (e: MouseEvent): void => {
    e.preventDefault();
    void app.workspace.openLinkText(link, '', false);
  };

  return (
    <a href={link} class="internal-link" onClick={handleClick}>
      {children != null ? children : link}
    </a>
  );
}

export { InternalLink };
