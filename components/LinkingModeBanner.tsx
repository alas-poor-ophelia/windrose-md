import type { LinkingSource } from '../context/ObjectLinkingContext.tsx';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getObjectType } = await requireModuleByName("objectTypeResolver.ts");

interface LinkingModeBannerProps {
  linkingFrom: LinkingSource;
  onCancel: () => void;
}

const LinkingModeBanner = ({ linkingFrom, onCancel }: LinkingModeBannerProps): React.ReactElement => {
  const objectDef = getObjectType(linkingFrom.objectType);
  const objectLabel = objectDef?.label || linkingFrom.objectType;

  dc.useEffect(() => {
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
        <dc.Icon icon="lucide-link-2" />
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

return { LinkingModeBanner };
