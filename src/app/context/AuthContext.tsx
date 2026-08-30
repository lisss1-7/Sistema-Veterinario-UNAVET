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
  updateUser: (updates: Partial<User>) => void;
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

  const updateUser = (updates: Partial<User>) => {
    setUser((currentUser) => {
      if (!currentUser) return currentUser;

      const updatedUser = {
        ...currentUser,
        ...updates,
      };

      localStorage.setItem('unavet_user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  };

  useEffect(() => {
    const token =
      localStorage.getItem('unavet_token') || localStorage.getItem('token');

    if (!user || !token) {
      setIsSessionReady(true);
      return;
    }

    let disposed = false;
    const controller = new AbortController();

    void Promise.all([
      fetch(`${API_URL}/catalogos/mis-modulos`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }),
      fetch(`${API_URL}/perfil/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }),
    ])
      .then(async ([sessionResponse, profileResponse]) => {
        if (
          sessionResponse.status === 401 ||
          sessionResponse.status === 403 ||
          profileResponse.status === 401 ||
          profileResponse.status === 403
        ) {
          clearStoredSession();
          if (!disposed) setUser(null);
          return;
        }

        if (!sessionResponse.ok) {
          throw new Error('No fue posible validar la sesión con el servidor.');
        }

        if (!profileResponse.ok) {
          throw new Error('No fue posible actualizar los datos de la sesión.');
        }

        const refreshedUser = (await profileResponse.json()) as User;

        if (!disposed) updateUser(refreshedUser);
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
        updateUser,
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
