// コマンドの実装で共通に使う小さな道具

/** ワイルドカード(* ? [abc])の 1 区切りぶんを正規表現にする。\ で始まる文字はそのままの文字 */
export function globToRegex(pat: string): RegExp {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\' && i + 1 < pat.length) { re += esc(pat[++i]); continue; }
    if (c === '*') { re += '.*'; continue; }
    if (c === '?') { re += '.'; continue; }
    if (c === '[') {
      const j = pat.indexOf(']', i + 2);
      if (j > 0) {
        let body = pat.slice(i + 1, j);
        const neg = body[0] === '!' || body[0] === '^';
        if (neg) body = body.slice(1);
        re += `[${neg ? '^' : ''}${body.replace(/[\\\]]/g, '\\$&')}]`;
        i = j;
        continue;
      }
    }
    re += esc(c);
  }
  return new RegExp(`^${re}$`, 's');
}

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** \ を外さないままで、ワイルドカードの文字を含むか */
export function hasGlob(pat: string): boolean {
  for (let i = 0; i < pat.length; i++) {
    if (pat[i] === '\\') { i++; continue; }
    if ('*?['.includes(pat[i])) return true;
  }
  return false;
}

export const unescapeGlob = (pat: string) => pat.replace(/\\(.)/g, '$1');

/**
 * grep の正規表現を JS の正規表現に直す。
 * 基本(BRE)では + ? | ( ) { } は普通の文字で、\+ のように書くと特別な意味になる。-E(ERE)ではその逆
 */
export function grepRegex(pat: string, ext: boolean): string {
  let out = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\' && i + 1 < pat.length) {
      const n = pat[++i];
      if (!ext && '+?|(){}'.includes(n)) out += n;
      else if (n === '<' || n === '>') out += '\\b';
      else out += '\\' + n;
      continue;
    }
    if (c === '[') {
      // [] の中はそのまま写す。[[:digit:]] のような名前付きの組も直す
      const j = findClassEnd(pat, i);
      if (j > 0) { out += classToJs(pat.slice(i, j + 1)); i = j; continue; }
    }
    if (!ext && '+?|(){}'.includes(c)) { out += '\\' + c; continue; }
    if (c === '/') { out += '\\/'; continue; }
    out += c;
  }
  return out;
}

function findClassEnd(p: string, i: number): number {
  let j = i + 1;
  if (p[j] === '^') j++;
  if (p[j] === ']') j++;
  while (j < p.length) {
    if (p.startsWith('[:', j)) { const k = p.indexOf(':]', j + 2); if (k > 0) { j = k + 2; continue; } }
    if (p[j] === ']') return j;
    j++;
  }
  return -1;
}

const CLASSES: Record<string, string> = {
  alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z',
  space: ' \\t\\n\\r\\f\\v', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f',
};

/** [] の組を JS の形にする。POSIX では [] の中の \ は普通の文字なので、JS 向けに逃がす */
function classToJs(cls: string): string {
  const inner = cls.slice(1, -1);
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner.startsWith('[:', i)) {
      const k = inner.indexOf(':]', i + 2);
      const name = inner.slice(i + 2, k);
      if (k > 0 && CLASSES[name]) { out += CLASSES[name]; i = k + 1; continue; }
    }
    const c = inner[i];
    const first = i === 0 || (i === 1 && inner[0] === '^');
    if (c === '\\' || c === '[' || (c === ']' && first)) out += '\\' + c;
    else out += c;
  }
  return `[${out}]`;
}

/** 端末で何文字ぶんの幅になるか(日本語などの全角は 2) */
export function width(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w += (c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || c >= 0x1f300)) ? 2 : 1;
  }
  return w;
}

/** 似た名前を探す(打ち間違いの候補)。距離 2 以内か、大文字小文字だけが違うもの */
export function similar(name: string, candidates: string[]): string[] {
  return candidates
    .map((c) => ({ c, d: c.toLowerCase() === name.toLowerCase() ? 0 : dist(name, c) }))
    .filter((x) => x.d <= (name.length <= 3 ? 1 : 2))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.c)
    .slice(0, 3);
}

function dist(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

/** 行に分ける。最後の改行の後ろは行として数えない(本物の wc や head と同じ数え方) */
export function lines(text: string): string[] {
  if (text === '') return [];
  const ls = text.split('\n');
  if (ls[ls.length - 1] === '') ls.pop();
  return ls;
}

/** 行を戻す。元の文字列が改行で終わっていなかった最後の行には、改行を付けない */
export function unlines(ls: string[], endsWithNewline = true): string {
  if (ls.length === 0) return '';
  return ls.join('\n') + (endsWithNewline ? '\n' : '');
}
