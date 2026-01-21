interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  xs: 16,
  sm: 28,
  md: 40,
  lg: 80,
  xl: 100,
};

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const px = sizeMap[size];
  const initial = name[0]?.toUpperCase() || '?';

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`rounded-circle ${className}`}
        style={{ width: px, height: px, objectFit: 'cover' }}
      />
    );
  }

  // Fallback with initial
  return (
    <div
      className={`rounded-circle bg-secondary d-flex align-items-center justify-content-center text-white ${className}`}
      style={{ width: px, height: px, fontSize: px * 0.4 }}
    >
      {initial}
    </div>
  );
}
