import type { LinkingSource } from '../../context/ObjectLinkingContext.tsx';

import { useEffect } from 'preact/hooks';
import type { VNode } from 'preact';
import { getObjectType } from '../../objects/objectTypeResolver';
import { Icon } from '../shared/Icon';






interface LinkingModeBannerProps {
  linkingFrom: LinkingSource;
  onCancel: () => void;
}

const LinkingModeBanner = ({ linkingFrom, onCancel }: LinkingModeBannerProps): VNode => {
  const objectDef = getObjectType(linkingFrom.objectType);
  const objectLabel = objectDef?.label || linkingFrom.objectType;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="dmt-linking-banner">
      <div className="dmt-linking-banner-content">
        <Icon icon="lucide-link-2" />
        <span>Linking from <strong>{objectLabel}</strong> - click target object</span>
        <button
          className="dmt-linking-banner-cancel"
          onClick={onCancel}
          title="Cancel (Esc)"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export { LinkingModeBanner };