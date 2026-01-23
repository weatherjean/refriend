import { ReactNode } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

interface TabContentProps {
  loading?: boolean;
  empty?: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  children: ReactNode;
}

export function TabContent({
  loading = false,
  empty = false,
  emptyIcon = 'inbox',
  emptyTitle = 'Nothing here yet.',
  emptyDescription,
  children,
}: TabContentProps) {
  if (loading) {
    return <LoadingSpinner />;
  }

  if (empty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return <>{children}</>;
}
