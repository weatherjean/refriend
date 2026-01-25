import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, User, Actor, setCsrfToken } from '../api';

interface AuthContextType {
  user: User | null;
  actor: Actor | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActor: (actor: Actor) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth.me()
      .then(({ user, actor, csrfToken }) => {
        setUser(user);
        setActor(actor);
        if (csrfToken) {
          setCsrfToken(csrfToken);
        }
      })
      .catch(() => {
        setUser(null);
        setActor(null);
        setCsrfToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { user, actor, csrfToken } = await auth.login(email, password);
    setCsrfToken(csrfToken);
    setUser(user);
    setActor(actor);
  };

  const register = async (username: string, email: string, password: string) => {
    const { user, actor, csrfToken } = await auth.register(username, email, password);
    setCsrfToken(csrfToken);
    setUser(user);
    setActor(actor);
  };

  const logout = async () => {
    await auth.logout();
    setCsrfToken(null);
    setUser(null);
    setActor(null);
  };

  return (
    <AuthContext.Provider value={{ user, actor, loading, login, register, logout, setActor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
