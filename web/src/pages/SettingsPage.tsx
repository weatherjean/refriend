import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ProfileSettingsTab } from '../components/ProfileSettingsTab';

export function SettingsPage() {
  const { user, actor, logout, setActor } = useAuth();
  const navigate = useNavigate();

  if (!user || !actor) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="py-4">
      <h4 className="mb-4">Settings</h4>
      <ProfileSettingsTab
        actor={actor}
        onUpdate={(updated) => setActor(updated)}
        onLogout={async () => {
          await logout();
          navigate('/');
        }}
      />
    </div>
  );
}
