import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface StackEntry {
  path: string;
  key: string; // Unique key for each visit
}

interface ModalStackContextType {
  stack: StackEntry[];
  currentKey: string | null;
  goBack: () => void;
  goHome: () => void;
}

const ModalStackContext = createContext<ModalStackContextType>({
  stack: [],
  currentKey: null,
  goBack: () => {},
  goHome: () => {},
});

let entryCounter = 0;

export function ModalStackProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [stack, setStack] = useState<StackEntry[]>([]);
  const isNavigatingBack = useRef(false);
  const currentPath = location.pathname + location.search;

  useEffect(() => {
    if (currentPath === '/') {
      // Going home clears the stack
      setStack([]);
      return;
    }

    if (isNavigatingBack.current) {
      // We're going back - pop from stack
      isNavigatingBack.current = false;
      setStack(prev => prev.slice(0, -1));
    } else {
      // Forward navigation - push to stack
      setStack(prev => {
        const topEntry = prev[prev.length - 1];
        // Avoid duplicate if we're already at this path (e.g., same link clicked twice)
        if (topEntry?.path === currentPath) {
          return prev;
        }
        return [...prev, { path: currentPath, key: `modal-${++entryCounter}` }];
      });
    }
  }, [currentPath]);

  const goBack = () => {
    if (stack.length > 1) {
      isNavigatingBack.current = true;
      navigate(stack[stack.length - 2].path);
    } else {
      // Only one item, go home
      navigate('/');
    }
  };

  const goHome = () => {
    navigate('/');
  };

  const currentKey = stack[stack.length - 1]?.key ?? null;

  return (
    <ModalStackContext.Provider value={{ stack, currentKey, goBack, goHome }}>
      {children}
    </ModalStackContext.Provider>
  );
}

export function useModalStack() {
  return useContext(ModalStackContext);
}
