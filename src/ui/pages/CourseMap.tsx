import { CheckCircle2, Lock } from 'lucide-react';
import { useStore } from '../../learn/store';
import { lessonProgress, unitMastery, unitOpen } from '../../learn/catalog';
import { COURSES } from '../../content';

const ic = { className: 'icon-sm', strokeWidth: 1.75, 'aria-hidden': true } as const;

export function CourseMap() {
  const s = useStore();
  return (
    <div className="page">
      <h1>コース</h1>
      {COURSES.map((c) => (
        <section key={c.id} className="stack" aria-labelledby={`c-${c.id}`}>
          <h2 id={`c-${c.id}`}>{c.title}</h2>
          <p className="lead">{c.summary}</p>
          <ul className="td-list">
            {c.units.map((u, i) => {
              const open = unitOpen(s, c, i);
              const steps = u.lessons.reduce((a, l) => a + l.steps.length, 0);
              const done = u.lessons.reduce((a, l) => a + lessonProgress(s, c.id, u.id, l.id, l.steps.length), 0);
              const passed = s.passed[u.id] !== undefined;
              const m = Math.round(unitMastery(s, u) * 100);
              const body = (
                <>
                  <span className="td-row-main">
                    <span className="td-row-title">{i + 1}. {u.title}</span>
                    <span className="td-row-meta">{open ? u.summary : '前の単元の確認テストに合格すると開きます。'}</span>
                  </span>
                  <span className="td-row-end unit-row-status">
                    {passed ? <><CheckCircle2 {...ic} />合格</> : open ? <><span className="num">{done}/{steps}</span><span className="meter" aria-label={`習得度 ${m}%`}><i style={{ width: `${m}%` }} /></span></> : <><Lock {...ic} />未開放</>}
                  </span>
                </>
              );
              return <li key={u.id}>{open ? <a className="td-row" href={`#/learn/${c.id}/${u.id}`}>{body}</a> : <div className="td-row" aria-disabled="true">{body}</div>}</li>;
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
