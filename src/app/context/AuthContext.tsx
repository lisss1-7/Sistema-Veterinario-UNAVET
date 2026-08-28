import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { UserRole } from '../config/roles';

export type { UserRole };

export interface User {
  id: number;
  email: string;
  firstName: string;
  middleName?: string;
  firstSurname: string;
  secondSurname?: string;
  name: string;
  role: UserRole;
  phone?: string;
  specialty?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isSessionReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = '/api';

const clearStoredSession = () => {
  localStorage.removeItem('unavet_user');
  localStorage.removeItem('unavet_token');
  localStorage.removeItem('token');
};

const getStoredUser = (): User | null => {
  const savedUser = localStorage.getItem('unavet_user');
  const savedToken =
    localStorage.getItem('unavet_token') || localStorage.getItem('token');

  if (!savedUser || !savedToken) {
    clearStoredSession();
    return null;
  }

  try {
    return JSON.parse(savedUser) as User;
  } catch (error) {
    console.error('No fue posible restaurar la sesión guardada:', error);
    clearStoredSession();
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isSessionReady, setIsSessionReady] = useState(false);

  useEffect(() => {
    const token =
      localStorage.getItem('unavet_token') || localStorage.getItem('token');

    if (!user || !token) {
      setIsSessionReady(true);
      return;
    }

    let disposed = false;
    const controller = new AbortController();

    void fetch(`${API_URL}/catalogos/mis-modulos`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 401 || response.status === 403) {
          clearStoredSession();
          if (!disposed) setUser(null);
          return;
        }

        if (!response.ok) {
          throw new Error('No fue posible validar la sesión con el servidor.');
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('La sesión no pudo validarse temporalmente:', error);
      })
      .finally(() => {
        if (!disposed) setIsSessionReady(true);
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          correo: email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Error de login:', data.message);
        return false;
      }

      setUser(data.user);

      localStorage.setItem('unavet_user', JSON.stringify(data.user));
      localStorage.setItem('unavet_token', data.token);
      localStorage.removeItem('token');
      setIsSessionReady(true);

      return true;
    } catch (error) {
      console.error('Error al conectar con el backend:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    clearStoredSession();
    setIsSessionReady(true);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isSessionReady,
      }}
    >
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
