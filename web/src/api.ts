const API_BASE = '/api';

// Global error handler for toast notifications
type ErrorHandler = (error: Error) => void;
let globalErrorHandler: ErrorHandler | null = null;

export function setGlobalErrorHandler(handler: ErrorHandler | null) {
  globalErrorHandler = handler;
}

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Actor {
  id: string;  // UUID
  uri: string;
  handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  url: string | null;
  is_local: boolean;
  actor_type?: 'Person' | 'Group';
  created_at: string;
}

export interface Attachment {
  id: number;
  url: string;
  media_type: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

export interface VideoEmbed {
  platform: 'youtube' | 'tiktok' | 'peertube';
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  originalUrl: string;
}

export interface Post {
  id: string;  // UUID
  uri: string;
  content: string;
  url: string | null;
  created_at: string;
  author: Actor | null;
  hashtags: string[];
  likes_count: number;
  boosts_count: number;
  liked: boolean;
  boosted: boolean;
  pinned: boolean;
  replies_count: number;
  sensitive: boolean;
  attachments: Attachment[];
  link_preview: LinkPreview | null;
  video_embed: VideoEmbed | null;
  in_reply_to: {
    id: string;  // UUID
    uri: string;
    content: string;
    url: string | null;
    created_at: string;
    author: Actor | null;
  } | null;
  community?: {
    id: string;
    name: string;
    handle: string;
    avatar_url: string | null;
  };
  boosted_by?: {
    id: string;
    handle: string;
    name: string | null;
    avatar_url: string | null;
  };
}

interface FetchOptions extends RequestInit {
  silent?: boolean; // Don't trigger global error handler
}

async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const { silent, ...fetchOptions } = options || {};
  const res = await fetch(API_BASE + url, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || 'Request failed');
    if (globalErrorHandler && !silent) {
      globalErrorHandler(error);
    }
    throw error;
  }
  return data;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined) query.set(key, String(val));
  });
  const str = query.toString();
  return str ? `?${str}` : '';
}

// Profile
export const profile = {
  update: (data: { name?: string; bio?: string }) =>
    fetchJson<{ actor: Actor }>('/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  uploadAvatar: (image: string) =>
    fetchJson<{ actor: Actor; avatar_url: string }>('/profile/avatar', {
      method: 'POST',
      body: JSON.stringify({ image }),
    }),
};

// Media
export interface AttachmentInput {
  url: string;
  alt_text?: string;
  width: number;
  height: number;
}

export const media = {
  upload: (image: string) =>
    fetchJson<{ url: string; media_type: string }>('/media', {
      method: 'POST',
      body: JSON.stringify({ image }),
    }),
};

// Auth
export const auth = {
  me: () => fetchJson<{ user: User | null; actor: Actor | null }>('/auth/me'),
  login: (email: string, password: string) =>
    fetchJson<{ user: User; actor: Actor }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (username: string, email: string, password: string) =>
    fetchJson<{ user: User; actor: Actor }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),
  logout: () => fetchJson<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    fetchJson<{ ok: boolean }>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  forgotPassword: (email: string) =>
    fetchJson<{ ok: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      silent: true, // Don't show global error for rate limiting
    }),
  validateResetToken: (token: string) =>
    fetchJson<{ ok: boolean; valid: boolean }>(`/auth/reset-password/${token}`, {
      silent: true,
    }),
  resetPassword: (token: string, password: string) =>
    fetchJson<{ ok: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
};

// Pagination params
export interface PaginationParams {
  limit?: number;
  before?: number;
  sort?: 'new' | 'hot';
}

export interface PaginatedPosts {
  posts: Post[];
  next_cursor: number | null;
}

export interface TrendingUser {
  id: string;  // UUID
  handle: string;
  name: string | null;
  avatar_url: string | null;
  new_followers: number;
}

// Users
export const users = {
  getTrending: () =>
    fetchJson<{ users: TrendingUser[] }>('/users/trending'),
  get: (username: string, options?: { silent?: boolean }) =>
    fetchJson<{
      actor: Actor;
      stats: { followers: number; following: number };
      is_following: boolean;
      is_own_profile: boolean;
    }>(`/users/${username}`, options),
  getPosts: (username: string, params?: PaginationParams) =>
    fetchJson<PaginatedPosts>(`/users/${username}/posts${buildQuery({ limit: params?.limit, before: params?.before, sort: params?.sort })}`),
  getReplies: (username: string, params?: PaginationParams) => {
    const query = new URLSearchParams({ filter: 'replies' });
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    return fetchJson<PaginatedPosts>(`/users/${username}/posts?${query}`);
  },
  getPinned: (username: string) =>
    fetchJson<{ posts: Post[] }>(`/users/${username}/pinned`),
  getBoosts: (username: string, params?: PaginationParams) =>
    fetchJson<PaginatedPosts>(`/users/${username}/boosts${buildQuery({ limit: params?.limit, before: params?.before })}`),
  getFollowers: (username: string) =>
    fetchJson<{ followers: Actor[] }>(`/users/${username}/followers`),
  getFollowing: (username: string) =>
    fetchJson<{ following: Actor[] }>(`/users/${username}/following`),
};

// Actors (works for both local and remote)
export const actors = {
  get: (actorId: string) =>
    fetchJson<{ actor: Actor; is_following: boolean; is_own_profile: boolean }>(`/actors/${actorId}`),
  getPosts: (actorId: string, params?: PaginationParams) =>
    fetchJson<PaginatedPosts>(`/actors/${actorId}/posts${buildQuery({ limit: params?.limit, before: params?.before, sort: params?.sort })}`),
  getReplies: (actorId: string, params?: PaginationParams) => {
    const query = new URLSearchParams({ filter: 'replies' });
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    return fetchJson<PaginatedPosts>(`/actors/${actorId}/posts?${query}`);
  },
  getPinned: (actorId: string) =>
    fetchJson<{ posts: Post[] }>(`/actors/${actorId}/pinned`),
  getBoosts: (actorId: string, params?: PaginationParams) =>
    fetchJson<PaginatedPosts>(`/actors/${actorId}/boosts${buildQuery({ limit: params?.limit, before: params?.before })}`),
};

// Posts
export const posts = {
  getTimeline: (timeline: 'public' | 'home' = 'public', params?: PaginationParams) => {
    const query = new URLSearchParams({ timeline });
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    return fetchJson<PaginatedPosts>(`/posts?${query}`);
  },
  getHot: (limit = 10) => fetchJson<{ posts: Post[] }>(`/posts/hot?limit=${limit}`),
  get: (id: string) => fetchJson<{ post: Post; ancestors: Post[] }>(`/posts/${id}`),
  getReplies: (id: string, sort?: 'new' | 'hot', after?: number) => {
    const params = new URLSearchParams();
    if (sort) params.set('sort', sort);
    if (after) params.set('after', after.toString());
    const query = params.toString();
    return fetchJson<{ replies: Post[]; op_author_id: string | null; next_cursor: number | null }>(
      `/posts/${id}/replies${query ? `?${query}` : ''}`
    );
  },
  create: (content: string, inReplyTo?: string, attachments?: AttachmentInput[], sensitive?: boolean, linkUrl?: string, videoUrl?: string) =>
    fetchJson<{ post: Post }>('/posts', {
      method: 'POST',
      body: JSON.stringify({ content, in_reply_to: inReplyTo, attachments, sensitive, link_url: linkUrl, video_url: videoUrl }),
    }),
  delete: (id: string) =>
    fetchJson<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
  like: (id: string) =>
    fetchJson<{ ok: boolean; likes_count: number; liked: boolean }>(`/posts/${id}/like`, {
      method: 'POST',
    }),
  unlike: (id: string) =>
    fetchJson<{ ok: boolean; likes_count: number; liked: boolean }>(`/posts/${id}/like`, {
      method: 'DELETE',
    }),
  boost: (id: string) =>
    fetchJson<{ ok: boolean; boosts_count: number; boosted: boolean }>(`/posts/${id}/boost`, {
      method: 'POST',
    }),
  unboost: (id: string) =>
    fetchJson<{ ok: boolean; boosts_count: number; boosted: boolean }>(`/posts/${id}/boost`, {
      method: 'DELETE',
    }),
  pin: (id: string) =>
    fetchJson<{ ok: boolean; pinned: boolean }>(`/posts/${id}/pin`, {
      method: 'POST',
    }),
  unpin: (id: string) =>
    fetchJson<{ ok: boolean; pinned: boolean }>(`/posts/${id}/pin`, {
      method: 'DELETE',
    }),
  report: (id: string, reason: string, details?: string) =>
    fetchJson<{ ok: boolean }>(`/posts/${id}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
    }),
};

// Follows
export const follows = {
  follow: (handle: string) =>
    fetchJson<{ ok: boolean; message?: string }>('/follow', {
      method: 'POST',
      body: JSON.stringify({ handle }),
    }),
  unfollow: (actorId: string) =>
    fetchJson<{ ok: boolean }>('/unfollow', {
      method: 'POST',
      body: JSON.stringify({ actor_id: actorId }),
    }),
};

// Search
export const search = {
  query: (q: string, type?: 'all' | 'users' | 'posts', handleOnly?: boolean) =>
    fetchJson<{ users: Actor[]; posts: Post[]; postsLowConfidence: boolean }>(
      `/search?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ''}${handleOnly ? '&handleOnly=true' : ''}`
    ),
};

// Tags
export const tags = {
  get: (tag: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    if (params?.sort) query.set('sort', params.sort);
    const queryStr = query.toString();
    return fetchJson<PaginatedPosts & { tag: string }>(`/tags/${encodeURIComponent(tag)}${queryStr ? '?' + queryStr : ''}`);
  },
  getTrending: () =>
    fetchJson<{ tags: { name: string; count: number }[] }>('/tags/trending'),
  getPopular: () =>
    fetchJson<{ tags: { name: string; count: number }[] }>('/tags/popular'),
  search: (q: string) =>
    fetchJson<{ tags: { name: string; count: number }[] }>(`/tags/search?q=${encodeURIComponent(q)}`),
};

// Notifications
export interface Notification {
  id: number;
  type: 'like' | 'boost' | 'follow' | 'reply' | 'mention';
  read: boolean;
  created_at: string;
  actor: {
    id: string;
    handle: string;
    name: string | null;
    avatar_url: string | null;
  };
  post: {
    id: string;
    content: string;
  } | null;
}

export const notifications = {
  getAll: (limit = 50, offset = 0) =>
    fetchJson<{ notifications: Notification[] }>(`/notifications?limit=${limit}&offset=${offset}`),
  getUnreadCount: () =>
    fetchJson<{ count: number }>('/notifications/unread/count'),
  markAsRead: (ids?: number[]) =>
    fetchJson<{ ok: boolean }>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  delete: (ids?: number[]) =>
    fetchJson<{ ok: boolean }>(`/notifications${ids?.length ? `?ids=${ids.join(',')}` : ''}`, {
      method: 'DELETE',
    }),
};

// Communities
export interface Community {
  id: string;  // UUID
  uri: string;
  handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  url: string | null;
  member_count: number;
  require_approval: boolean;
  created_at: string;
}

export interface CommunityModerationInfo {
  isMember: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isBanned: boolean;
  pendingPostsCount: number;
}

export interface CommunityAdmin {
  id: number;
  role: 'owner' | 'admin';
  actor: Actor;
  created_at: string;
}

export interface CommunityBan {
  id: number;
  actor: Actor;
  reason: string | null;
  created_at: string;
}

// CommunityPost extends Post with community info
export interface CommunityPost extends Post {
  internal_id?: number;
  submitted_at?: string;
  pinned_in_community?: boolean;
  is_announcement?: boolean;  // true = community boosted this post, false = post addressed TO community
  community?: {
    id: string;
    name: string;
    handle: string;
    avatar_url: string | null;
  };
  suggested_by?: Actor | null;
}

export interface PaginatedCommunities {
  communities: Community[];
  next_cursor: number | null;
}

export interface PaginatedCommunityPosts {
  posts: CommunityPost[];
  next_cursor: number | null;
}

export interface TrendingCommunity {
  id: string;
  handle: string;
  name: string | null;
  avatar_url: string | null;
  member_count: number;
  new_members: number;
}

export const communities = {
  // List and search
  list: (params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    const queryStr = query.toString();
    return fetchJson<PaginatedCommunities>(`/communities${queryStr ? '?' + queryStr : ''}`);
  },
  search: (q: string, limit = 20) =>
    fetchJson<{ communities: Community[] }>(`/communities/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getJoined: (limit = 50) =>
    fetchJson<{ communities: Community[] }>(`/communities/joined?limit=${limit}`),
  getTrending: () =>
    fetchJson<{ communities: TrendingCommunity[] }>(`/communities/trending`),

  // CRUD
  create: (name: string, bio?: string, requireApproval?: boolean) =>
    fetchJson<{ community: Community }>('/communities', {
      method: 'POST',
      body: JSON.stringify({ name, bio, require_approval: requireApproval }),
    }),
  get: (name: string) =>
    fetchJson<{ community: Community; moderation: CommunityModerationInfo | null }>(`/communities/${name}`),
  update: (name: string, updates: { name?: string; bio?: string; avatar_url?: string; require_approval?: boolean }) =>
    fetchJson<{ community: Community }>(`/communities/${name}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  delete: (name: string) =>
    fetchJson<{ ok: boolean }>(`/communities/${name}`, { method: 'DELETE' }),

  // Membership
  join: (name: string) =>
    fetchJson<{ ok: boolean; is_member: boolean }>(`/communities/${name}/join`, { method: 'POST' }),
  leave: (name: string) =>
    fetchJson<{ ok: boolean; is_member: boolean }>(`/communities/${name}/leave`, { method: 'POST' }),
  getMembers: (name: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    const queryStr = query.toString();
    return fetchJson<{ members: Actor[]; next_cursor: number | null }>(`/communities/${name}/members${queryStr ? '?' + queryStr : ''}`);
  },

  // Admin management
  getAdmins: (name: string) =>
    fetchJson<{ admins: CommunityAdmin[] }>(`/communities/${name}/admins`),
  addAdmin: (name: string, actorId: string, role: 'owner' | 'admin' = 'admin') =>
    fetchJson<{ ok: boolean }>(`/communities/${name}/admins`, {
      method: 'POST',
      body: JSON.stringify({ actor_id: actorId, role }),
    }),
  removeAdmin: (name: string, actorId: string) =>
    fetchJson<{ ok: boolean }>(`/communities/${name}/admins/${actorId}`, { method: 'DELETE' }),

  // Ban management
  getBans: (name: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    const qs = query.toString();
    return fetchJson<{ bans: CommunityBan[]; total_count: number; next_cursor: number | null }>(
      `/communities/${name}/bans${qs ? `?${qs}` : ''}`
    );
  },
  ban: (name: string, actorId: string, reason?: string) =>
    fetchJson<{ ok: boolean }>(`/communities/${name}/bans`, {
      method: 'POST',
      body: JSON.stringify({ actor_id: actorId, reason }),
    }),
  unban: (name: string, actorId: string) =>
    fetchJson<{ ok: boolean }>(`/communities/${name}/bans/${actorId}`, { method: 'DELETE' }),

  // Posts
  getPosts: (name: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    if (params?.sort) query.set('sort', params.sort);
    const queryStr = query.toString();
    return fetchJson<PaginatedCommunityPosts>(`/communities/${name}/posts${queryStr ? '?' + queryStr : ''}`);
  },
  getPendingPosts: (name: string, limit = 20) =>
    fetchJson<{ posts: CommunityPost[] }>(`/communities/${name}/posts/pending?limit=${limit}`),
  submitPost: (name: string, postId: string) =>
    fetchJson<{ ok: boolean; status: 'pending' | 'approved'; requires_approval: boolean }>(`/communities/${name}/posts`, {
      method: 'POST',
      body: JSON.stringify({ post_id: postId }),
    }),
  suggestPost: (name: string, postId: string) =>
    fetchJson<{ ok: boolean; status: 'pending' }>(`/communities/${name}/suggest/${postId}`, {
      method: 'POST',
    }),
  approvePost: (name: string, postId: string) =>
    fetchJson<{ ok: boolean; status: 'approved' }>(`/communities/${name}/posts/${postId}/approve`, { method: 'POST' }),
  rejectPost: (name: string, postId: string) =>
    fetchJson<{ ok: boolean; status: 'rejected' }>(`/communities/${name}/posts/${postId}/reject`, { method: 'POST' }),
  deletePost: (name: string, postId: string) =>
    fetchJson<{ ok: boolean; deleted_count: number }>(`/communities/${name}/posts/${postId}`, { method: 'DELETE' }),
  unboostPost: (name: string, postId: string) =>
    fetchJson<{ ok: boolean }>(`/communities/${name}/posts/${postId}/unboost`, { method: 'POST' }),
  getPinnedPosts: (name: string) =>
    fetchJson<{ posts: CommunityPost[] }>(`/communities/${name}/posts/pinned`),
  pinPost: (name: string, postId: string) =>
    fetchJson<{ ok: boolean; pinned: boolean }>(`/communities/${name}/posts/${postId}/pin`, { method: 'POST' }),
  unpinPost: (name: string, postId: string) =>
    fetchJson<{ ok: boolean; pinned: boolean }>(`/communities/${name}/posts/${postId}/pin`, { method: 'DELETE' }),
  getModLogs: (name: string, options?: { limit?: number; before?: number }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.before) params.set('before', options.before.toString());
    const queryStr = params.toString();
    return fetchJson<{ logs: ModLogEntry[]; next_cursor: number | null }>(
      `/communities/${name}/mod-logs${queryStr ? '?' + queryStr : ''}`
    );
  },
};

export interface ModLogEntry {
  id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
  actor: Actor | null;
}
