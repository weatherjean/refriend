import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { users } from '../api';

export function AtRedirectPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    async function resolve() {
      if (!username) {
        navigate('/', { replace: true });
        return;
      }
      try {
        const data = await users.get(username, { silent: true });
        if (data.actor.actor_type === 'Group') {
          navigate(`/c/${username}`, { replace: true });
        } else {
          navigate(`/u/@${username}@${window.location.host}`, { replace: true });
        }
      } catch {
        navigate('/', { replace: true }); // Not found, go home
      }
    }
    resolve();
  }, [username, navigate]);

  return (
    <div className="d-flex justify-content-center py-5">
      <div className="spinner-border"></div>
    </div>
  );
}
