import type { ComponentChildren } from 'preact';

import { useApp } from '../../context/AppContext';

interface InternalLinkProps {
  link: string;
  children?: ComponentChildren;
  onClick?: (e: Event) => void;
  [key: string]: unknown;
}

function InternalLink({ link, children }: InternalLinkProps) {
  const app = useApp();

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    void app.workspace.openLinkText(link, '', false);
  };

  return (
    <a href={link} class="internal-link" onClick={handleClick}>
      {children || link}
    </a>
  );
}

export { InternalLink };
