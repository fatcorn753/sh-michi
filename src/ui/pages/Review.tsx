import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { dueReviews } from '../../learn/catalog';
import { store, useStore } from '../../learn/store';
import { Quiz, type QuizResult } from '../Quiz';

export function Review() {
  const s = useStore();
  const [session, setSession] = useState(0);
  const [done, setDone] = useState<QuizResult[] | null>(null);
  // 始めた時点の問題で固定する(解いている途中で一覧が変わらないように)
  const items = useMemo(() => dueReviews(store.get()), [session]); // eslint-disable-line react-hooks/exhaustive-deps
  const seeds = useMemo(() => items.map((_, i) => (Date.now() + i * 104729) >>> 0), [items]);
  const upcoming = Object.values(s.cards).filter((c) => c.due > Date.now()).sort((a, b) => a.due - b.due)[0];

  if (done) {
    const ok = done.filter((r) => r.ok).length;
    return (
      <div className="page page-narrow">
        <h1>復習が終わりました</h1>
        <p>{done.length} 問中 {ok} 問を最初の答えで正解しました。間違えた問題は、明日もう一度出ます。</p>
        <div className="row"><button className="td-btn" type="button" onClick={() => { setDone(null); setSession(session + 1); }}>残りの復習を確かめる</button></div>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="page page-narrow">
        <div className="td-empty">
          <RotateCcw className="icon" strokeWidth={1.75} aria-hidden />
          <p className="td-empty-title">いま復習する問題はありません</p>
          <p>{upcoming ? `次の復習は ${new Date(upcoming.due).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ごろに出ます。` : 'レッスンで解いた問題が、忘れかけたころにここへ出ます。'}</p>
          <a className="td-btn" data-variant="primary" href="#/course">レッスンを進める</a>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <h1>復習</h1>
      <p className="lead">前に解いた問題の、数字を変えた版です。いろいろな単元が混ざっています。</p>
      <Quiz key={session} label="復習の進み具合" items={items} seeds={seeds} onAnswer={(p, ok) => store.answer(p.id, p.kcs, ok)} onFinish={setDone} />
    </div>
  );
}
