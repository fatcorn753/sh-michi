import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Problem } from '../content/types';
import { ProblemView } from './Problems';

export interface QuizResult { problem: Problem; ok: boolean }

/** 問題を 1 問ずつ出す。最初の答えの正誤を集めて、最後に onFinish へ渡す */
export function Quiz({ items, seeds, onAnswer, onFinish, label }: {
  items: Problem[];
  seeds: number[];
  onAnswer?: (p: Problem, ok: boolean) => void;
  onFinish: (r: QuizResult[]) => void;
  label: string;
}) {
  const [i, setI] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [solved, setSolved] = useState(false);
  const p = items[i];
  const next = () => {
    if (i + 1 < items.length) { setI(i + 1); setSolved(false); } else onFinish(results);
  };
  return (
    <div className="stack">
      <div className="progress-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={i + 1}><i style={{ width: `${((i + 1) / items.length) * 100}%` }} /></div>
      <p className="small muted num">{i + 1} / {items.length}</p>
      <ProblemView
        key={`${p.id}-${i}`}
        problem={p}
        seed={seeds[i]}
        onResult={(ok) => { setResults((r) => [...r, { problem: p, ok }]); onAnswer?.(p, ok); }}
        onSolved={() => setSolved(true)}
      />
      <div className="lesson-nav">
        <span />
        {solved ? (
          <button className="td-btn" data-variant="primary" type="button" onClick={next}>{i + 1 < items.length ? '次の問題' : '結果を見る'}<ArrowRight className="icon-sm" strokeWidth={1.75} aria-hidden /></button>
        ) : <span className="small muted">答え合わせをすると進めます</span>}
      </div>
    </div>
  );
}
