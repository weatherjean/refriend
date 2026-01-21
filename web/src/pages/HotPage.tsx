import { useState, useEffect } from 'react';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';

export function HotPage() {
  const [postList, setPostList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true);
      try {
        const { posts } = await postsApi.getHot(20);
        setPostList(posts);
      } catch (err) {
        console.error('Failed to load hot posts:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <h4 className="mb-4">
        <i className="bi bi-fire text-danger me-2"></i>
        Hot Posts
      </h4>

      {postList.length === 0 ? (
        <EmptyState icon="fire" title="No hot posts yet." description="Start interacting with posts!" />
      ) : (
        postList.map((post) => (
          <PostCard key={post.id} post={post} />
        ))
      )}
    </div>
  );
}
