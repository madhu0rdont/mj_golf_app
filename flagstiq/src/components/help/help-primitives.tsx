import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

/* ── KaTeX helper ── */

export function renderMath(text: string): ReactNode[] {
  const regex = /\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  let lastWasBlock = false;

  while ((match = regex.exec(text)) !== null) {
    const isBlock = match[1] !== undefined;
    if (match.index > lastIndex) {
      let t = text.slice(lastIndex, match.index);
      if (lastWasBlock) t = t.replace(/^\n+/, '');
      if (isBlock) t = t.replace(/\n+$/, '');
      if (t) parts.push(<span key={key++}>{t}</span>);
    }
    if (isBlock) {
      parts.push(
        <div key={key++} className="overflow-x-auto -mx-1 px-1">
          <BlockMath math={match[1].trim()} />
        </div>,
      );
      lastWasBlock = true;
    } else {
      parts.push(<InlineMath key={key++} math={match[2]!} />);
      lastWasBlock = false;
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    let t = text.slice(lastIndex);
    if (lastWasBlock) t = t.replace(/^\n+/, '');
    if (t) parts.push(<span key={key++}>{t}</span>);
  }
  return parts;
}

/** Render a string with KaTeX into a <p> */
export function P({ children, className = '' }: { children: string; className?: string }) {
  return (
    <p className={`text-sm text-text-medium leading-relaxed mb-3 whitespace-pre-line ${className}`}>
      {renderMath(children)}
    </p>
  );
}

export function H3({ children }: { children: string }) {
  return <h3 className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-3">{children}</h3>;
}

export function H4({ children }: { children: string }) {
  return <h4 className="font-display text-sm font-bold text-text-dark mt-5 mb-2">{children}</h4>;
}

export function DiagramCaption({ children }: { children: string }) {
  return <p className="text-[11px] text-text-muted text-center mt-1 mb-3">{children}</p>;
}

/* ── SVG color constants ── */

export const C = {
  primary: '#2d5a27',
  primaryLight: '#3d7a35',
  gold: '#c9a84c',
  coral: '#c0392b',
  blue: '#4361EE',
  purple: '#7209B7',
  orange: '#F4A261',
  muted: '#c8b99a',
  faint: '#d4c9b0',
  bg: '#f4f0e8',
  card: '#FFFFFF',
};
