interface SearchFormProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear?: () => void;
  loading?: boolean;
  showClear?: boolean;
}

export function SearchForm({
  placeholder,
  value,
  onChange,
  onSubmit,
  onClear,
  loading = false,
  showClear = false,
}: SearchFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4">
      <div className="input-group">
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        {showClear && onClear && value && (
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={onClear}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!value.trim() || loading}
        >
          {loading ? (
            <span className="spinner-border spinner-border-sm"></span>
          ) : (
            <i className="bi bi-search"></i>
          )}
        </button>
      </div>
    </form>
  );
}
