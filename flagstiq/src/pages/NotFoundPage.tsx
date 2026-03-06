import { Link } from 'react-router';
import { TopBar } from '../components/layout/TopBar';

export function NotFoundPage() {
  return (
    <>
      <TopBar title="Not Found" />
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <p className="text-5xl font-bold text-text-muted">404</p>
        <p className="text-sm text-text-medium">This page doesn't exist.</p>
        <Link
          to="/"
          className="rounded-sm bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm"
        >
          Go Home
        </Link>
      </div>
    </>
  );
}
