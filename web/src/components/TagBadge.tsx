import { Link } from 'react-router-dom';

interface TagBadgeProps {
  tag: string;
}

// Curated palette of visually distinct colors
const TAG_COLORS = [
  { bg: '#fee2e2', text: '#991b1b' }, // red
  { bg: '#ffedd5', text: '#9a3412' }, // orange
  { bg: '#fef3c7', text: '#92400e' }, // amber
  { bg: '#fef9c3', text: '#854d0e' }, // yellow
  { bg: '#ecfccb', text: '#3f6212' }, // lime
  { bg: '#dcfce7', text: '#166534' }, // green
  { bg: '#d1fae5', text: '#065f46' }, // emerald
  { bg: '#ccfbf1', text: '#115e59' }, // teal
  { bg: '#cffafe', text: '#155e75' }, // cyan
  { bg: '#e0f2fe', text: '#075985' }, // sky
  { bg: '#dbeafe', text: '#1e40af' }, // blue
  { bg: '#e0e7ff', text: '#3730a3' }, // indigo
  { bg: '#ede9fe', text: '#5b21b6' }, // violet
  { bg: '#f3e8ff', text: '#6b21a8' }, // purple
  { bg: '#fae8ff', text: '#86198f' }, // fuchsia
  { bg: '#fce7f3', text: '#9d174d' }, // pink
];

export function TagBadge({ tag }: TagBadgeProps) {
  // Simple hash to pick color from palette
  const hash = tag.split('').reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  const colorIndex = Math.abs(hash) % TAG_COLORS.length;
  const color = TAG_COLORS[colorIndex];

  return (
    <Link
      to={`/tags/${encodeURIComponent(tag)}`}
      className="badge text-decoration-none"
      style={{
        backgroundColor: color.bg,
        color: color.text,
      }}
    >
      #{tag}
    </Link>
  );
}
