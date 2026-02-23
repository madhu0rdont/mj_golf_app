import { RouterProvider } from 'react-router';
import { SettingsProvider } from './context/SettingsContext';
import { router } from './router';

export default function App() {
  return (
    <SettingsProvider>
      <RouterProvider router={router} />
    </SettingsProvider>
  );
}
