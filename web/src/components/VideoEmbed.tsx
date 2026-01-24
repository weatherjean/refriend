import { useState } from 'react';
import type { VideoEmbed as VideoEmbedType } from '../api';

interface VideoEmbedProps {
  video: VideoEmbedType;
}

const PLATFORM_NAMES: Record<VideoEmbedType['platform'], string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  peertube: 'PeerTube',
};

const PLATFORM_ICONS: Record<VideoEmbedType['platform'], string> = {
  youtube: 'bi-youtube',
  tiktok: 'bi-tiktok',
  peertube: 'bi-play-btn',
};

export function VideoEmbed({ video }: VideoEmbedProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const platformName = PLATFORM_NAMES[video.platform];
  const platformIcon = PLATFORM_ICONS[video.platform];
  const isTikTok = video.platform === 'tiktok';

  if (isPlaying) {
    return (
      <div className={`video-embed video-embed-playing ${isTikTok ? 'video-embed-vertical' : ''}`}>
        <iframe
          src={video.embedUrl}
          loading="lazy"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          title={`${platformName} video`}
        />
      </div>
    );
  }

  return (
    <div
      className={`video-embed video-embed-preview ${isTikTok ? 'video-embed-vertical' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setIsPlaying(true);
      }}
    >
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt="Video thumbnail"
          className="video-embed-thumbnail"
          onError={(e) => {
            // Hide broken thumbnail
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="video-embed-placeholder" />
      )}
      <div className="video-embed-overlay">
        <div className="video-embed-play-btn">
          <i className="bi bi-play-fill"></i>
        </div>
        <div className="video-embed-platform">
          <i className={`bi ${platformIcon} me-1`}></i>
          {platformName}
        </div>
      </div>
    </div>
  );
}
