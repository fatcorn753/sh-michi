import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { findCourse, findUnit, lessonProgress } from '../../learn/catalog';
import { guessFor } from '../../learn/engine';
import { store, useStore } from '../../learn/store';
import { run } from '../../shell/shell';
import { ProblemView } from '../Problems';
import { Stepper } from '../Stepper';
import { Md } from '../Md';

const ic = { className: 'icon-sm', strokeWidth: 1.75, 'aria-hidden': true } as const;

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function LessonPage({ courseId, unitId, lessonId }: { courseId: string; unitId: string; lessonId?: string }) {
  const s = useStore();
  const course = findCourse(courseId);
  const unit = findUnit(courseId, unitId);
  if (!course || !unit) return <p>単元が見つかりません。<a href="#/course">コースへ戻る</a></p>;

  if (!lessonId) {
    return (
      <div className="page page-narrow">
        <a href="#/course" className="small back-link"><ArrowLeft {...ic} /> コース</a>
        <h1>{unit.title}</h1>
        <p className="lead">{unit.summary}</p>
        <ul className="td-list">
          {unit.lessons.map((l) => {
            const d = lessonProgress(s, courseId, unitId, l.id, l.steps.length);
            return (
              <li key={l.id}><a className="td-row" href={`#/learn/${courseId}/${unitId}/${l.id}`}>
                <span className="td-row-main"><span className="td-row-title">{l.title}</span></span>
                <span className="td-row-end">{d === l.steps.length ? <><CheckCircle2 {...ic} />完了</> : <span className="num">{d}/{l.steps.length}</span>}</span>
              </a></li>
            );
          })}
          {unit.check.length > 0 && (
            <li><a className="td-row" href={`#/check/${courseId}/${unitId}`}>
              <span className="td-row-main"><span className="td-row-title">確認テスト</span><span className="td-row-meta">8 割以上で合格です。合格すると次の単元が開きます。</span></span>
              <span className="td-row-end">{s.passed[unitId] !== undefined ? <><CheckCircle2 {...ic} />{s.passed[unitId]}%</> : `${unit.check.length} 問`}</span>
            </a></li>
          )}
        </ul>
      </div>
    );
  }

  const lesson = unit.lessons.find((l) => l.id === lessonId);
  if (!lesson) return <p>レッスンが見つかりません。</p>;
  return <LessonPlayer key={`${courseId}/${unitId}/${lesson.id}`} courseId={courseId} unitId={unitId} lesson={lesson} next={unit.lessons[unit.lessons.indexOf(lesson) + 1]?.id} />;
}

function LessonPlayer({ courseId, unitId, lesson, next }: { courseId: string; unitId: string; lesson: import('../../content/types').Lesson; next?: string }) {
  const s = store.get();
  const keyOf = (i: number) => `${courseId}/${unitId}/${lesson.id}/${i}`;
  const firstTodo = lesson.steps.findIndex((_, i) => !s.done[keyOf(i)]);
  const [i, setI] = useState(firstTodo < 0 ? 0 : firstTodo);
  const [solved, setSolved] = useState(false);
  const step = lesson.steps[i];
  useEffect(() => { setSolved(step.kind === 'read' || !!store.get().done[keyOf(i)]); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const exampleRun = useMemo(() => (step.kind === 'read' && step.example ? run(step.example, { fs: step.fs, cwd: step.cwd, trace: true }) : null), [step]);
  const goNext = () => {
    store.markDone(keyOf(i));
    if (i + 1 < lesson.steps.length) setI(i + 1);
    else location.hash = next ? `#/learn/${courseId}/${unitId}/${next}` : `#/learn/${courseId}/${unitId}`;
  };

  return (
    <div className="page">
      <div className="lesson-head">
        <a href={`#/learn/${courseId}/${unitId}`} className="small back-link"><ArrowLeft {...ic} /> 単元の目次</a>
        <h1>{lesson.title}</h1>
        <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={lesson.steps.length} aria-valuenow={i + 1} aria-label="レッスンの進み具合"><i style={{ width: `${((i + 1) / lesson.steps.length) * 100}%` }} /></div>
        <p className="small muted num">{i + 1} / {lesson.steps.length}</p>
      </div>
      {step.kind === 'read' ? (
        <section className="stack">
          <h2>{step.title}</h2>
          <Md text={step.body} />
          {step.example && exampleRun && (
            <div className="stack">
              <p className="small muted">例です。「次へ」で 1 行ずつ動かして、画面とファイルがどう変わるかを見てください。</p>
              <Stepper code={step.example} result={exampleRun} />
            </div>
          )}
        </section>
      ) : (
        <ProblemView
          key={step.problem.id}
          problem={step.problem}
          seed={hashSeed(step.problem.id)}
          onResult={(ok) => store.answer(step.problem.id, step.problem.kcs, ok, step.problem.type === 'choice' ? guessFor(step.problem.choices.length) : undefined)}
          onSolved={() => setSolved(true)}
        />
      )}
      <div className="lesson-nav">
        <button className="td-btn" data-variant="ghost" type="button" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}><ArrowLeft {...ic} />前へ</button>
        {solved ? (
          <button className="td-btn" data-variant="primary" type="button" onClick={goNext}>{i + 1 < lesson.steps.length ? '次へ' : 'レッスンを終える'}<ArrowRight {...ic} /></button>
        ) : (
          <span className="small muted">答え合わせをすると進めます</span>
        )}
      </div>
    </div>
  );
}
