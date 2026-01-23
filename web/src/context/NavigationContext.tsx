import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface NavigationContextType {
  canGoBack: boolean;
}

const NavigationContext = createContext<NavigationContextType>({ canGoBack: false });

export function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigationCount = useRef(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip the first render (initial page load)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Increment on each internal navigation
    navigationCount.current += 1;
  }, [location.pathname]);

  // Can go back if we've navigated at least once internally
  const canGoBack = navigationCount.current > 0;

  return (
    <NavigationContext.Provider value={{ canGoBack }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
