import { useState, useCallback } from 'react';
import { posts as postsApi, Post } from '../api';
import { useAuth } from '../context/AuthContext';

type ActionType = 'like' | 'boost' | 'pin';

interface UsePostActionResult {
  active: boolean;
  count: number;
  loading: boolean;
  disabled: boolean;
  toggle: (e: React.MouseEvent) => Promise<void>;
}

interface UsePostActionOptions {
  post: Post;
  actionType: ActionType;
  isOwnPost: boolean;
}

export function usePostAction({ post, actionType, isOwnPost }: UsePostActionOptions): UsePostActionResult {
  const { user } = useAuth();

  // Initialize state based on action type
  const getInitialState = () => {
    switch (actionType) {
      case 'like':
        return { active: post.liked ?? false, count: post.likes_count ?? 0 };
      case 'boost':
        return { active: post.boosted ?? false, count: post.boosts_count ?? 0 };
      case 'pin':
        return { active: post.pinned ?? false, count: 0 };
    }
  };

  const initialState = getInitialState();
  const [active, setActive] = useState(initialState.active);
  const [count, setCount] = useState(initialState.count);
  const [loading, setLoading] = useState(false);

  // Determine if action is disabled
  const getDisabled = () => {
    if (!user || loading) return true;
    switch (actionType) {
      case 'like':
        return false;
      case 'boost':
        return isOwnPost; // Can't boost own posts
      case 'pin':
        return !isOwnPost; // Can only pin own posts
    }
  };

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || loading) return;

    // Check specific restrictions
    if (actionType === 'boost' && isOwnPost) return;
    if (actionType === 'pin' && !isOwnPost) return;

    setLoading(true);
    try {
      switch (actionType) {
        case 'like': {
          if (active) {
            const result = await postsApi.unlike(post.id);
            setActive(result.liked);
            setCount(result.likes_count);
          } else {
            const result = await postsApi.like(post.id);
            setActive(result.liked);
            setCount(result.likes_count);
          }
          break;
        }
        case 'boost': {
          if (active) {
            const result = await postsApi.unboost(post.id);
            setActive(result.boosted);
            setCount(result.boosts_count);
          } else {
            const result = await postsApi.boost(post.id);
            setActive(result.boosted);
            setCount(result.boosts_count);
          }
          break;
        }
        case 'pin': {
          if (active) {
            const result = await postsApi.unpin(post.id);
            setActive(result.pinned);
          } else {
            const result = await postsApi.pin(post.id);
            setActive(result.pinned);
          }
          break;
        }
      }
    } catch {
      // Error handled by global toast
    } finally {
      setLoading(false);
    }
  }, [user, loading, active, post.id, actionType, isOwnPost]);

  return {
    active,
    count,
    loading,
    disabled: getDisabled(),
    toggle,
  };
}
