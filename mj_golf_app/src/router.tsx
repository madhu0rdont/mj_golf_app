import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { LoadingPage } from './components/ui/LoadingPage';
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
import { SettingsPage } from './pages/SettingsPage';
import { PlayPage } from './pages/PlayPage';
import { PracticePage } from './pages/PracticePage';

// Lazy-loaded pages (heavy dependencies: recharts, katex, google maps, jsPDF)
const YardageBookPage = lazy(() => import('./pages/YardageBookPage').then(m => ({ default: m.YardageBookPage })));
const ClubDetailPage = lazy(() => import('./pages/ClubDetailPage').then(m => ({ default: m.ClubDetailPage })));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage').then(m => ({ default: m.HowItWorksPage })));
const StrategyPlannerPage = lazy(() => import('./pages/StrategyPlannerPage').then(m => ({ default: m.StrategyPlannerPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));

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
      { path: 'yardage', element: <Suspense fallback={<LoadingPage />}><YardageBookPage /></Suspense> },
      { path: 'yardage/wedge-matrix', element: <Suspense fallback={<LoadingPage />}><YardageBookPage /></Suspense> },
      { path: 'yardage/details', element: <Suspense fallback={<LoadingPage />}><YardageBookPage /></Suspense> },
      { path: 'yardage/gapping', element: <Suspense fallback={<LoadingPage />}><YardageBookPage /></Suspense> },
      { path: 'yardage/:clubId', element: <Suspense fallback={<LoadingPage />}><ClubDetailPage /></Suspense> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'faq', element: <Suspense fallback={<LoadingPage />}><HowItWorksPage /></Suspense> },
      { path: 'strategy', element: <Suspense fallback={<LoadingPage />}><StrategyPlannerPage /></Suspense> },
      { path: 'strategy/:courseId/:holeNumber', element: <Suspense fallback={<LoadingPage />}><StrategyPlannerPage /></Suspense> },
      { path: 'admin', element: <Suspense fallback={<LoadingPage />}><AdminPage /></Suspense> },
    ],
  },
]);
