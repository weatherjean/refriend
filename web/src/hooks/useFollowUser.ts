import { useState, useEffect, useCallback } from 'react';
import { follows, users, Actor } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getUsername } from '../utils';

// Single actor mode (for ActorPage)
interface SingleActorResult {
  isFollowing: boolean;
  loading: boolean;
  toggleFollow: () => Promise<void>;
  setIsFollowing: (value: boolean) => void;
}

export function useFollowSingleActor(
  actor: Actor | null,
  initialFollowing: boolean
): SingleActorResult {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsFollowing(initialFollowing);
  }, [initialFollowing]);

  const toggleFollow = useCallback(async () => {
    if (!actor || !user) return;

    setLoading(true);
    try {
      if (isFollowing) {
        await follows.unfollow(actor.id);
        setIsFollowing(false);
        toast.info('Unfollowed');
      } else {
        const response = await follows.follow(actor.handle);
        setIsFollowing(true);
        toast.info(response.message || 'Now following!');
      }
    } catch {
      // Error handled by global toast
    } finally {
      setLoading(false);
    }
  }, [actor, user, isFollowing, toast]);

  return { isFollowing, loading, toggleFollow, setIsFollowing };
}

// Multi-actor mode (for SearchPage)
interface MultiActorResult {
  followingSet: Set<string>;
  loadingSet: Set<string>;
  toggleActorFollow: (actor: Actor) => Promise<void>;
  initFollowingSet: () => Promise<void>;
}

export function useFollowMultiActor(): MultiActorResult {
  const { user, actor: currentActor } = useAuth();
  const { toast } = useToast();
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());

  const initFollowingSet = useCallback(async () => {
    if (!currentActor) return;
    try {
      const username = getUsername(currentActor.handle);
      const { following } = await users.getFollowing(username);
      setFollowingSet(new Set(following.map(a => a.id)));
    } catch {
      // Error handled by global toast (or silently ignore for init)
    }
  }, [currentActor]);

  const toggleActorFollow = useCallback(async (actor: Actor) => {
    if (!user) return;

    setLoadingSet(prev => new Set(prev).add(actor.id));
    try {
      const isCurrentlyFollowing = followingSet.has(actor.id);
      if (isCurrentlyFollowing) {
        await follows.unfollow(actor.id);
        setFollowingSet(prev => {
          const next = new Set(prev);
          next.delete(actor.id);
          return next;
        });
        toast.info('Unfollowed');
      } else {
        const response = await follows.follow(actor.handle);
        setFollowingSet(prev => new Set(prev).add(actor.id));
        toast.info(response.message || 'Now following!');
      }
    } catch {
      // Error handled by global toast
    } finally {
      setLoadingSet(prev => {
        const next = new Set(prev);
        next.delete(actor.id);
        return next;
      });
    }
  }, [user, followingSet, toast]);

  return { followingSet, loadingSet, toggleActorFollow, initFollowingSet };
}
