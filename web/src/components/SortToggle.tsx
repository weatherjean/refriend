interface SortToggleProps {
  value: 'new' | 'hot';
  onChange: (value: 'new' | 'hot') => void;
  hotFirst?: boolean;
}

export function SortToggle({ value, onChange, hotFirst = false }: SortToggleProps) {
  const buttons = [
    { key: 'new', label: 'New' },
    { key: 'hot', label: 'Hot' },
  ] as const;

  const orderedButtons = hotFirst ? [...buttons].reverse() : buttons;

  return (
    <div className="btn-group btn-group-sm">
      {orderedButtons.map(({ key, label }) => (
        <button
          key={key}
          className={`btn ${value === key ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
