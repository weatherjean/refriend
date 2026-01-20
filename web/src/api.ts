const API_BASE = '/api';

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
  in_reply_to: {
    id: string;  // UUID
    uri: string;
    content: string;
    url: string | null;
    created_at: string;
    author: Actor | null;
  } | null;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
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
  login: (username: string, password: string) =>
    fetchJson<{ user: User; actor: Actor }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string) =>
    fetchJson<{ user: User; actor: Actor }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => fetchJson<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    fetchJson<{ ok: boolean }>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
};

// Pagination params
export interface PaginationParams {
  limit?: number;
  before?: number;
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
  get: (username: string) =>
    fetchJson<{
      actor: Actor;
      stats: { followers: number; following: number };
      is_following: boolean;
      is_own_profile: boolean;
    }>(`/users/${username}`),
  getPosts: (username: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    const queryStr = query.toString();
    return fetchJson<PaginatedPosts>(`/users/${username}/posts${queryStr ? '?' + queryStr : ''}`);
  },
  getReplies: (username: string, params?: PaginationParams) => {
    const query = new URLSearchParams({ filter: 'replies' });
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    return fetchJson<PaginatedPosts>(`/users/${username}/posts?${query}`);
  },
  getPinned: (username: string) =>
    fetchJson<{ posts: Post[] }>(`/users/${username}/pinned`),
  getBoosts: (username: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    const queryStr = query.toString();
    return fetchJson<PaginatedPosts>(`/users/${username}/boosts${queryStr ? '?' + queryStr : ''}`);
  },
  getFollowers: (username: string) =>
    fetchJson<{ followers: Actor[] }>(`/users/${username}/followers`),
  getFollowing: (username: string) =>
    fetchJson<{ following: Actor[] }>(`/users/${username}/following`),
};

// Actors (works for both local and remote)
export const actors = {
  get: (actorId: string) =>
    fetchJson<{ actor: Actor; is_following: boolean; is_own_profile: boolean }>(`/actors/${actorId}`),
  getPosts: (actorId: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    const queryStr = query.toString();
    return fetchJson<PaginatedPosts>(`/actors/${actorId}/posts${queryStr ? '?' + queryStr : ''}`);
  },
  getReplies: (actorId: string, params?: PaginationParams) => {
    const query = new URLSearchParams({ filter: 'replies' });
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    return fetchJson<PaginatedPosts>(`/actors/${actorId}/posts?${query}`);
  },
  getPinned: (actorId: string) =>
    fetchJson<{ posts: Post[] }>(`/actors/${actorId}/pinned`),
  getBoosts: (actorId: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
    const queryStr = query.toString();
    return fetchJson<PaginatedPosts>(`/actors/${actorId}/boosts${queryStr ? '?' + queryStr : ''}`);
  },
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
  getReplies: (id: string) => fetchJson<{ replies: Post[] }>(`/posts/${id}/replies`),
  create: (content: string, inReplyTo?: string, attachments?: AttachmentInput[], sensitive?: boolean) =>
    fetchJson<{ post: Post }>('/posts', {
      method: 'POST',
      body: JSON.stringify({ content, in_reply_to: inReplyTo, attachments, sensitive }),
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
  query: (q: string) =>
    fetchJson<{ results: Actor[] }>(`/search?q=${encodeURIComponent(q)}`),
};

// Tags
export const tags = {
  get: (tag: string, params?: PaginationParams) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before.toString());
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
