import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
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
import { FeedsExplorePage } from './pages/FeedsExplorePage';
import { CreateFeedPage } from './pages/CreateFeedPage';
import { FeedPage } from './pages/FeedPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { useAuth } from './context/AuthContext';

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

const routeConfig = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },
  { path: '/search', element: <SearchPage /> },
  { path: '/explore', element: <ExplorePage /> },
  { path: '/notifications', element: <NotificationsPage /> },
  { path: '/new', element: <NewPostPage /> },
  { path: '/posts/:id', element: <PostPage /> },
  { path: '/a/:handle/posts/:id', element: <PostPage /> },
  { path: '/a/:handle/*', element: <ActorPage /> },
  { path: '/actor/:id', element: <ActorByIdPage /> },
  { path: '/tags/:tag', element: <TagPage /> },
  { path: '/feeds/new', element: <CreateFeedPage /> },
  { path: '/feeds/:slug', element: <FeedPage /> },
  { path: '/feeds', element: <FeedsExplorePage /> },
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

interface StackEntry {
  path: string;
  key: string;
}

let entryCounter = 0;
function nextKey() {
  return `page-${++entryCounter}`;
}

function StackedPage({ goBack, goHome, loc, isTop }: {
  goBack: () => void;
  goHome: () => void;
  loc: { pathname: string; search: string; hash: string; state: null; key: string };
  isTop: boolean;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const onScroll = () => setScrolled(slot.scrollTop > 180);
    slot.addEventListener('scroll', onScroll, { passive: true });
    return () => slot.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={slotRef} className={`page-slot ${isTop ? '' : 'page-slot-hidden'}`}>
      <div className={`page-nav page-nav-glass${scrolled ? ' visible' : ''}`}>
        <button className="page-nav-btn" onClick={goBack} aria-label="Back" title="Back">
          <i className="bi bi-arrow-left"></i>
        </button>
        <button className="page-nav-btn" onClick={goHome} aria-label="Home" title="Home">
          <i className="bi bi-house-fill"></i>
        </button>
        <img src="/icon.svg" alt="riff" height="24" className="ms-auto" style={{ opacity: 0.6 }} />
      </div>
      <div className="page-nav-static mt-3 mb-3">
        <button className="page-nav-btn" onClick={goBack} aria-label="Back" title="Back">
          <i className="bi bi-arrow-left"></i>
        </button>
        <button className="page-nav-btn" onClick={goHome} aria-label="Home" title="Home">
          <i className="bi bi-house-fill"></i>
        </button>
      </div>
      <Routes location={loc}>
        {routeConfig.map(route => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Routes>
    </div>
  );
}

function PageStack() {
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const currentPath = location.pathname + location.search;

  // Initialize stack with current path if landing on a non-home URL
  const [stack, setStack] = useState<StackEntry[]>(() => {
    if (currentPath === '/') return [];
    return [{ path: currentPath, key: nextKey() }];
  });
  const prevPath = useRef(currentPath);

  useEffect(() => {
    if (prevPath.current === currentPath) return;
    prevPath.current = currentPath;

    if (currentPath === '/') {
      setStack([]);
      return;
    }

    if (navType === 'POP') {
      // Find the entry matching the current path (handles multi-level back)
      setStack(prev => {
        const idx = prev.findIndex(e => e.path === currentPath);
        if (idx >= 0) return prev.slice(0, idx + 1);
        // Path not in stack (e.g. direct URL navigation) — replace with single entry
        return [{ path: currentPath, key: nextKey() }];
      });
    } else {
      const key = nextKey();
      setStack(prev => {
        const top = prev[prev.length - 1];
        if (top?.path === currentPath) return prev;
        return [...prev, { path: currentPath, key }];
      });
    }
  }, [currentPath, navType]);

  const goBack = () => {
    if (stack.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const goHome = () => {
    navigate('/');
  };

  const isHome = currentPath === '/';

  return (
    <>
      {/* Home — always mounted, each page-slot scrolls independently */}
      <div className={`page-slot ${isHome ? '' : 'page-slot-hidden'}`}>
        <HomePage />
      </div>

      {/* Stacked pages */}
      {stack.map((entry, index) => {
        const isTop = index === stack.length - 1 && !isHome;
        let pathname = entry.path.split('?')[0];
        const search = entry.path.includes('?') ? `?${entry.path.split('?')[1]}` : '';
        const postMatch = pathname.match(/^\/a\/[^/]+\/posts\/(.+)$/);
        if (postMatch) {
          pathname = `/posts/${postMatch[1]}`;
        }
        const loc = { pathname, search, hash: '', state: null, key: entry.key };

        return (
          <StackedPage key={entry.key} goBack={goBack} goHome={goHome} loc={loc} isTop={isTop} />
        );
      })}
    </>
  );
}

function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  return (
    <Layout>
      <PageStack />
    </Layout>
  );
}

export default App;
