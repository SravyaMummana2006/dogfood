import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../services/api';

export interface User {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('dogfood_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const response = await api.get<{ data: User }>('/auth/me');
        setUser(response.data);
      } catch (error) {
        // Token might be expired or invalid
        setToken(null);
        setUser(null);
        localStorage.removeItem('dogfood_token');
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    // Note: Storing tokens in localStorage is a development trade-off. 
    // In strict production, HTTP-only cookies are safer against XSS.
    localStorage.setItem('dogfood_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    try {
      if (token) {
        await api.post('/auth/logout');
      }
    } catch (e) {
      console.error('Logout error ignored');
    } finally {
      localStorage.removeItem('dogfood_token');
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
