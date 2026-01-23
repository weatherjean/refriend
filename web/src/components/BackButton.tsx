import { useNavigate } from 'react-router-dom';
import { useNavigation } from '../context/NavigationContext';

interface BackButtonProps {
  className?: string;
}

export function BackButton({ className = '' }: BackButtonProps) {
  const navigate = useNavigate();
  const { canGoBack } = useNavigation();

  // Don't render if there's no internal navigation history
  if (!canGoBack) {
    return null;
  }

  return (
    <button
      type="button"
      className={`btn btn-link text-muted p-0 ${className}`}
      onClick={() => navigate(-1)}
    >
      <i className="bi bi-arrow-left me-1"></i>
      Back
    </button>
  );
}
