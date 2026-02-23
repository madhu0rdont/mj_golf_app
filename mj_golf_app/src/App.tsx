import { RouterProvider } from 'react-router';
import { SettingsProvider } from './context/SettingsContext';
import { router } from './router';
import { useEffect } from 'react';
import { seedDefaultBag, seedSimulatorData } from './db/seed';

export default function App() {
  useEffect(() => {
    seedDefaultBag().then(() => seedSimulatorData());
  }, []);

  return (
    <SettingsProvider>
      <RouterProvider router={router} />
    </SettingsProvider>
  );
}
