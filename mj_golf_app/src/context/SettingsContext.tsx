import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Handedness = 'left' | 'right';

interface SettingsContextType {
  apiKey: string;
  setApiKey: (key: string) => void;
  units: 'yards' | 'meters';
  setUnits: (units: 'yards' | 'meters') => void;
  handedness: Handedness;
  setHandedness: (h: Handedness) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const API_KEY_STORAGE_KEY = 'mj-golf-claude-api-key';
const UNITS_STORAGE_KEY = 'mj-golf-units';
const HANDEDNESS_STORAGE_KEY = 'mj-golf-handedness';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState(
    () => localStorage.getItem(API_KEY_STORAGE_KEY) || import.meta.env.VITE_CLAUDE_API_KEY || ''
  );
  const [units, setUnitsState] = useState<'yards' | 'meters'>(
    () => (localStorage.getItem(UNITS_STORAGE_KEY) as 'yards' | 'meters') || 'yards'
  );
  const [handedness, setHandednessState] = useState<Handedness>(
    () => (localStorage.getItem(HANDEDNESS_STORAGE_KEY) as Handedness) || 'left'
  );

  const setApiKey = useCallback((key: string) => {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    setApiKeyState(key);
  }, []);

  const setUnits = useCallback((u: 'yards' | 'meters') => {
    localStorage.setItem(UNITS_STORAGE_KEY, u);
    setUnitsState(u);
  }, []);

  const setHandedness = useCallback((h: Handedness) => {
    localStorage.setItem(HANDEDNESS_STORAGE_KEY, h);
    setHandednessState(h);
  }, []);

  return (
    <SettingsContext.Provider value={{ apiKey, setApiKey, units, setUnits, handedness, setHandedness }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
