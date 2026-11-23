import { useCallback, useEffect, useState } from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import type { RunResult, Stage } from '../shell/shell';
import { CodeView } from './CodeEditor';
import { FsView } from './FsView';
import { TermView } from './RunPanel';

interface Props {
  code: string;
  result: RunResult;
  /** 予測してから見るモードで始める */
  predictFirst?: boolean;
}

/** パイプの各段が何を次へ渡したか */
function PipeView({ stages }: { stages: Stage[] }) {
  return (
    <ol className="pipe" aria-label="パイプの各段の出力">
      {stages.map((s, i) => (
        <li key={i}>
          <p className="label-sm"><code className="inline-code">{s.text}</code> {i < stages.length - 1 ? 'が次へ渡したもの' : 'の出力'}</p>
          <pre className="output">{s.out.length > 2000 ? s.out.slice(0, 2000) + '…' : s.out}</pre>
        </li>
      ))}
    </ol>
  );
}

/** 1 行ずつ進めたり戻したりしながら、ファイルの木と端末の様子を見る */
export function Stepper({ code, result, predictFirst = false }: Props) {
  const trace = result.trace;
  const [i, setI] = useState(0);
  const [predict, setPredict] = useState(predictFirst);
  const [revealed, setRevealed] = useState(true);
  const last = Math.max(0, trace.length - 1);

  useEffect(() => { setI(0); setRevealed(true); }, [result]);

  const go = useCallback((n: number) => {
    const to = Math.max(0, Math.min(last, n));
    // 予測モードでは、1 つ進めるとき結果を隠し、もう一度押すと見せる
    if (predict && to === i + 1 && revealed) { setI(to); setRevealed(false); return; }
    if (predict && !revealed && to === i + 1) { setRevealed(true); return; }
    setRevealed(true);
    setI(to);
  }, [last, predict, revealed, i]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
  };

  if (trace.length === 0) return null;
  const s = trace[i];
  // 結果を隠している間は、1 つ前の時点のファイルと画面を見せる
  const shown = !revealed && i > 0 ? trace[i - 1] : s;
  const pipeStages = revealed && s.stages.length > 1 ? s.stages : null;

  return (
    <div className="stack" onKeyDown={onKey}>
      <div className="step-controls" role="group" aria-label="1 行ずつ実行">
        <button className="td-btn" data-icon-only type="button" aria-label="最初へ" onClick={() => go(0)} disabled={i === 0}><ChevronFirst className="icon" strokeWidth={1.75} aria-hidden /></button>
        <button className="td-btn" data-icon-only type="button" aria-label="1 つ戻る(←)" onClick={() => go(i - 1)} disabled={i === 0}><ChevronLeft className="icon" strokeWidth={1.75} aria-hidden /></button>
        <button className="td-btn" type="button" onClick={() => go(i + 1)} disabled={i === last && revealed}>
          {predict && !revealed ? <><Eye className="icon-sm" strokeWidth={1.75} aria-hidden />答えを見る</> : <>次へ<ChevronRight className="icon-sm" strokeWidth={1.75} aria-hidden /></>}
        </button>
        <button className="td-btn" data-icon-only type="button" aria-label="最後へ" onClick={() => go(last)} disabled={i === last}><ChevronLast className="icon" strokeWidth={1.75} aria-hidden /></button>
        <input type="range" min={0} max={last} value={i} onChange={(e) => { setRevealed(true); setI(+e.target.value); }} aria-label="何行目まで動かすかを選ぶ" />
        <span className="step-count" aria-live="polite">{i} / {last} 行</span>
        <label className="td-check">
          <span>予測してから見る</span>
          <input className="td-switch" type="checkbox" role="switch" checked={predict} onChange={(e) => { setPredict(e.target.checked); setRevealed(true); }} />
        </label>
      </div>
      {predict && !revealed && <p className="small muted" role="status">→ の行を動かすと、画面とファイルがどう変わるか予想してから「答えを見る」を押してください。</p>}
      <div className="stepper">
        <div className="stack">
          <CodeView code={code} current={s.line || undefined} />
          <div>
            <p className="label-sm">端末の画面</p>
            <TermView term={result.term.slice(0, shown.term)} />
          </div>
          {pipeStages && <PipeView stages={pipeStages} />}
        </div>
        <div className="stack">
          <p className="small muted">{i === 0 ? '動かす前' : !revealed ? `${s.line} 行目を動かす前` : `${s.line} 行目を動かした後`}のファイルの様子です。</p>
          <FsView entries={shown.fs} cwd={shown.cwd} prev={i > 0 && revealed ? trace[i - 1].fs : undefined} />
        </div>
      </div>
    </div>
  );
}
