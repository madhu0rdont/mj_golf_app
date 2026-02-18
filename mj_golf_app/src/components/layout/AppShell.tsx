import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav';

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-950 text-white">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
