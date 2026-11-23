// コマンド行を読む。引用符・変数・パイプ・リダイレクト・; && || を扱う(bash の小さな部分集合)

/** 単語のかけら。q は引用のされ方(0: なし、1: '…'、2: "…")。展開やワイルドカードの扱いが変わる */
export type Part = { t: 'lit'; s: string; q: 0 | 1 | 2 } | { t: 'var'; name: string; q: 0 | 2 };
export type Word = Part[];

export type RedirOp = '>' | '>>' | '<' | '2>' | '2>>' | '2>&1' | '&>';
export interface Redir { op: RedirOp; target?: Word }
export interface Cmd { words: Word[]; assigns: { name: string; value: Word }[]; redirs: Redir[]; text: string }
export interface Pipeline { cmds: Cmd[]; text: string }
export interface Item { first: Pipeline; rest: { op: '&&' | '||'; p: Pipeline }[]; line: number; text: string }

export class SyntaxError_ extends Error {
  constructor(message: string, public line: number, public hint: string) { super(message); }
}

type Tok =
  | { k: 'word'; w: Word; start: number; end: number; line: number }
  | { k: 'op'; op: string; start: number; end: number; line: number };

const OPS = ['2>&1', '2>>', '&&', '||', '>>', '&>', '2>', '|', ';', '&', '>', '<', '(', ')', '\n'];

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1;
  const fail = (msg: string, hint: string): never => { throw new SyntaxError_(msg, line, hint); };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    // 2> は、単語の始まりにある 2 のときだけ演算子(file2>x の 2 は名前の一部)
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      toks.push({ k: 'op', op, start: i, end: i + op.length, line });
      if (op === '\n') line++;
      i += op.length;
      continue;
    }
    const start = i, startLine = line;
    const w: Word = [];
    const lit = (s: string, q: 0 | 1 | 2) => {
      const last = w[w.length - 1];
      if (last && last.t === 'lit' && last.q === q) last.s += s; else w.push({ t: 'lit', s, q });
    };
    const variable = (q: 0 | 2) => {
      // $ の直後。$HOME・${HOME}・$? を読む
      const rest = src.slice(i + 1);
      let m: RegExpMatchArray | null;
      if ((m = rest.match(/^\{([A-Za-z_]\w*)\}/))) { w.push({ t: 'var', name: m[1], q }); i += 1 + m[0].length; return; }
      if ((m = rest.match(/^([A-Za-z_]\w*|\?)/))) { w.push({ t: 'var', name: m[1], q }); i += 1 + m[0].length; return; }
      if (rest.startsWith('(')) fail('$( ) is not supported', '$( ) で別のコマンドの出力を埋め込む書き方は、この版ではまだ使えません。');
      lit('$', q); i++;
    };
    while (i < src.length) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || '|;&<>()'.includes(ch)) break;
      if (ch === '\\') {
        if (src[i + 1] === '\n') { i += 2; line++; continue; }
        if (i + 1 < src.length) { lit(src[i + 1], 1); i += 2; continue; }
        i++; continue;
      }
      if (ch === "'") {
        const j = src.indexOf("'", i + 1);
        if (j < 0) fail("unexpected EOF while looking for matching `''", '「\'」で始めた文字列が閉じていません。同じ行の終わりまでに、もう 1 つ「\'」を書いてください。');
        const s = src.slice(i + 1, j);
        line += s.split('\n').length - 1;
        lit(s, 1);
        if (s === '') w.push({ t: 'lit', s: '', q: 1 });
        i = j + 1;
        continue;
      }
      if (ch === '"') {
        i++;
        let empty = true;
        while (i < src.length && src[i] !== '"') {
          empty = false;
          if (src[i] === '\\' && '"\\$`'.includes(src[i + 1] ?? '')) { lit(src[i + 1], 2); i += 2; continue; }
          if (src[i] === '$') { variable(2); continue; }
          if (src[i] === '`') fail('` is not supported', '「`」で別のコマンドの出力を埋め込む書き方は、この版ではまだ使えません。');
          if (src[i] === '\n') line++;
          lit(src[i], 2); i++;
        }
        if (i >= src.length) fail('unexpected EOF while looking for matching `"\'', '「"」で始めた文字列が閉じていません。もう 1 つ「"」を書いてください。');
        if (empty) w.push({ t: 'lit', s: '', q: 2 });
        i++;
        continue;
      }
      if (ch === '$') { variable(0); continue; }
      if (ch === '`') fail('` is not supported', '「`」で別のコマンドの出力を埋め込む書き方は、この版ではまだ使えません。');
      lit(ch, 0); i++;
    }
    toks.push({ k: 'word', w, start, end: i, line: startLine });
  }
  return toks;
}

/** 単語が、引用符なしの決まった文字列か */
export function plain(w: Word): string | null {
  return w.length === 1 && w[0].t === 'lit' && w[0].q === 0 ? w[0].s : null;
}

export function parse(src: string): Item[] {
  const toks = lex(src);
  let p = 0;
  const items: Item[] = [];
  const peek = () => toks[p];
  const isOp = (op: string) => { const t = toks[p]; return t?.k === 'op' && t.op === op; };
  const lineOf = () => toks[Math.min(p, toks.length - 1)]?.line ?? 1;
  const unexpected = (): never => {
    const t = toks[p];
    const shown = !t ? 'newline' : t.k === 'op' ? (t.op === '\n' ? 'newline' : t.op) : src.slice(t.start, t.end);
    let hint = `「${shown === 'newline' ? '行の終わり' : shown}」の置き場所がおかしいです。`;
    if (shown === 'newline') hint = '行の終わりでコマンドが途切れています。| や > や && の後ろに、続きを書いてください。';
    else if (shown === '|' || shown === '&&' || shown === '||' || shown === ';') hint = `「${shown}」の前にコマンドがありません。`;
    else if (shown === '(' || shown === ')') hint = '( ) で囲む書き方は、この版ではまだ使えません。';
    throw new SyntaxError_(`syntax error near unexpected token \`${shown}'`, lineOf(), hint);
  };

  const cmd = (): Cmd => {
    const start = toks[p]?.start ?? src.length;
    const c: Cmd = { words: [], assigns: [], redirs: [], text: '' };
    let end = start;
    for (;;) {
      const t = peek();
      if (!t) break;
      if (t.k === 'word') {
        const s = plain(t.w.slice(0, 1));
        const m = c.words.length === 0 && t.w[0]?.t === 'lit' && t.w[0].q === 0 ? t.w[0].s.match(/^([A-Za-z_]\w*)=/) : null;
        if (m && s !== null) {
          // x=5 のような代入。= の後ろが値
          const first = t.w[0] as Part & { t: 'lit' };
          const value: Word = [{ ...first, s: first.s.slice(m[0].length) }, ...t.w.slice(1)];
          c.assigns.push({ name: m[1], value });
        } else c.words.push(t.w);
        end = t.end; p++;
        continue;
      }
      if (['>', '>>', '<', '2>', '2>>', '&>'].includes(t.op)) {
        p++;
        const target = peek();
        if (!target || target.k !== 'word') unexpected();
        c.redirs.push({ op: t.op as RedirOp, target: (target as Tok & { k: 'word' }).w });
        end = target!.end; p++;
        continue;
      }
      if (t.op === '2>&1') { c.redirs.push({ op: '2>&1' }); end = t.end; p++; continue; }
      break;
    }
    if (c.words.length === 0 && c.assigns.length === 0 && c.redirs.length === 0) unexpected();
    c.text = src.slice(start, end);
    return c;
  };

  const pipeline = (): Pipeline => {
    const start = toks[p]?.start ?? src.length;
    const cmds = [cmd()];
    while (isOp('|')) {
      p++;
      while (isOp('\n')) p++;
      cmds.push(cmd());
    }
    return { cmds, text: src.slice(start, toks[p - 1].end) };
  };

  while (p < toks.length) {
    if (isOp('\n') || isOp(';')) { if (isOp(';') && items.length === 0) unexpected(); p++; continue; }
    const line = peek().line;
    const start = peek().start;
    const first = pipeline();
    const rest: Item['rest'] = [];
    while (isOp('&&') || isOp('||')) {
      const op = (peek() as { op: string }).op as '&&' | '||';
      p++;
      while (isOp('\n')) p++;
      rest.push({ op, p: pipeline() });
    }
    items.push({ first, rest, line, text: src.slice(start, toks[p - 1].end) });
    const t = peek();
    if (!t) break;
    if (t.k === 'op' && t.op === '&') throw new SyntaxError_('background jobs are not supported', t.line, '「&」で裏で動かす書き方は、この版では使えません(「&&」と間違えていませんか)。');
    if (t.k === 'op' && (t.op === '\n' || t.op === ';')) { p++; continue; }
    unexpected();
  }
  return items;
}
