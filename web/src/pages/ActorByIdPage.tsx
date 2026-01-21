import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { actors } from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function ActorByIdPage() {
  const { id } = useParams<{ id: string }>();
  const [handle, setHandle] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;

    actors.get(id)
      .then(({ actor }) => setHandle(actor.handle))
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">Actor not found</p>
      </div>
    );
  }

  if (!handle) {
    return <LoadingSpinner />;
  }

  return <Navigate to={`/u/${handle}`} replace />;
}
