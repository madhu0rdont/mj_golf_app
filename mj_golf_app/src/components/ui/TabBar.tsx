interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
  return (
    <div className="flex border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 py-2.5 text-center text-sm font-medium transition ${
            activeTab === tab.key
              ? 'border-b-2 border-primary text-primary'
              : 'text-text-muted hover:text-text-medium'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
