/**
 * SubHexBreadcrumb.tsx
 *
 * Navigation breadcrumb bar shown when inside a sub-hex drill-down.
 * Displays the path from world map to current sub-hex level.
 */

import { Icon } from '../shared/Icon';
import type { VNode } from 'preact';

interface BreadcrumbSegment {
  label: string;
  depth: number;
}

interface SubHexBreadcrumbProps {
  breadcrumbs: BreadcrumbSegment[];
  onNavigate: (depth: number) => void;
}

const SubHexBreadcrumb = ({
  breadcrumbs,
  onNavigate
}: SubHexBreadcrumbProps): VNode => {
  return (
    <div className="dmt-sub-hex-breadcrumb">
      {breadcrumbs.map((segment, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return (
          <span key={segment.depth} className="dmt-breadcrumb-segment">
            {index > 0 && (
              <span className="dmt-breadcrumb-separator">
                <Icon icon="lucide-chevron-right" size={12} />
              </span>
            )}
            {isLast ? (
              <span className="dmt-breadcrumb-current">{segment.label}</span>
            ) : (
              <button
                className="dmt-breadcrumb-link"
                onClick={() => onNavigate(segment.depth)}
                title={`Back to ${segment.label}`}
              >
                {segment.label}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
};

export { SubHexBreadcrumb };