import { Link } from 'react-router-dom';

interface TagBadgeProps {
  tag: string;
}

export function TagBadge({ tag }: TagBadgeProps) {
  // Generate consistent color from tag name
  const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360;

  return (
    <Link
      to={`/tags/${encodeURIComponent(tag)}`}
      className="badge text-decoration-none"
      style={{
        backgroundColor: `hsl(${hue}, 70%, 90%)`,
        color: `hsl(${hue}, 70%, 25%)`,
      }}
    >
      #{tag}
    </Link>
  );
}
