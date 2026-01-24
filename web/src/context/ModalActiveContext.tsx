import { createContext, useContext, ReactNode } from 'react';

interface ModalActiveContextType {
  isActive: boolean;
}

const ModalActiveContext = createContext<ModalActiveContextType>({
  isActive: true, // Default to true for non-modal contexts (e.g., home feed)
});

export function ModalActiveProvider({ isActive, children }: { isActive: boolean; children: ReactNode }) {
  return (
    <ModalActiveContext.Provider value={{ isActive }}>
      {children}
    </ModalActiveContext.Provider>
  );
}

export function useModalActive() {
  return useContext(ModalActiveContext);
}
