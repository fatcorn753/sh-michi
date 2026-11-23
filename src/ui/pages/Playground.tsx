import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Fs, byName } from '../../shell/fs';
import { Shell, snapshot, type FsEntry, type Note } from '../../shell/shell';
import { COMMANDS } from '../../shell/commands';
import { PLAY_FS } from '../../content/playground';
import { FsView } from '../FsView';
import { Notes, TermView } from '../RunPanel';

const HIST_KEY = 'sh-michi:history';

function fresh(): Shell {
  const sh = new Shell(Fs.fromSpec(PLAY_FS));
  sh.term.push({ kind: 'out', text: '練習用の端末です。help で使えるコマンドの一覧、man ls で ls の説明を出します。\n' });
  return sh;
}

/** Tab での補完。最初の単語はコマンド名、それ以外はファイル名で、共通する先頭まで埋める */
function complete(sh: Shell, line: string): { line: string; options: string[] } {
  const m = line.match(/^(.*?)(\S*)$/s)!;
  const before = m[1], word = m[2];
  const isCmd = before.trim() === '';
  let cands: string[];
  let prefix = '';
  if (isCmd && !word.includes('/')) cands = Object.keys(COMMANDS).filter((c) => c.startsWith(word));
  else {
    const i = word.lastIndexOf('/');
    prefix = i >= 0 ? word.slice(0, i + 1) : '';
    const base = word.slice(prefix.length);
    const dir = sh.fs.tryLookup(prefix === '' ? '.' : prefix.replace(/^~(?=\/|$)/, sh.fs.home), sh.cwd);
    if (!dir || dir.kind !== 'dir' || !sh.fs.canRead(dir)) return { line, options: [] };
    cands = [...dir.children.values()]
      .filter((c) => c.name.startsWith(base) && (base.startsWith('.') || !c.name.startsWith('.')))
      .map((c) => c.name + (c.kind === 'dir' ? '/' : ' '));
  }
  cands.sort(byName);
  if (cands.length === 0) return { line, options: [] };
  let common = cands[0];
  for (const c of cands) while (!c.startsWith(common)) common = common.slice(0, -1);
  if (cands.length === 1 && isCmd) common += ' ';
  return { line: before + prefix + common, options: cands.length > 1 ? cands.map((c) => c.trim()) : [] };
}

export function Playground() {
  const sh = useRef<Shell>(fresh());
  const [, render] = useState(0);
  const [input, setInput] = useState('');
  const [prev, setPrev] = useState<FsEntry[] | undefined>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [hist, setHist] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(HIST_KEY) ?? '[]'); } catch { return []; } });
  const [hi, setHi] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); });
  useEffect(() => { try { localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(-100))); } catch { /* 保存できなくても続ける */ } }, [hist]);

  const s = sh.current;
  const fs = snapshot(s.fs);

  const exec = () => {
    const line = input;
    setInput(''); setHi(-1);
    if (line.trim() === '') { s.term.push({ kind: 'cmd', text: `${s.prompt()} ` }); render((n) => n + 1); return; }
    setPrev(fs);
    const before = s.notes.length;
    s.exec(line);
    setNotes(s.notes.slice(before));
    setHist((h) => (h[h.length - 1] === line ? h : [...h, line]));
    render((n) => n + 1);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); exec(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (hist.length === 0) return;
      const n = e.key === 'ArrowUp' ? (hi < 0 ? hist.length - 1 : Math.max(0, hi - 1)) : hi < 0 ? -1 : hi + 1;
      if (n >= hist.length || n < 0) { setHi(-1); setInput(''); return; }
      setHi(n); setInput(hist[n]);
      return;
    }
    if (e.key === 'Tab' && input !== '') {
      e.preventDefault();
      const r = complete(s, input);
      setInput(r.line);
      if (r.options.length) { s.term.push({ kind: 'cmd', text: `${s.prompt()} ${input}` }, { kind: 'out', text: r.options.join('  ') + '\n' }); render((n) => n + 1); }
    }
    if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); s.term.length = 0; render((n) => n + 1); }
  };

  const reset = () => { sh.current = fresh(); setPrev(undefined); setNotes([]); setInput(''); render((n) => n + 1); inputRef.current?.focus(); };

  return (
    <div className="page">
      <h1>自由に打つ</h1>
      <p className="lead">練習用のファイルが置いてある端末です。何を消しても、「最初の状態に戻す」で元に戻せます。上矢印キーで前に打ったコマンド、Tab キーで名前の続きを呼び出せます。</p>
      <div className="stepper">
        <div className="stack">
          <div className="term-box" ref={box} onClick={() => inputRef.current?.focus()}>
            <TermView term={s.term} />
            <div className="term-input">
              <label htmlFor="term-in" className="term-prompt">{s.prompt()}</label>
              <input
                id="term-in" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
                autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send" autoFocus
              />
            </div>
          </div>
          <Notes notes={notes} multiLine={false} />
          <div className="row row-end">
            <button className="td-btn" type="button" onClick={reset}><RotateCcw className="icon-sm" strokeWidth={1.75} aria-hidden />最初の状態に戻す</button>
          </div>
        </div>
        <div className="stack">
          <p className="small muted">いまのファイルの様子です。直前のコマンドで増えたもの・変わったものに印が付きます。ファイルの名前を押すと中身が見えます。</p>
          <FsView entries={fs} cwd={s.cwd} prev={prev} />
        </div>
      </div>
      <details className="small muted">
        <summary>このサイトのシェルでできること・できないこと</summary>
        <div className="prose">
          <p>使えるもの: help で出る {Object.keys(COMMANDS).length} 個のコマンド、引用符('…' と "…")、変数($HOME など)、ワイルドカード(* ? [ ])、パイプ(|)、リダイレクト(&gt; &gt;&gt; &lt; 2&gt; 2&gt;&amp;1)、; と && と ||。</p>
          <p>まだ使えないもの: if や for などのシェルスクリプト、$( ) で出力を埋め込む書き方、エディタ(vim・nano)、ネットワーク、sudo。</p>
          <p>本物との違い: 時刻は実行のたびに 1 分ずつ進む作り物です。並べ方は LANG=C と同じ文字コードの順です。find の結果は名前の順に並べます。</p>
        </div>
      </details>
    </div>
  );
}
