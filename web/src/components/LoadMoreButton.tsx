interface LoadMoreButtonProps {
  loading: boolean;
  onClick: () => void;
  className?: string;
}

export function LoadMoreButton({ loading, onClick, className = '' }: LoadMoreButtonProps) {
  return (
    <div className={`text-center py-3 ${className}`}>
      <button
        className="btn btn-outline-primary"
        onClick={onClick}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="spinner-border spinner-border-sm me-1"></span>
            Loading...
          </>
        ) : (
          'Load More'
        )}
      </button>
    </div>
  );
}
