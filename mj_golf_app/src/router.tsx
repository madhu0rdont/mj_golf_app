import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';
import { ClubBagPage } from './pages/ClubBagPage';
import { ClubEditPage } from './pages/ClubEditPage';
import { SessionNewPage } from './pages/SessionNewPage';
import { SessionPhotoPage } from './pages/SessionPhotoPage';
import { SessionManualPage } from './pages/SessionManualPage';
import { SessionCsvPage } from './pages/SessionCsvPage';
import { SessionSummaryPage } from './pages/SessionSummaryPage';
import { SessionsListPage } from './pages/SessionsListPage';
import { YardageBookPage } from './pages/YardageBookPage';
import { ClubDetailPage } from './pages/ClubDetailPage';
import { GappingPage } from './pages/GappingPage';
import { SettingsPage } from './pages/SettingsPage';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'bag', element: <ClubBagPage /> },
      { path: 'bag/new', element: <ClubEditPage /> },
      { path: 'bag/:clubId/edit', element: <ClubEditPage /> },
      { path: 'session/new', element: <SessionNewPage /> },
      { path: 'session/new/photo', element: <SessionPhotoPage /> },
      { path: 'session/new/manual', element: <SessionManualPage /> },
      { path: 'session/new/csv', element: <SessionCsvPage /> },
      { path: 'sessions', element: <SessionsListPage /> },
      { path: 'session/:sessionId', element: <SessionSummaryPage /> },
      { path: 'yardage', element: <YardageBookPage /> },
      { path: 'yardage/gapping', element: <GappingPage /> },
      { path: 'yardage/:clubId', element: <ClubDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
