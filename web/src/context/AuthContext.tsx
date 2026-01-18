import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, User, Actor } from '../api';

interface AuthContextType {
  user: User | null;
  actor: Actor | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth.me()
      .then(({ user, actor }) => {
        setUser(user);
        setActor(actor);
      })
      .catch(() => {
        setUser(null);
        setActor(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const { user, actor } = await auth.login(username, password);
    setUser(user);
    setActor(actor);
  };

  const register = async (username: string, password: string) => {
    const { user, actor } = await auth.register(username, password);
    setUser(user);
    setActor(actor);
  };

  const logout = async () => {
    await auth.logout();
    setUser(null);
    setActor(null);
  };

  return (
    <AuthContext.Provider value={{ user, actor, loading, login, register, logout }}>
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
