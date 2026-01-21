interface LoadingSpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const spinnerClass = size === 'sm' ? 'spinner-border-sm' : '';

  return (
    <div className={`text-center py-5 ${className}`}>
      <div className={`spinner-border text-primary ${spinnerClass}`} role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}
