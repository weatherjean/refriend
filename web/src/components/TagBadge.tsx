import { Link } from 'react-router-dom';

interface TagBadgeProps {
  tag: string;
}

// Dark mode palette - subtle backgrounds with bright text
const TAG_COLORS = [
  { bg: 'rgba(248, 113, 113, 0.15)', text: '#f87171' }, // red
  { bg: 'rgba(251, 146, 60, 0.15)', text: '#fb923c' }, // orange
  { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24' }, // amber
  { bg: 'rgba(163, 230, 53, 0.15)', text: '#a3e635' }, // lime
  { bg: 'rgba(74, 222, 128, 0.15)', text: '#4ade80' }, // green
  { bg: 'rgba(45, 212, 191, 0.15)', text: '#2dd4bf' }, // teal
  { bg: 'rgba(34, 211, 238, 0.15)', text: '#22d3ee' }, // cyan
  { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8' }, // sky
  { bg: 'rgba(96, 165, 250, 0.15)', text: '#60a5fa' }, // blue
  { bg: 'rgba(129, 140, 248, 0.15)', text: '#818cf8' }, // indigo
  { bg: 'rgba(167, 139, 250, 0.15)', text: '#a78bfa' }, // violet
  { bg: 'rgba(192, 132, 252, 0.15)', text: '#c084fc' }, // purple
  { bg: 'rgba(232, 121, 249, 0.15)', text: '#e879f9' }, // fuchsia
  { bg: 'rgba(244, 114, 182, 0.15)', text: '#f472b6' }, // pink
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
      className="text-decoration-none"
      style={{
        backgroundColor: color.bg,
        color: color.text,
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.8125rem',
        fontWeight: 500,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
    >
      #{tag}
    </Link>
  );
}
