import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';

const setErrorLine = StateEffect.define<number | null>();
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setErrorLine)) continue;
      const b = new RangeSetBuilder<Decoration>();
      const n = e.value;
      if (n && n >= 1 && n <= tr.state.doc.lines) {
        const line = tr.state.doc.line(n);
        b.add(line.from, line.from, Decoration.line({ class: 'cm-errorLine' }));
      }
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface Props {
  value: string;
  onChange: (v: string) => void;
  label: string;
  errorLine?: number | null;
  /** Ctrl/Cmd+Enter で実行する */
  onRun?: () => void;
}

export function CodeEditor({ value, onChange, label, errorLine, onRun }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onRun });
  cb.current = { onChange, onRun };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          indentUnit.of('  '),
          lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(), indentOnInput(),
          bracketMatching(), closeBrackets(), syntaxHighlighting(defaultHighlightStyle), errorLineField,
          EditorState.tabSize.of(4),
          keymap.of([
            { key: 'Mod-Enter', run: () => { cb.current.onRun?.(); return true; } },
            ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap,
            // Tab でインデントする。Esc の後の Tab でエディタの外に出られる(キーボードだけで操作するため)
            indentWithTab,
          ]),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current.onChange(u.state.doc.toString()); }),
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // エディタは 1 回だけ作る。外から値が変わったときは下の effect で差し替える
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLine.of(errorLine ?? null) });
  }, [errorLine]);

  return <div className="editor" ref={host} />;
}

/** 読むだけのコード表示。行番号付きで、指定した行に印を付ける */
export function CodeView({ code, current, errorLine, warnLines }: { code: string; current?: number; errorLine?: number; warnLines?: number[] }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!current) return;
    const el = ref.current?.querySelector<HTMLElement>('[data-current]');
    // 画面の外に出たときだけスクロールする(毎回動くと読みにくい)
    el?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  return (
    <pre className="code-view" ref={ref} aria-label="コード">
      {code.replace(/\n$/, '').split('\n').map((l, i) => (
        <span
          key={i}
          className="code-line"
          data-current={current === i + 1 ? '' : undefined}
          data-error={errorLine === i + 1 ? '' : undefined}
          data-warn={warnLines?.includes(i + 1) ? '' : undefined}
          aria-current={current === i + 1 ? 'step' : undefined}
        >
          {l || ' '}
        </span>
      ))}
    </pre>
  );
}
