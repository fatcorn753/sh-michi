import { AlertCircle, CheckCircle2, Info, Lightbulb } from 'lucide-react';
import type { Note, RunResult, TermChunk } from '../shell/shell';

const ic = { className: 'icon', strokeWidth: 1.75, 'aria-hidden': true } as const;

/** 端末の画面。打ったコマンドの行と、出力・エラーを色分けして並べる */
export function TermView({ term, label = '端末' }: { term: TermChunk[]; label?: string }) {
  return (
    <pre className="term" aria-label={label}>
      {term.map((t, i) => {
        if (t.kind === 'cmd') {
          const m = t.text.match(/^(\S+[$#]) ?(.*)$/s);
          return <span key={i} className="term-cmd"><span className="term-prompt">{m ? m[1] : ''}</span> {m ? m[2] : t.text}{'\n'}</span>;
        }
        return <span key={i} className={t.kind === 'err' ? 'term-err' : undefined}>{t.text}</span>;
      })}
    </pre>
  );
}

export function SyntaxNotice({ error }: { error: NonNullable<RunResult['error']> }) {
  return (
    <div className="td-notice" data-tone="error" role="alert">
      <AlertCircle {...ic} />
      <div>
        <p className="td-notice-title">{error.line} 行目: コマンドの書き方の誤り</p>
        <p><code className="inline-code">{error.message}</code></p>
        <p className="small">{error.hint}</p>
      </div>
    </div>
  );
}

/** エラーに添える日本語の説明 */
export function Notes({ notes, multiLine = true }: { notes: Note[]; multiLine?: boolean }) {
  if (notes.length === 0) return null;
  return (
    <div className="td-notice" role="status">
      <Lightbulb {...ic} />
      <div className="stack">
        {notes.map((n, i) => <p key={i}>{multiLine && n.line > 0 ? `${n.line} 行目: ` : ''}{n.msg}</p>)}
      </div>
    </div>
  );
}

/** 実行結果(端末の画面・エラーの説明・終了の様子)をまとめて見せる */
export function RunPanel({ result }: { result: RunResult }) {
  return (
    <div className="stack" aria-live="polite">
      {result.error && <SyntaxNotice error={result.error} />}
      <TermView term={result.term} />
      <Notes notes={result.notes} />
      {result.ok && (
        <p className="row small muted"><CheckCircle2 className="icon-sm" strokeWidth={1.75} aria-hidden />すべてのコマンドが成功しました(終了コード 0)。</p>
      )}
    </div>
  );
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="td-notice" role="status">
      <Info {...ic} />
      <div>{children}</div>
    </div>
  );
}
