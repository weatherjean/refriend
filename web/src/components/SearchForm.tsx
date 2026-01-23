interface SearchFormProps {
  placeholder: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear?: () => void;
  loading?: boolean;
  showClear?: boolean;
  icon?: string;
  buttonText?: string;
}

export function SearchForm({
  placeholder,
  label,
  value,
  onChange,
  onSubmit,
  onClear,
  loading = false,
  showClear = false,
  icon = 'search',
  buttonText = 'Search',
}: SearchFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="card mb-4">
      <div className="card-body">
        <form onSubmit={handleSubmit}>
          {label && (
            <label htmlFor="searchInput" className="form-label">
              {label}
            </label>
          )}
          <div className="input-group">
            <span className="input-group-text">
              <i className={`bi bi-${icon}`}></i>
            </span>
            <input
              type="text"
              className="form-control"
              id="searchInput"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!value.trim() || loading}
            >
              {loading ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                buttonText
              )}
            </button>
            {showClear && onClear && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onClear}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
