import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Page Not Found" icon="question-circle" />

      <div className="text-center py-5">
        <h1 className="display-1 text-muted mb-3">404</h1>
        <p className="lead text-secondary mb-4">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/" className="btn btn-primary">
          <i className="bi bi-house me-2"></i>
          Go Home
        </Link>
      </div>
    </div>
  );
}
