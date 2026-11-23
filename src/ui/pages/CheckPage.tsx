import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { findCourse, findUnit, kcLabel } from '../../learn/catalog';
import { store } from '../../learn/store';
import { Quiz, type QuizResult } from '../Quiz';

export const PASS = 80;

export function CheckPage({ courseId, unitId }: { courseId: string; unitId: string }) {
  const unit = findUnit(courseId, unitId);
  const course = findCourse(courseId);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<QuizResult[] | null>(null);
  const seeds = useMemo(() => (unit?.check ?? []).map((_, i) => (Date.now() + i * 7919 + round) >>> 0), [unit, round]);
  if (!unit || !course) return <p>単元が見つかりません。</p>;

  if (result) {
    const score = Math.round((result.filter((r) => r.ok).length / result.length) * 100);
    const pass = score >= PASS;
    const weak = [...new Set(result.filter((r) => !r.ok).flatMap((r) => r.problem.kcs))];
    const idx = course.units.indexOf(unit);
    const nextUnit = course.units[idx + 1];
    return (
      <div className="page page-narrow">
        <h1>確認テストの結果</h1>
        <div className="td-stats"><div className="td-stat"><span className="td-stat-label">正答率</span><span className="td-stat-value">{score}<span className="td-stat-unit">%</span></span></div></div>
        <p>{pass ? '合格です。次の単元が開きました。' : `合格は ${PASS}% 以上です。間違えた内容を見直してから、もう一度受けてください。問題の数字は毎回変わります。`}</p>
        {weak.length > 0 && <div className="prose"><p>見直すとよい内容:</p><ul>{weak.map((k) => <li key={k}>{kcLabel(k)}</li>)}</ul></div>}
        <div className="row row-end">
          {!pass && <a className="td-btn" href={`#/learn/${courseId}/${unitId}`}>単元を見直す</a>}
          {!pass && <button className="td-btn" data-variant="primary" type="button" onClick={() => { setResult(null); setRound(round + 1); }}>もう一度受ける</button>}
          {pass && (nextUnit ? <a className="td-btn" data-variant="primary" href={`#/learn/${courseId}/${nextUnit.id}`}>次の単元へ</a> : <a className="td-btn" data-variant="primary" href="#/course">コースへ戻る</a>)}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <a href={`#/learn/${courseId}/${unitId}`} className="small back-link"><ArrowLeft className="icon-sm" strokeWidth={1.75} aria-hidden /> 単元の目次</a>
      <h1>確認テスト: {unit.title}</h1>
      <p className="lead">ヒントや答えを見た問題は不正解として数えます。</p>
      <Quiz
        key={round}
        label="確認テストの進み具合"
        items={unit.check}
        seeds={seeds}
        onAnswer={(p, ok) => store.answer(p.id, p.kcs, ok)}
        onFinish={(r) => {
          const score = Math.round((r.filter((x) => x.ok).length / r.length) * 100);
          if (score >= PASS) store.update((s) => ({ passed: { ...s.passed, [unitId]: Math.max(score, s.passed[unitId] ?? 0) } }));
          setResult(r);
        }}
      />
    </div>
  );
}
