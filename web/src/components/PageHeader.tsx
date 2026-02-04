import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  icon?: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
  sticky?: boolean;
}

export function PageHeader({ title, icon, subtitle, onRefresh, refreshing, actions, sticky }: PageHeaderProps) {
  return (
    <div className={sticky ? 'page-header-sticky' : 'mt-3 mb-4'}>
      <div className="d-flex justify-content-between align-items-center">
        <h4 className="mb-0">
          {icon && <i className={`bi bi-${icon} me-2`} style={{ position: 'relative', top: '-0.15em' }}></i>}
          {title}
        </h4>
        <div className="d-flex align-items-center gap-2">
          {onRefresh && (
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh"
            >
              <i className={`bi bi-arrow-clockwise ${refreshing ? 'spin' : ''}`}></i>
            </button>
          )}
          {actions}
        </div>
      </div>
      {subtitle && <p className="text-muted small mt-1 mb-0">{subtitle}</p>}
    </div>
  );
}
