import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { HomePage } from './pages/HomePage';
import { ClubBagPage } from './pages/ClubBagPage';
import { ClubEditPage } from './pages/ClubEditPage';
import { SessionNewPage } from './pages/SessionNewPage';
import { SessionPhotoPage } from './pages/SessionPhotoPage';
import { SessionManualPage } from './pages/SessionManualPage';
import { SessionCsvPage } from './pages/SessionCsvPage';
import { WedgePracticePage } from './pages/WedgePracticePage';
import { InterleavedPracticePage } from './pages/InterleavedPracticePage';
import { SessionSummaryPage } from './pages/SessionSummaryPage';
import { SessionsListPage } from './pages/SessionsListPage';
import { YardageBookPage } from './pages/YardageBookPage';
import { ClubDetailPage } from './pages/ClubDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { AdminPage } from './pages/AdminPage';
import { PlayPage } from './pages/PlayPage';
import { PracticePage } from './pages/PracticePage';
import { StrategyPlannerPage } from './pages/StrategyPlannerPage';

export const router = createBrowserRouter([
  {
    element: <ErrorBoundary><AppShell /></ErrorBoundary>,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'play', element: <PlayPage /> },
      { path: 'practice', element: <PracticePage /> },
      { path: 'bag', element: <ClubBagPage /> },
      { path: 'bag/new', element: <ClubEditPage /> },
      { path: 'bag/:clubId/edit', element: <ClubEditPage /> },
      { path: 'session/new', element: <SessionNewPage /> },
      { path: 'session/new/photo', element: <SessionPhotoPage /> },
      { path: 'session/new/manual', element: <SessionManualPage /> },
      { path: 'session/new/csv', element: <SessionCsvPage /> },
      { path: 'session/new/wedge-practice', element: <WedgePracticePage /> },
      { path: 'session/new/interleaved', element: <InterleavedPracticePage /> },
      { path: 'sessions', element: <SessionsListPage /> },
      { path: 'session/:sessionId', element: <SessionSummaryPage /> },
      { path: 'yardage', element: <YardageBookPage /> },
      { path: 'yardage/wedge-matrix', element: <YardageBookPage /> },
      { path: 'yardage/details', element: <YardageBookPage /> },
      { path: 'yardage/gapping', element: <YardageBookPage /> },
      { path: 'yardage/:clubId', element: <ClubDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'faq', element: <HowItWorksPage /> },
      { path: 'strategy', element: <StrategyPlannerPage /> },
      { path: 'strategy/:courseId/:holeNumber', element: <StrategyPlannerPage /> },
      { path: 'admin', element: <AdminPage /> },
    ],
  },
]);
