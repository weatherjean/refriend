import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { actors, Actor } from '../api';
import { getProfileLink } from '../utils';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function ActorByIdPage() {
  const { id } = useParams<{ id: string }>();
  const [actor, setActor] = useState<Actor | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;

    actors.get(id)
      .then(({ actor }) => setActor(actor))
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">Actor not found</p>
      </div>
    );
  }

  if (!actor) {
    return <LoadingSpinner />;
  }

  return <Navigate to={getProfileLink(actor)} replace />;
}
