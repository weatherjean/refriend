/**
 * Video embed handling for supported platforms
 * Supports: YouTube, TikTok, PeerTube
 */

export interface VideoEmbed {
  platform: 'youtube' | 'tiktok' | 'peertube';
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  originalUrl: string;
}

interface VideoPattern {
  platform: VideoEmbed['platform'];
  patterns: RegExp[];
  getEmbedUrl: (videoId: string, host?: string) => string;
  getThumbnailUrl: (videoId: string, host?: string) => string | null;
}

const VIDEO_PATTERNS: VideoPattern[] = [
  {
    platform: 'youtube',
    patterns: [
      /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([\w-]+)/,
      /youtube-nocookie\.com\/embed\/([\w-]+)/,
    ],
    getEmbedUrl: (videoId) => `https://www.youtube.com/embed/${videoId}`,
    getThumbnailUrl: (videoId) => `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  },
  {
    platform: 'tiktok',
    patterns: [
      /tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
      /vm\.tiktok\.com\/([\w-]+)/,
    ],
    getEmbedUrl: (videoId) => `https://www.tiktok.com/embed/v2/${videoId}`,
    getThumbnailUrl: () => null, // TikTok doesn't have easy thumbnail access
  },
  {
    platform: 'peertube',
    patterns: [
      // PeerTube uses various instance domains, match common URL patterns
      /^https?:\/\/([^\/]+)\/w\/([\w-]+)/,
      /^https?:\/\/([^\/]+)\/videos\/watch\/([\w-]+)/,
    ],
    getEmbedUrl: (videoId, host) => `https://${host}/videos/embed/${videoId}`,
    getThumbnailUrl: (videoId, host) => `https://${host}/static/thumbnails/${videoId}.jpg`,
  },
];

// Known PeerTube instances (popular instances from instances.joinpeertube.org)
const KNOWN_PEERTUBE_INSTANCES = [
  // Large/popular instances
  'peertube.social',
  'framatube.org',
  'peertube.fr',
  'tilvids.com',
  'diode.zone',
  'kolektiva.media',
  'video.ploud.fr',
  'tube.tchncs.de',
  // More instances
  'video.blender.org',
  'peertube.cpy.re',
  'tube.privacytools.io',
  'peertube.mastodon.host',
  'peertube.uno',
  'video.tedomum.net',
  'peertube.live',
  'tube.aquilenet.fr',
  'peertube.debian.social',
  'videos.pair2jeux.tube',
  'tube.kockatoo.org',
  'peertube.togart.de',
  'tube.opportunis.me',
  'video.lqdn.fr',
  'peertube.opencloud.lu',
  'tube.bootlicker.party',
  'video.autistici.org',
  'tube.systest.eu',
  'peertube.tv',
  'videos.scanlines.xyz',
  'tube.homecomputing.fr',
];

/**
 * Check if a host is likely a PeerTube instance
 * Uses known list + heuristics for common naming patterns
 */
function isPeerTubeInstance(host: string): boolean {
  return KNOWN_PEERTUBE_INSTANCES.includes(host) ||
         host.includes('peertube') ||
         host.startsWith('tube.') ||
         host.startsWith('video.') ||
         host.startsWith('videos.');
}

/**
 * Parse a URL and extract video embed information if it's a supported platform
 */
export function parseVideoUrl(url: string): VideoEmbed | null {
  try {
    new URL(url); // Validate URL

    // Check YouTube patterns
    for (const pattern of VIDEO_PATTERNS[0].patterns) {
      const match = url.match(pattern);
      if (match) {
        const videoId = match[1];
        return {
          platform: 'youtube',
          videoId,
          embedUrl: VIDEO_PATTERNS[0].getEmbedUrl(videoId),
          thumbnailUrl: VIDEO_PATTERNS[0].getThumbnailUrl(videoId),
          originalUrl: url,
        };
      }
    }

    // Check TikTok patterns
    for (const pattern of VIDEO_PATTERNS[1].patterns) {
      const match = url.match(pattern);
      if (match) {
        const videoId = match[1];
        return {
          platform: 'tiktok',
          videoId,
          embedUrl: VIDEO_PATTERNS[1].getEmbedUrl(videoId),
          thumbnailUrl: VIDEO_PATTERNS[1].getThumbnailUrl(videoId),
          originalUrl: url,
        };
      }
    }

    // Check PeerTube patterns (need to extract host)
    for (const pattern of VIDEO_PATTERNS[2].patterns) {
      const match = url.match(pattern);
      if (match && isPeerTubeInstance(match[1])) {
        const instanceHost = match[1];
        const videoId = match[2];
        return {
          platform: 'peertube',
          videoId,
          embedUrl: VIDEO_PATTERNS[2].getEmbedUrl(videoId, instanceHost),
          thumbnailUrl: VIDEO_PATTERNS[2].getThumbnailUrl(videoId, instanceHost),
          originalUrl: url,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is a supported video platform
 */
export function isSupportedVideoUrl(url: string): boolean {
  return parseVideoUrl(url) !== null;
}

/**
 * Get list of supported platforms for display
 */
export function getSupportedPlatforms(): string[] {
  return ['YouTube', 'TikTok', 'PeerTube'];
}
