import { useState, useEffect } from 'react';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';

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
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-4">
        <i className="bi bi-fire text-danger me-2"></i>
        Hot Posts
      </h4>

      {postList.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-fire fs-1 mb-3 d-block"></i>
          <p>No hot posts yet. Start interacting with posts!</p>
        </div>
      ) : (
        postList.map((post) => (
          <PostCard key={post.id} post={post} />
        ))
      )}
    </div>
  );
}
