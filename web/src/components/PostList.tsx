import { ReactNode } from 'react';
import { Post } from '../api';
import { PostCard } from './PostCard';
import { LoadMoreButton } from './LoadMoreButton';
import { EmptyState } from './EmptyState';

interface PostListProps {
  posts: Post[];
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  renderPost?: (post: Post) => ReactNode;
}

export function PostList({
  posts,
  emptyIcon = 'inbox',
  emptyTitle = 'No posts yet.',
  emptyDescription,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  renderPost,
}: PostListProps) {
  if (posts.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      {posts.map((post) =>
        renderPost ? renderPost(post) : <PostCard key={post.id} post={post} />
      )}
      {hasMore && onLoadMore && (
        <LoadMoreButton loading={loadingMore} onClick={onLoadMore} />
      )}
    </>
  );
}
