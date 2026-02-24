import type { InterleavedHole } from '../../models/session';
import type { HoleScore } from '../../services/interleaved-scoring';

interface ScorecardProps {
  holes: InterleavedHole[];
  scores: HoleScore[];
}

export function Scorecard({ holes, scores }: ScorecardProps) {
  const front9 = holes.slice(0, 9);
  const back9 = holes.length > 9 ? holes.slice(9, 18) : [];

  const renderHalf = (holeSlice: InterleavedHole[], offset: number, label: string) => {
    const halfScores = scores.slice(offset, offset + holeSlice.length);
    const totalPar = holeSlice.reduce((s, h) => s + h.par, 0);
    const totalScore = halfScores.reduce((s, h) => s + h.total, 0);
    const totalToPar = halfScores.reduce((s, h) => s + h.toPar, 0);

    return (
      <>
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 px-1.5 text-left text-[10px] font-medium text-text-muted uppercase">Hole</th>
            {holeSlice.map((h) => (
              <th key={h.number} className="py-2 px-1 text-center text-[10px] font-medium text-text-muted">{h.number}</th>
            ))}
            <th className="py-2 px-1.5 text-center text-[10px] font-medium text-text-muted uppercase">{label}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border-light">
            <td className="py-1.5 px-1.5 text-[10px] text-text-muted">Dist</td>
            {holeSlice.map((h) => (
              <td key={h.number} className="py-1.5 px-1 text-center text-[10px] text-text-muted">{h.distanceYards}</td>
            ))}
            <td className="py-1.5 px-1.5" />
          </tr>
          <tr className="border-b border-border-light">
            <td className="py-1.5 px-1.5 text-[10px] text-text-muted">Par</td>
            {holeSlice.map((h) => (
              <td key={h.number} className="py-1.5 px-1 text-center text-[10px] text-text-muted">{h.par}</td>
            ))}
            <td className="py-1.5 px-1.5 text-center text-[10px] font-medium text-text-dark">{totalPar}</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-1.5 px-1.5 text-[10px] font-medium text-text-dark">Score</td>
            {holeSlice.map((h, i) => {
              const score = halfScores[i];
              if (!score) return <td key={h.number} className="py-1.5 px-1" />;
              return (
                <td key={h.number} className="py-1.5 px-1 text-center">
                  <span className={`text-xs font-bold ${
                    score.toPar <= -2 ? 'text-gold-dark'
                    : score.toPar === -1 ? 'text-primary'
                    : score.toPar === 0 ? 'text-text-dark'
                    : 'text-coral'
                  }`}>
                    {score.total}
                  </span>
                </td>
              );
            })}
            <td className="py-1.5 px-1.5 text-center">
              <span className={`text-xs font-bold ${
                totalToPar < 0 ? 'text-primary' : totalToPar === 0 ? 'text-text-dark' : 'text-coral'
              }`}>
                {totalScore}
              </span>
            </td>
          </tr>
        </tbody>
      </>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {renderHalf(front9, 0, 'Out')}
        {back9.length > 0 && renderHalf(back9, 9, 'In')}
      </table>
      {/* Grand total for 18 holes */}
      {back9.length > 0 && (
        <div className="mt-2 flex items-center justify-between px-2 py-2 rounded-lg bg-surface">
          <span className="text-xs font-medium text-text-muted uppercase">Total</span>
          <span className={`text-sm font-bold ${
            scores.reduce((s, h) => s + h.toPar, 0) < 0 ? 'text-primary'
            : scores.reduce((s, h) => s + h.toPar, 0) === 0 ? 'text-text-dark'
            : 'text-coral'
          }`}>
            {scores.reduce((s, h) => s + h.total, 0)} ({(() => {
              const tp = scores.reduce((s, h) => s + h.toPar, 0);
              return tp === 0 ? 'E' : tp > 0 ? `+${tp}` : tp;
            })()})
          </span>
        </div>
      )}
    </div>
  );
}
