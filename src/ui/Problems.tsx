import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Lightbulb, Plus, X, XCircle } from 'lucide-react';
import type { Problem } from '../content/types';
import { run, type RunResult } from '../shell/shell';
import { checkPredict, fillBlanks, instantiate, referenceCode, runTests, type Grade } from '../learn/grade';
import { rng } from '../learn/engine';
import { store } from '../learn/store';
import { CodeEditor, CodeView } from './CodeEditor';
import { Notes, RunPanel, TermView } from './RunPanel';
import { Stepper } from './Stepper';
import { FsView } from './FsView';

const ic = { strokeWidth: 1.75, 'aria-hidden': true } as const;

export interface ProblemProps {
  problem: Problem;
  seed: number;
  /** 最初の答え合わせの結果を 1 回だけ知らせる(習得度の推定に使う) */
  onResult: (firstTryOk: boolean) => void;
  /** 正解したか、答えを見たら、次へ進めるようになる */
  onSolved: () => void;
}

export function ProblemView(props: ProblemProps) {
  const p = useMemo(() => instantiate(props.problem, props.seed), [props.problem, props.seed]);
  const reported = useRef(false);
  useEffect(() => { reported.current = false; }, [p]);
  const report = (ok: boolean) => {
    if (!reported.current) { reported.current = true; props.onResult(ok); }
    if (ok) props.onSolved();
  };
  const giveUp = () => { report(false); props.onSolved(); };
  const common = { report, giveUp };
  return (
    <div className="problem">
      <p className="problem-prompt"><Inline text={p.prompt} /></p>
      {p.type === 'predict' && <Predict p={p} {...common} />}
      {p.type === 'choice' && <Choice p={p} {...common} />}
      {p.type === 'parsons' && <Parsons p={p} seed={props.seed} {...common} />}
      {p.type === 'fill' && <Fill p={p} {...common} />}
      {p.type === 'write' && <Write p={p} {...common} />}
    </div>
  );
}

interface Common { report: (ok: boolean) => void; giveUp: () => void }

function Verdict({ ok, title, children }: { ok: boolean; title?: string; children?: React.ReactNode }) {
  return (
    <div className="td-notice" data-tone={ok ? 'success' : 'error'} role="status">
      {ok ? <CheckCircle2 className="icon" {...ic} /> : <XCircle className="icon" {...ic} />}
      <div>
        <p className="td-notice-title">{title ?? (ok ? '正解です' : 'もう一度考えてみましょう')}</p>
        {children}
      </div>
    </div>
  );
}

function Explain({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="prose small"><p>{text}</p></div>;
}

/** 始めのファイルの様子。問題を解く前に、どこに何があるかを確かめられるようにする */
// コマンドの問題では、どこに何があるかが解く手がかりなので、最初から開いておく
function StartFs({ p, open = true }: { p: Problem; open?: boolean }) {
  const r = useMemo(() => run('', { fs: p.fs, cwd: p.cwd, trace: true }), [p]);
  const s0 = r.trace[0];
  if (!s0) return null;
  return (
    <details className="start-fs" open={open}>
      <summary>始めのファイルの様子(いまいる場所: {s0.cwd.replace(/^\/home\/you(?=\/|$)/, '~')})</summary>
      <FsView entries={s0.fs} cwd={s0.cwd} />
    </details>
  );
}

// ───── 出力の予測 ─────
function Predict({ p, report, giveUp }: { p: Problem & { type: 'predict' } } & Common) {
  const [ans, setAns] = useState('');
  const [res, setRes] = useState<{ ok: boolean; run: RunResult; dontKnow: boolean } | null>(null);
  const [step, setStep] = useState(false);
  const check = (dontKnow = false) => {
    const r = run(p.code, { fs: p.fs, cwd: p.cwd, trace: true });
    const ok = !dontKnow && checkPredict(ans, r.screen);
    setRes({ ok, run: r, dontKnow });
    // 予測はやり直せないので、外れても答えを見たことにして先へ進めるようにする
    if (ok) report(true); else giveUp();
  };
  return (
    <>
      <CodeView code={p.code} />
      <StartFs p={p} />
      <div className="td-field">
        <label className="td-label" htmlFor={`pr-${p.id}`}>画面に出る文字</label>
        <textarea className="td-input" id={`pr-${p.id}`} rows={3} value={ans} onChange={(e) => setAns(e.target.value)} spellCheck={false} autoCapitalize="off" style={{ fontFamily: 'var(--font-mono)', height: 'auto' }} readOnly={!!res} />
        <p className="td-help">コマンドの行(you@michi:~$ …)は書かず、出てくる文字だけを書きます。何も出ないと思ったら空のままにします。空白の数は問いません。</p>
      </div>
      {!res ? (
        <div className="row row-end">
          <button className="td-btn" data-variant="ghost" type="button" onClick={() => { setAns(''); check(true); }}>分からない</button>
          <button className="td-btn" data-variant="primary" type="button" onClick={() => check()}>実行して確かめる</button>
        </div>
      ) : (
        <div className="feedback">
          <Verdict ok={res.ok} title={res.dontKnow ? '実際の画面' : undefined}>
            {!res.ok && <p>{res.dontKnow ? '「1 行ずつ動きを見る」で、なぜこの画面になるかを確かめてください。' : '実際の画面と比べて、どこで考えがずれたかを 1 行ずつ確かめてください。'}</p>}
          </Verdict>
          <div className="diff">
            <div><p className="label-sm">あなたの予測</p><pre className="output">{ans}</pre></div>
            <div><p className="label-sm">実際の画面</p><TermView term={res.run.term} /></div>
          </div>
          <Explain text={p.explain} />
          {!step ? (
            <div><button className="td-btn" type="button" onClick={() => setStep(true)}>1 行ずつ動きを見る</button></div>
          ) : (
            <Stepper code={p.code} result={res.run} />
          )}
        </div>
      )}
    </>
  );
}

// ───── 選択肢 ─────
function Choice({ p, report, giveUp }: { p: Problem & { type: 'choice' } } & Common) {
  const [picked, setPicked] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const solved = picked.includes(p.answer);
  // 「分からない」を選んだときと、答えを見たときは、正解を示して先へ進めるようにする
  const reveal = (extra: number[] = []) => { setPicked([...picked, ...extra, p.answer]); setRevealed(true); giveUp(); };
  const pick = (i: number) => {
    if (solved || picked.includes(i)) return;
    if (p.choices[i].text === '分からない') { reveal([i]); return; }
    if (picked.length === 0) report(i === p.answer);
    else if (i === p.answer) report(true);
    setPicked([...picked, i]);
  };
  const last = picked[picked.length - 1];
  return (
    <>
      {p.code && <CodeView code={p.code} />}
      <div className="choices" role="group" aria-label="選択肢">
        {p.choices.map((c, i) => (
          <button
            key={i} type="button" className="choice" onClick={() => pick(i)}
            aria-pressed={picked.includes(i)}
            data-result={picked.includes(i) ? (i === p.answer ? 'right' : 'wrong') : undefined}
          >
            <span className="choice-key">{i + 1}</span>
            <span><Inline text={c.text} /></span>
          </button>
        ))}
      </div>
      {last !== undefined && (
        <div className="feedback">
          <Verdict ok={last === p.answer} title={revealed ? `答えは ${p.answer + 1} です` : undefined}><p><Inline text={p.choices[last].why} /></p></Verdict>
          {solved && <Explain text={p.explain} />}
          {!solved && <div><button className="td-btn" data-variant="ghost" type="button" onClick={() => reveal()}>答えを見る</button></div>}
        </div>
      )}
    </>
  );
}

/** `code` を等幅で見せる、ごく小さな整形 */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return <>{parts.map((s, i) => (s.startsWith('`') ? <code key={i} className="inline-code">{s.slice(1, -1)}</code> : s))}</>;
}

// ───── 並べ替え(Parsons) ─────
function Parsons({ p, seed, report, giveUp }: { p: Problem & { type: 'parsons' }; seed: number } & Common) {
  const pool0 = useMemo(() => {
    const items = [...p.lines, ...(p.distractors ?? [])].map((text, i) => ({ id: i, text }));
    const r = rng(seed + 7);
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  }, [p, seed]);
  const [pool, setPool] = useState(pool0);
  const [ans, setAns] = useState<{ id: number; text: string }[]>([]);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [tries, setTries] = useState(0);
  const ref = referenceCode(p);
  const code = ans.map((a) => a.text).join('\n') + '\n';
  const move = (i: number, d: number) => {
    const a = [...ans];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setAns(a); setGrade(null);
  };
  const check = () => {
    const g = runTests(code, ref, p);
    setGrade(g); setTries(tries + 1); report(g.ok);
  };
  const show = () => { setAns(p.lines.map((text, i) => ({ id: i, text }))); setPool(pool0.filter((x) => x.id >= p.lines.length)); setGrade(null); giveUp(); };
  return (
    <>
      <StartFs p={p} />
      <div className="parsons">
        <div>
          <p className="label-sm">使える行(使わない行も混ざっています)</p>
          <ul aria-label="使える行">
            {pool.map((it) => (
              <li key={it.id}>
                <span className="code">{it.text}</span>
                <button type="button" aria-label={`「${it.text.trim()}」を答えに加える`} onClick={() => { setPool(pool.filter((x) => x.id !== it.id)); setAns([...ans, it]); setGrade(null); }}><Plus className="icon-sm" {...ic} /></button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label-sm">あなたの答え(上から順に実行されます)</p>
          <ol aria-label="あなたの答え">
            {ans.map((it, i) => (
              <li key={it.id}>
                <span className="code">{it.text}</span>
                <button type="button" aria-label="上へ" onClick={() => move(i, -1)}><ArrowUp className="icon-sm" {...ic} /></button>
                <button type="button" aria-label="下へ" onClick={() => move(i, 1)}><ArrowDown className="icon-sm" {...ic} /></button>
                <button type="button" aria-label="使える行に戻す" onClick={() => { setAns(ans.filter((x) => x.id !== it.id)); setPool([...pool, it]); setGrade(null); }}><X className="icon-sm" {...ic} /></button>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {!grade?.ok && (
        <div className="row row-end">
          {tries >= 2 && <button className="td-btn" data-variant="ghost" type="button" onClick={show}>答えを見る</button>}
          <button className="td-btn" data-variant="primary" type="button" onClick={() => check()}>実行して確かめる</button>
        </div>
      )}
      {grade && <GradeView grade={grade} />}
      {grade?.ok && <Explain text={p.explain} />}
    </>
  );
}

// ───── 穴埋め ─────
function Fill({ p, report, giveUp }: { p: Problem & { type: 'fill' } } & Common) {
  const parts = p.code.split('___');
  const [vals, setVals] = useState<string[]>(() => p.answers.map(() => ''));
  const [grade, setGrade] = useState<Grade | null>(null);
  const [tries, setTries] = useState(0);
  const ref = referenceCode(p);
  const check = () => {
    const g = runTests(fillBlanks(p.code, vals), ref, p);
    setGrade(g); setTries(tries + 1); report(g.ok);
  };
  const show = () => { setVals([...p.answers]); setGrade(null); giveUp(); };
  return (
    <>
      <StartFs p={p} />
      <div className="fill-code">
        {parts.map((s, i) => (
          <span key={i}>
            {s}
            {i < parts.length - 1 && (
              <input
                aria-label={`${i + 1} 番目の空欄`} value={vals[i]} spellCheck={false} autoComplete="off" autoCapitalize="off"
                size={Math.max(4, vals[i].length + 1, p.answers[i].length)}
                onChange={(e) => { const v = [...vals]; v[i] = e.target.value; setVals(v); setGrade(null); }}
              />
            )}
          </span>
        ))}
      </div>
      {!grade?.ok && (
        <div className="row row-end">
          {tries >= 2 && <button className="td-btn" data-variant="ghost" type="button" onClick={show}>答えを見る</button>}
          <button className="td-btn" data-variant="primary" type="button" onClick={() => check()}>実行して確かめる</button>
        </div>
      )}
      {grade && <GradeView grade={grade} />}
      {grade?.ok && <Explain text={p.explain} />}
    </>
  );
}

// ───── 書く・直す ─────
function Write({ p, report, giveUp }: { p: Problem & { type: 'write' } } & Common) {
  const [code, setCode] = useState(() => store.get().drafts[p.id] ?? p.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [hints, setHints] = useState(0);
  const [tries, setTries] = useState(0);
  const [showSol, setShowSol] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => store.saveDraft(p.id, code), 400);
    return () => clearTimeout(t);
  }, [code, p.id]);

  const tryRun = () => {
    setGrade(null);
    setResult(run(code, { fs: p.fs, cwd: p.cwd, trace: true }));
  };
  const submit = () => {
    setResult(null);
    const g = runTests(code, p.solution, p);
    setGrade(g); setTries(tries + 1);
    // ヒントを見てから正解した場合は、自力の正解として数えない
    report(g.ok && hints === 0);
  };
  const errLine = (result?.error ?? grade?.tests?.find((t) => t.run.error)?.run.error)?.line;
  return (
    <>
      <StartFs p={p} />
      <CodeEditor value={code} onChange={(v) => { setCode(v); setGrade(null); }} label="コマンド" errorLine={errLine} onRun={tryRun} />
      <p className="small muted">1 行に 1 つずつコマンドを書きます。上から順に動きます。</p>
      <div className="row row-end">
        {hints < p.hints.length && !grade?.ok && (
          <button className="td-btn" data-variant="ghost" type="button" onClick={() => setHints(hints + 1)}><Lightbulb className="icon-sm" {...ic} />ヒント({hints + 1}/{p.hints.length})</button>
        )}
        {tries >= 3 && !grade?.ok && !showSol && <button className="td-btn" data-variant="ghost" type="button" onClick={() => { setShowSol(true); giveUp(); }}>解答例を見る</button>}
        <button className="td-btn" type="button" onClick={tryRun}>試しに実行</button>
        <button className="td-btn" data-variant="primary" type="button" onClick={submit}>提出する</button>
      </div>
      {hints > 0 && (
        <ol className="prose small">
          {p.hints.slice(0, hints).map((h, i) => <li key={i}><Inline text={h} /></li>)}
        </ol>
      )}
      {result && (
        <div className="stack">
          <RunPanel result={result} />
          {result.trace.length > 1 && <details><summary>1 行ずつ動きを見る</summary><Stepper code={code} result={result} /></details>}
        </div>
      )}
      {grade && <GradeView grade={grade} />}
      {grade?.ok && <Explain text={p.explain} />}
      {showSol && (
        <div className="stack">
          <p className="label-sm">解答例</p>
          <CodeView code={p.solution} />
          <Explain text={p.explain} />
        </div>
      )}
    </>
  );
}

/** テストの結果。最初に失敗したテストだけを詳しく見せる(見る量を減らすため) */
function GradeView({ grade }: { grade: Grade }) {
  const tests = grade.tests ?? [];
  const firstBad = tests.find((t) => t.verdict === 'different' || t.verdict === 'error');
  const passed = tests.filter((t) => t.verdict === 'same' || t.verdict === 'format').length;
  const outDiffers = firstBad && firstBad.verdict !== 'error' && firstBad.want !== firstBad.got;
  return (
    <div className="feedback">
      <Verdict ok={grade.ok}>
        <p>{tests.length > 1 ? `ファイルの中身を変えた ${tests.length} 通りのうち、${passed} 通りで合格しました。` : passed ? '期待どおりの結果になりました。' : '期待した結果と違います。'}</p>
        {grade.formatOnly && <p>中身は合っていますが、行末の空白か最後の改行が違います。</p>}
      </Verdict>
      {firstBad && (
        <div className="stack">
          {firstBad.hidden && <p className="small muted">このテストでは、ファイルの中身を見せていません。どんな中身でも動くコマンドにしてください。</p>}
          {firstBad.run.error ? <RunPanel result={firstBad.run} /> : (
            <>
              {outDiffers && (
                <div className="diff">
                  <div><p className="label-sm">期待する出力</p><pre className="output">{firstBad.hidden ? '(このテストの中身は見せていません)' : firstBad.want}</pre></div>
                  <div><p className="label-sm">あなたのコマンドの出力</p><pre className="output">{firstBad.got}</pre></div>
                </div>
              )}
              {firstBad.fsDiff.length > 0 && (
                <div><p className="label-sm">終わったときのファイルの違い</p><ul className="prose small">{firstBad.fsDiff.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
              )}
              {firstBad.cwd && <p className="small">終わったときにいる場所が違います(期待: {firstBad.cwd.want}、あなた: {firstBad.cwd.got})。</p>}
              <details>
                <summary>あなたのコマンドを動かした画面</summary>
                <TermView term={firstBad.run.term} />
              </details>
              <Notes notes={firstBad.run.notes} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
