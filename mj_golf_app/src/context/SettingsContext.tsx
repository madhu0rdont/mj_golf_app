import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type Handedness = 'left' | 'right';

interface SettingsContextType {
  handedness: Handedness;
  setHandedness: (h: Handedness) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();

  const [handedness, setHandednessState] = useState<Handedness>(
    () => user?.handedness || 'left'
  );

  // Sync if user changes (e.g. on login)
  useEffect(() => {
    if (user?.handedness) {
      setHandednessState(user.handedness);
    }
  }, [user?.handedness]);

  const setHandedness = useCallback(async (h: Handedness) => {
    setHandednessState(h);
    updateUser({ handedness: h });

    // Persist to server
    try {
      await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ handedness: h }),
      });
    } catch {
      // Revert on failure
      setHandednessState(user?.handedness || 'left');
    }
  }, [updateUser, user?.handedness]);

  return (
    <SettingsContext.Provider value={{ handedness, setHandedness }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
