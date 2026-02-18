import { useNavigate } from 'react-router';
import { ArrowLeft, Settings } from 'lucide-react';

interface TopBarProps {
  title: string;
  showBack?: boolean;
  showSettings?: boolean;
  rightAction?: React.ReactNode;
}

export function TopBar({ title, showBack, showSettings, rightAction }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-gray-800 bg-gray-900/95 px-4 backdrop-blur-sm">
      <div className="flex w-10 justify-start">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg p-1.5 text-gray-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
        )}
      </div>
      <h1 className="flex-1 text-center text-lg font-semibold text-white">{title}</h1>
      <div className="flex w-10 justify-end">
        {showSettings && (
          <button
            onClick={() => navigate('/settings')}
            className="rounded-lg p-1.5 text-gray-400 hover:text-white"
          >
            <Settings size={20} />
          </button>
        )}
        {rightAction}
      </div>
    </header>
  );
}
