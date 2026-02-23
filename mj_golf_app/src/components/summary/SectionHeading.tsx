interface SectionHeadingProps {
  title: string;
}

export function SectionHeading({ title }: SectionHeadingProps) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
        {title}
      </span>
      <div className="flex-1 border-t border-border-light" />
    </div>
  );
}
