interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  titleEmphasis?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, titleEmphasis, actions }: PageHeaderProps) {
  return (
    <div className="hidden md:flex items-start justify-between px-8 pt-7">
      <div>
        {eyebrow && (
          <div className="font-mono text-[9px] tracking-[0.35em] uppercase text-ink-faint mb-1.5">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-4xl font-light text-ink tracking-[0.02em] leading-none">
          {title}
          {titleEmphasis && (
            <em className="italic text-turf"> {titleEmphasis}</em>
          )}
        </h1>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 mt-1.5">
          {actions}
        </div>
      )}
    </div>
  );
}
