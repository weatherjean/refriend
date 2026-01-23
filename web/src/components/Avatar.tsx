import { useState } from 'react';

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
  const [imgError, setImgError] = useState(false);
  const px = sizeMap[size];
  const initial = name[0]?.toUpperCase() || '?';

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt=""
        className={`rounded-circle ${className}`}
        style={{ width: px, height: px, objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback with initial
  return (
    <div
      className={`rounded-circle bg-secondary d-inline-flex align-items-center justify-content-center text-white ${className}`}
      style={{ width: px, height: px, fontSize: px * 0.4 }}
    >
      {initial}
    </div>
  );
}

// Community avatar with icon fallback
interface CommunityAvatarProps {
  src?: string | null;
  size?: number;
  className?: string;
}

export function CommunityAvatar({ src, size = 48, className = '' }: CommunityAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const iconSize = size >= 80 ? 'fs-1' : size >= 48 ? 'fs-4' : 'fs-5';

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt=""
        className={`rounded ${className}`}
        style={{ width: size, height: size, objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`rounded bg-secondary d-inline-flex align-items-center justify-content-center ${className}`}
      style={{ width: size, height: size }}
    >
      <i className={`bi bi-people-fill text-white ${iconSize}`}></i>
    </div>
  );
}
