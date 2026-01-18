const API_BASE = '/api';

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Actor {
  id: number;
  uri: string;
  handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  url: string | null;
  is_local: boolean;
  created_at: string;
}

export interface Post {
  id: number;
  uri: string;
  content: string;
  url: string | null;
  created_at: string;
  author: Actor | null;
  hashtags: string[];
  likes_count: number;
  liked: boolean;
  replies_count: number;
  in_reply_to: {
    id: number;
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
};

// Users
export const users = {
  get: (username: string) =>
    fetchJson<{
      actor: Actor;
      stats: { followers: number; following: number };
      is_following: boolean;
      is_own_profile: boolean;
    }>(`/users/${username}`),
  getPosts: (username: string) =>
    fetchJson<{ posts: Post[] }>(`/users/${username}/posts`),
  getReplies: (username: string) =>
    fetchJson<{ posts: Post[] }>(`/users/${username}/posts?filter=replies`),
  getFollowers: (username: string) =>
    fetchJson<{ followers: Actor[] }>(`/users/${username}/followers`),
  getFollowing: (username: string) =>
    fetchJson<{ following: Actor[] }>(`/users/${username}/following`),
};

// Actors (works for both local and remote)
export const actors = {
  get: (actorId: number) =>
    fetchJson<{ actor: Actor; is_following: boolean; is_own_profile: boolean }>(`/actors/${actorId}`),
  getPosts: (actorId: number) =>
    fetchJson<{ posts: Post[] }>(`/actors/${actorId}/posts`),
  getReplies: (actorId: number) =>
    fetchJson<{ posts: Post[] }>(`/actors/${actorId}/posts?filter=replies`),
};

// Posts
export const posts = {
  getTimeline: (timeline: 'public' | 'home' = 'public') =>
    fetchJson<{ posts: Post[] }>(`/posts?timeline=${timeline}`),
  get: (id: number) => fetchJson<{ post: Post }>(`/posts/${id}`),
  getReplies: (id: number) => fetchJson<{ replies: Post[] }>(`/posts/${id}/replies`),
  create: (content: string, inReplyTo?: number) =>
    fetchJson<{ post: Post }>('/posts', {
      method: 'POST',
      body: JSON.stringify({ content, in_reply_to: inReplyTo }),
    }),
  delete: (id: number) =>
    fetchJson<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
  like: (id: number) =>
    fetchJson<{ ok: boolean; likes_count: number; liked: boolean }>(`/posts/${id}/like`, {
      method: 'POST',
    }),
  unlike: (id: number) =>
    fetchJson<{ ok: boolean; likes_count: number; liked: boolean }>(`/posts/${id}/like`, {
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
  unfollow: (actorId: number) =>
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
  get: (tag: string) =>
    fetchJson<{ tag: string; posts: Post[] }>(`/tags/${encodeURIComponent(tag)}`),
};
