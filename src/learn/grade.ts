// 問題の具体化(値の差し替え)と採点。正解はすべてシェルで実行して求める
import type { Check, Params, Problem, TestCase } from '../content/types';
import { run, snapshot, type RunResult } from '../shell/shell';
import type { Fs, FsSpec } from '../shell/fs';
import { rng } from './engine';

/** 値を差し替えた問題。$a のような印を、種から決まる値に置き換える(ファイルの名前と中身も) */
export function instantiate(p: Problem, seed: number): Problem {
  if (!p.params) return p;
  const r = rng(seed);
  const vals: Record<string, string> = {};
  for (const [k, spec] of Object.entries(p.params as Params)) {
    if (typeof spec[0] === 'number') {
      const [lo, hi] = spec as [number, number];
      vals[k] = String(lo + Math.floor(r() * (hi - lo + 1)));
    } else {
      const arr = spec as string[];
      vals[k] = arr[Math.floor(r() * arr.length)];
    }
  }
  // $HOME のようなシェルの変数は大文字なので、小文字で始まる印だけを置き換える
  const sub = (s: string) => s.replace(/\$([a-z]\w*)/g, (m, k) => (k in vals ? vals[k] : m));
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return sub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [sub(k), walk(x)]));
    return v;
  };
  return walk(p) as Problem;
}

/** 出力を比べる。中身が同じで、行末の空白や最後の改行だけが違うときは「書式の違い」として区別する */
export function compareOutput(got: string, want: string): 'same' | 'format' | 'different' {
  if (got === want) return 'same';
  const norm = (s: string) => s.replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  if (norm(got) === norm(want)) return 'format';
  return 'different';
}

export interface TestResult {
  fs: FsSpec;
  want: string;
  got: string;
  verdict: 'same' | 'format' | 'different' | 'error';
  /** 終わったときのファイルの違い(日本語の説明) */
  fsDiff: string[];
  cwd?: { want: string; got: string };
  run: RunResult;
  hidden?: boolean;
}

export interface Grade {
  ok: boolean;
  /** 書式だけが違う(正解として扱い、注意を添える) */
  formatOnly?: boolean;
  tests?: TestResult[];
  message?: string;
}

const short = (path: string) => path.replace(/^\/home\/you(?=\/|$)/, '~');

/** 2 つのファイルシステムの違いを、日本語の文の並びにする */
export function fsDiff(want: Fs, got: Fs): string[] {
  const dump = (fs: Fs) => new Map(snapshot(fs).map((e) => [e.path, e]));
  const w = dump(want), g = dump(got);
  const out: string[] = [];
  for (const [path, e] of w) {
    const x = g.get(path);
    if (!x) { out.push(`「${short(path)}」が${e.kind === 'dir' ? '(ディレクトリとして)' : ''}ありません。`); continue; }
    if (x.kind !== e.kind) { out.push(`「${short(path)}」は${e.kind === 'dir' ? 'ディレクトリ' : 'ファイル'}のはずです。`); continue; }
    if (x.perm !== e.perm) out.push(`「${short(path)}」の権限が違います(期待: ${e.perm}、あなた: ${x.perm})。`);
    if (e.kind === 'file' && x.text !== e.text) out.push(`「${short(path)}」の中身が違います。`);
  }
  for (const [path] of g) if (!w.has(path)) out.push(`「${short(path)}」は、ないはずです。`);
  return out;
}

const refCache = new Map<string, RunResult>();

function reference(ref: string, fs: FsSpec, cwd?: string): RunResult {
  const key = ref + '\u0000' + JSON.stringify(fs) + '\u0000' + (cwd ?? '');
  let v = refCache.get(key);
  if (!v) {
    v = run(ref, { fs, cwd });
    if (v.error) throw new Error(`参照解が実行できません: ${v.error.message}`);
    refCache.set(key, v);
  }
  return v;
}

export function runTests(code: string, ref: string, p: { fs?: FsSpec; cwd?: string; tests: TestCase[]; check?: Check[] }): Grade {
  const check = p.check ?? ['out'];
  const tests = p.tests.length ? p.tests : [{}];
  const results: TestResult[] = tests.map((t) => {
    const fs = t.fs ?? p.fs ?? {};
    const want = reference(ref, fs, p.cwd);
    const r = run(code, { fs, cwd: p.cwd, trace: true });
    let verdict: TestResult['verdict'] = r.error ? 'error' : check.includes('out') ? compareOutput(r.stdout, want.stdout) : 'same';
    const diff = check.includes('fs') && !r.error ? fsDiff(want.fs, r.fs) : [];
    const cwd = check.includes('cwd') && want.cwd !== r.cwd ? { want: want.cwd, got: r.cwd } : undefined;
    if (verdict !== 'error' && (diff.length > 0 || cwd)) verdict = 'different';
    return { fs, want: want.stdout, got: r.stdout, verdict, fsDiff: diff, cwd, run: r, hidden: t.hidden };
  });
  const passed = results.every((t) => t.verdict === 'same' || t.verdict === 'format');
  return { ok: passed, formatOnly: passed && results.some((t) => t.verdict === 'format'), tests: results };
}

/** 参照解のコマンド。並べ替えと穴埋めは、正しい答えを組み立てたもの */
export function referenceCode(p: Problem): string {
  switch (p.type) {
    case 'parsons': return p.lines.join('\n') + '\n';
    case 'fill': return fillBlanks(p.code, p.answers);
    case 'write': return p.solution;
    case 'predict': return p.code;
    default: return '';
  }
}

export function fillBlanks(code: string, answers: string[]): string {
  let i = 0;
  return code.replace(/___/g, () => answers[i++] ?? '');
}

/** 予測の答えを比べる。改行の有無や行末の空白の違いは許す */
export function checkPredict(answer: string, actual: string): boolean {
  const norm = (s: string) => s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ $/gm, '').replace(/\n+$/, '').replace(/^\n+/, '');
  return norm(answer) === norm(actual);
}
