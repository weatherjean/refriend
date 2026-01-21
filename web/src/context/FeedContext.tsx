import { createContext, useContext, useState, ReactNode } from 'react';

type FeedType = 'new' | 'hot';

interface FeedContextType {
  feedType: FeedType;
  setFeedType: (type: FeedType) => void;
}

const FeedContext = createContext<FeedContextType | null>(null);

export function FeedProvider({ children }: { children: ReactNode }) {
  const [feedType, setFeedType] = useState<FeedType>(() => {
    const saved = localStorage.getItem('feedType');
    return (saved === 'hot' ? 'hot' : 'new') as FeedType;
  });

  const updateFeedType = (type: FeedType) => {
    setFeedType(type);
    localStorage.setItem('feedType', type);
  };

  return (
    <FeedContext.Provider value={{ feedType, setFeedType: updateFeedType }}>
      {children}
    </FeedContext.Provider>
  );
}

export function useFeed() {
  const context = useContext(FeedContext);
  if (!context) {
    throw new Error('useFeed must be used within a FeedProvider');
  }
  return context;
}
