import { Routes, Route } from 'react-router-dom';
import { useModalStack } from '../context/ModalStackContext';
import { ModalActiveProvider } from '../context/ModalActiveContext';
import { useScrollLockEffect } from '../context/ScrollLockContext';
import { modalRoutes } from '../App';

export function StackedModals() {
  const { stack, goBack, goHome } = useModalStack();

  // Prevent body scroll when any modal is open
  useScrollLockEffect('stacked-modals', stack.length > 0);

  return (
    <>
      {stack.map((entry, index) => {
        const isTop = index === stack.length - 1;
        // Parse the path to create a location object
        const [rawPathname, search = ''] = entry.path.split('?');
        // Rewrite /@username → /u/@username and /@username/posts/id → /posts/id
        // so React Router can match them (it doesn't support literal @ in patterns)
        let pathname = rawPathname;
        const postMatch = rawPathname.match(/^\/@[^/]+\/posts\/(.+)$/);
        if (postMatch) {
          pathname = `/posts/${postMatch[1]}`;
        } else if (/^\/@[^/]+/.test(rawPathname)) {
          pathname = `/u/${rawPathname.slice(1)}`;
        }
        const location = { pathname, search: search ? `?${search}` : '', hash: '', state: null, key: entry.key };

        return (
          <div
            key={entry.key}
            className="page-modal-backdrop"
            style={{ display: isTop ? undefined : 'none' }}
          >
            <div className="page-modal-container">
              <div className="page-modal-header">
                <button
                  className="page-modal-btn"
                  onClick={goBack}
                  aria-label="Back"
                  title="Back"
                >
                  <i className="bi bi-arrow-left"></i>
                </button>
                <button
                  className="page-modal-btn"
                  onClick={goHome}
                  aria-label="Home"
                  title="Home"
                >
                  <i className="bi bi-house-fill"></i>
                </button>
                <img src="/icon.svg" alt="" className="page-modal-logo" />
              </div>
              <div className="page-modal-content">
                <ModalActiveProvider isActive={isTop}>
                  <Routes location={location}>
                    {modalRoutes.map(route => (
                      <Route key={route.path} path={route.path} element={route.element} />
                    ))}
                  </Routes>
                </ModalActiveProvider>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
