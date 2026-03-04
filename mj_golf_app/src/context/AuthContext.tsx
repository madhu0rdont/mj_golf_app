import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface User {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  profilePicture?: string;
  role: 'admin' | 'player';
  handedness: 'left' | 'right';
  status: 'active' | 'pending' | 'rejected';
  homeCourseId?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  needsSetup: boolean;
  user: User | null;
  isAdmin: boolean;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  setup: (data: {
    adminUsername: string;
    adminPassword: string;
    playerUsername: string;
    playerPassword: string;
    playerDisplayName?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<{ success: boolean; message?: string; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch('/api/auth/check')
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.authenticated);
        setNeedsSetup(data.needsSetup || false);
        if (data.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ identifier, password }),
    });

    if (res.ok) {
      const data = await res.json();
      setIsAuthenticated(true);
      setUser(data.user);
      return { success: true, user: data.user as User };
    }

    try {
      const data = await res.json();
      return { success: false, error: data.error || 'Login failed' };
    } catch {
      return { success: false, error: 'Login failed' };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  const setup = useCallback(async (data: {
    adminUsername: string;
    adminPassword: string;
    playerUsername: string;
    playerPassword: string;
    playerDisplayName?: string;
  }) => {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const result = await res.json();
      setIsAuthenticated(true);
      setNeedsSetup(false);
      setUser(result.user);
      return { success: true };
    }

    try {
      const result = await res.json();
      return { success: false, error: result.error || 'Setup failed' };
    } catch {
      return { success: false, error: 'Setup failed' };
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) return { success: true, message: data.message };
      return { success: false, error: data.error || 'Request failed' };
    } catch {
      return { success: false, error: 'Request failed' };
    }
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) return { success: true, message: data.message };
      return { success: false, error: data.error || 'Reset failed' };
    } catch {
      return { success: false, error: 'Reset failed' };
    }
  }, []);

  const register = useCallback(async (data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) return { success: true, message: result.message };
      return { success: false, error: result.error || 'Registration failed' };
    } catch {
      return { success: false, error: 'Registration failed' };
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isLoading,
      needsSetup,
      user,
      isAdmin: user?.role === 'admin',
      login,
      logout,
      updateUser,
      setup,
      forgotPassword,
      resetPassword,
      register,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
