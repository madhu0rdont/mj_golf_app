import { TopBar } from '../components/layout/TopBar';
import InterleavedHelpContent from '../components/help/InterleavedHelpContent';
import YardageBookHelpContent from '../components/help/YardageBookHelpContent';
import ClubSelectionHelpContent from '../components/help/ClubSelectionHelpContent';
import CourseManagementHelpContent from '../components/help/CourseManagementHelpContent';

const SECTIONS = [
  { id: 'interleaved', label: 'Interleaved' },
  { id: 'yardage-book', label: 'Yardage Book' },
  { id: 'club-selection', label: 'Club Selection' },
  { id: 'course-mgmt', label: 'Course Mgmt' },
];

function Card({ children, id }: { children: React.ReactNode; id?: string }) {
  return <div id={id} className="rounded-xl border border-border bg-card p-4 mb-4 scroll-mt-14">{children}</div>;
}

export function HowItWorksPage() {
  return (
    <>
      <TopBar title="How It Works" showBack />

      {/* Sticky section nav */}
      <div className="sticky top-14 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-4 py-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex-shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-medium hover:bg-border hover:text-text-dark transition-colors"
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        <Card id="interleaved">
          <InterleavedHelpContent />
        </Card>

        <Card id="yardage-book">
          <YardageBookHelpContent />
        </Card>

        <Card id="club-selection">
          <ClubSelectionHelpContent />
        </Card>

        <Card id="course-mgmt">
          <CourseManagementHelpContent />
        </Card>
      </div>
    </>
  );
}
