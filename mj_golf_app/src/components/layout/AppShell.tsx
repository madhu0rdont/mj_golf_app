import { Outlet } from 'react-router';

export function AppShell() {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text-dark">
      <main className="flex-1 pb-6">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-card px-4 py-3 text-center text-xs text-text-muted pb-[env(safe-area-inset-bottom)]">
        &copy; {year} Madhukrishna Josyula. All rights reserved.
      </footer>
    </div>
  );
}
