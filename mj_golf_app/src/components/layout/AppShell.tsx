import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav';

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text-dark">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
