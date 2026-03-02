import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Handedness = 'left' | 'right';

interface SettingsContextType {
  handedness: Handedness;
  setHandedness: (h: Handedness) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const HANDEDNESS_STORAGE_KEY = 'mj-golf-handedness';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [handedness, setHandednessState] = useState<Handedness>(
    () => (localStorage.getItem(HANDEDNESS_STORAGE_KEY) as Handedness) || 'left'
  );

  const setHandedness = useCallback((h: Handedness) => {
    localStorage.setItem(HANDEDNESS_STORAGE_KEY, h);
    setHandednessState(h);
  }, []);

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
