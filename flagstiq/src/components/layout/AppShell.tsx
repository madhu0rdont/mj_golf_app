import { Outlet } from 'react-router';
import { SideNav } from './SideNav';

export function AppShell() {
  return (
    <div className="flex h-dvh bg-surface text-text-dark overflow-hidden">
      {/* Desktop side nav — hidden on mobile */}
      <SideNav />

      {/* Main content area */}
      <main className="relative z-[1] flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
