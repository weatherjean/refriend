import { useState, useEffect } from 'react';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const { user } = useAuth();
  const [postList, setPostList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const timeline = user ? 'home' : 'public';
        const { posts } = await postsApi.getTimeline(timeline);
        setPostList(posts);
      } catch (err) {
        console.error('Failed to load posts:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, [user]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-4">
        {user ? 'Home Feed' : 'Public Timeline'}
      </h4>

      {postList.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-inbox fs-1 mb-3 d-block"></i>
          {user ? (
            <p>No posts yet. Follow some users to see posts here.</p>
          ) : (
            <p>No posts yet. Be the first to post!</p>
          )}
        </div>
      ) : (
        postList.map((post) => (
          <PostCard key={post.id} post={post} />
        ))
      )}
    </div>
  );
}
