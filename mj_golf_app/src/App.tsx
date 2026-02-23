import { RouterProvider } from 'react-router';
import { SettingsProvider } from './context/SettingsContext';
import { router } from './router';
import { useEffect } from 'react';
import { seedDefaultBag, seedSimulatorData, reclassifyShotsLeftHanded } from './db/seed';

export default function App() {
  useEffect(() => {
    seedDefaultBag()
      .then(() => seedSimulatorData())
      .then(() => reclassifyShotsLeftHanded());
  }, []);

  return (
    <SettingsProvider>
      <RouterProvider router={router} />
    </SettingsProvider>
  );
}
