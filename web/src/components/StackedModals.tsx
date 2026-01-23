import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useModalStack } from '../context/ModalStackContext';
import { modalRoutes } from '../App';

export function StackedModals() {
  const { stack, goBack, goHome } = useModalStack();

  // Prevent body scroll when any modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <>
      {stack.map((entry, index) => {
        const isTop = index === stack.length - 1;
        // Parse the path to create a location object
        const [pathname, search = ''] = entry.path.split('?');
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
              </div>
              <div className="page-modal-content">
                <Routes location={location}>
                  {modalRoutes.map(route => (
                    <Route key={route.path} path={route.path} element={route.element} />
                  ))}
                </Routes>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
