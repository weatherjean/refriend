import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  icon?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
}

export function PageHeader({ title, icon, onRefresh, refreshing, actions }: PageHeaderProps) {
  return (
    <div className="d-flex justify-content-between align-items-center mb-4">
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
  );
}
