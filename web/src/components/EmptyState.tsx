interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="text-center text-muted py-5">
      <i className={`bi bi-${icon} fs-1 mb-3 d-block`}></i>
      <p className="mb-1">{title}</p>
      {description && <p className="small">{description}</p>}
    </div>
  );
}
