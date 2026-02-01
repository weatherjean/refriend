import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { NewPostPage } from './pages/NewPostPage';
import { PostPage } from './pages/PostPage';
import { ActorPage } from './pages/ActorPage';
import { SearchPage } from './pages/SearchPage';
import { TagPage } from './pages/TagPage';
import { FollowingPage } from './pages/FollowingPage';
import { ExplorePage } from './pages/ExplorePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ActorByIdPage } from './pages/ActorByIdPage';
import { InstallPage } from './pages/InstallPage';
import { AllActivityPage } from './pages/AllActivityPage';
import { ContentPolicyPage } from './pages/ContentPolicyPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsPage } from './pages/TermsPage';
import { GuidePage } from './pages/GuidePage';
import { HotPage } from './pages/HotPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { useAuth } from './context/AuthContext';
import { StackedModals } from './components/StackedModals';
import { useModalStack } from './context/ModalStackContext';

// Route configuration for modal pages
export const modalRoutes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },
  { path: '/search', element: <SearchPage /> },
  { path: '/explore', element: <ExplorePage /> },
  { path: '/notifications', element: <NotificationsPage /> },
  { path: '/new', element: <NewPostPage /> },
  { path: '/posts/:id', element: <PostPage /> },
  { path: '/a/:handle/*', element: <ActorPage /> },
  { path: '/actor/:id', element: <ActorByIdPage /> },
  { path: '/tags/:tag', element: <TagPage /> },
  { path: '/following', element: <FollowingPage /> },
  { path: '/install', element: <InstallPage /> },
  { path: '/guide', element: <GuidePage /> },
  { path: '/hot', element: <HotPage /> },
  { path: '/all', element: <AllActivityPage /> },
  { path: '/policy', element: <ContentPolicyPage /> },
  { path: '/privacy', element: <PrivacyPolicyPage /> },
  { path: '/terms', element: <TermsPage /> },
  { path: '*', element: <NotFoundPage /> },
];

function App() {
  const { loading } = useAuth();
  const { stack } = useModalStack();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  return (
    <Layout>
      {/* Home feed - ALWAYS rendered */}
      <HomePage />

      {/* Stacked modals - each visited page stays mounted */}
      {stack.length > 0 && <StackedModals />}
    </Layout>
  );
}

export default App;
