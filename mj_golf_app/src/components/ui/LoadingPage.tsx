import { Loader2 } from 'lucide-react';
import { TopBar } from '../layout/TopBar';

export function LoadingPage({ title, showBack }: { title?: string; showBack?: boolean }) {
  return (
    <>
      {title && <TopBar title={title} showBack={showBack} />}
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    </>
  );
}
