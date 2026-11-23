// シェル本体。行を読み、単語を展開し、リダイレクトとパイプをつないでコマンドを動かす
import { Fs, FsError, permText, sizeOf, byName, type FileNode, type FsSpec, type Node } from './fs';
import { parse, SyntaxError_, type Cmd, type Item, type Pipeline, type Word } from './parse';
import { globToRegex, hasGlob, unescapeGlob, similar } from './util';
import { COMMANDS } from './commands';
import { UNSUPPORTED } from './help';

export interface TermChunk { kind: 'cmd' | 'out' | 'err'; text: string }
export interface Stage { text: string; out: string; err: string; code: number }
export interface Note { line: number; msg: string }

/** 図に描くための、ある時点のファイルの一覧 */
export interface FsEntry { path: string; name: string; depth: number; kind: 'file' | 'dir'; perm: string; owner: string; size: number; mtime: number; text?: string }
export interface Step { line: number; text: string; cwd: string; fs: FsEntry[]; stages: Stage[]; term: number; code: number }

export interface RunOptions {
  fs?: FsSpec;
  user?: string;
  /** 始めにいる場所。省略するとホーム */
  cwd?: string;
  /** 1 行ごとのファイルの様子を残す */
  trace?: boolean;
}

export interface RunResult {
  /** 文法の誤りがなく、どのコマンドも終了コード 0 で終わった */
  ok: boolean;
  stdout: string;
  stderr: string;
  /** 画面に出た文字(標準出力とエラーを出た順に混ぜたもの。コマンドの行は含めない) */
  screen: string;
  term: TermChunk[];
  exitCode: number;
  notes: Note[];
  error?: { line: number; message: string; hint: string };
  trace: Step[];
  fs: Fs;
  cwd: string;
}

export interface Ctx {
  sh: Shell;
  name: string;
  args: string[];
  /** 前のコマンドやファイルからの入力。null はキーボード(このサイトでは何も来ない) */
  stdin: string | null;
  /** 出力が画面に直接出るか(ls の並べ方が変わる) */
  tty: boolean;
  /** 出力先のファイル(cat a >> a を見つけるため) */
  outNode: FileNode | null;
  out(s: string): void;
  err(s: string): void;
  note(msg: string): void;
}

export type CmdFn = (c: Ctx) => number;

const MAX_OUT = 200_000;
class StopError extends Error {}

type Dest = { k: 'term' } | { k: 'pipe' } | { k: 'null' } | { k: 'file'; node: FileNode };

export class Shell {
  fs: Fs;
  cwd: string;
  oldpwd: string;
  vars = new Map<string, string>();
  last = 0;
  term: TermChunk[] = [];
  stdout = '';
  stderr = '';
  notes: Note[] = [];
  line = 0;
  private outSize = 0;
  private failures = 0;

  constructor(fs: Fs, cwd?: string) {
    this.fs = fs;
    this.cwd = cwd ?? fs.home;
    this.oldpwd = this.cwd;
  }

  get user() { return this.fs.user; }

  /** 端末の行頭に出る印(you@michi:~$) */
  prompt(): string {
    const h = this.fs.home;
    const where = this.cwd === h ? '~' : this.cwd.startsWith(h + '/') ? '~' + this.cwd.slice(h.length) : this.cwd;
    return `${this.user}@michi:${where}${this.user === 'root' ? '#' : '$'}`;
  }

  note(msg: string) {
    if (!this.notes.some((n) => n.line === this.line && n.msg === msg)) this.notes.push({ line: this.line, msg });
  }

  getVar(name: string): string {
    switch (name) {
      case 'HOME': return this.fs.home;
      case 'USER': return this.user;
      case 'PWD': return this.cwd;
      case 'OLDPWD': return this.oldpwd;
      case '?': return String(this.last);
      default: return this.vars.get(name) ?? '';
    }
  }

  /** 道のりを、いまいる場所からの絶対パスにする */
  abs(path: string): string { return this.fs.normalize(path, this.cwd); }
  lookup(path: string): Node { return this.fs.lookup(path, this.cwd); }

  /** 実行する。trace なら 1 行ごとの様子を残す */
  exec(src: string, trace = false): { steps: Step[]; error?: RunResult['error'] } {
    const steps: Step[] = [];
    let items: Item[];
    try {
      items = parse(src);
    } catch (e) {
      if (!(e instanceof SyntaxError_)) throw e;
      const msg = `bash: line ${e.line}: ${e.message}`;
      this.term.push({ kind: 'cmd', text: `${this.prompt()} ${src.replace(/\n$/, '')}` });
      this.term.push({ kind: 'err', text: msg + '\n' });
      this.stderr += msg + '\n';
      this.last = 2;
      this.failures++;
      return { steps, error: { line: e.line, message: msg, hint: e.hint } };
    }
    if (trace) steps.push(this.step(0, '', []));
    try {
      for (const it of items) {
        this.line = it.line;
        this.term.push({ kind: 'cmd', text: `${this.prompt()} ${it.text}` });
        const stages: Stage[] = [];
        let r = this.pipeline(it.first, stages);
        for (const x of it.rest) {
          if ((x.op === '&&') === (r === 0)) r = this.pipeline(x.p, stages);
        }
        this.last = r;
        if (r !== 0) this.failures++;
        if (trace) steps.push(this.step(it.line, it.text, stages));
      }
    } catch (e) {
      if (!(e instanceof StopError)) throw e;
      const msg = `出力が多すぎるため(${MAX_OUT.toLocaleString()} 文字)止めました。`;
      this.term.push({ kind: 'err', text: msg + '\n' });
      this.failures++;
      if (trace) steps.push(this.step(this.line, '', []));
      return { steps, error: { line: this.line, message: msg, hint: '出力を head で減らすか、ファイルに書き出してください。' } };
    }
    return { steps };
  }

  get ok() { return this.failures === 0; }

  private step(line: number, text: string, stages: Stage[]): Step {
    return { line, text, cwd: this.cwd, fs: snapshot(this.fs), stages, term: this.term.length, code: this.last };
  }

  private pipeline(pl: Pipeline, stages: Stage[]): number {
    let input: string | null = null;
    let code = 0;
    pl.cmds.forEach((c, i) => {
      const r = this.command(c, input, i === pl.cmds.length - 1, stages);
      input = r.piped;
      code = r.code;
    });
    return code;
  }

  // ───── 展開 ─────
  /** 単語を展開する。~ と変数を置き換え、引用符の外の * などをファイル名に広げる */
  expand(w: Word): string[] {
    type F = { s: string; pat: string; real: boolean };
    const fields: F[] = [];
    let cur: F | null = null;
    const ensure = () => (cur ??= (fields.push({ s: '', pat: '', real: false }), fields[fields.length - 1]));
    const escapeGlob = (s: string) => s.replace(/[*?[\]\\]/g, '\\$&');
    w.forEach((part, idx) => {
      if (part.t === 'lit') {
        let s = part.s;
        const f = ensure();
        if (part.q === 0 && idx === 0 && (s === '~' || s.startsWith('~/'))) {
          f.s += this.fs.home; f.pat += escapeGlob(this.fs.home);
          s = s.slice(1);
        }
        f.s += s;
        f.pat += part.q === 0 ? s : escapeGlob(s);
        f.real = true;
        return;
      }
      const v = this.getVar(part.name);
      if (part.q === 2) { const f = ensure(); f.s += v; f.pat += escapeGlob(v); f.real = true; return; }
      // 引用符のない変数は、空白で区切って別々の単語になる
      const pieces = v.split(/[ \t\n]+/);
      pieces.forEach((piece, j) => {
        if (j > 0) cur = null;
        if (piece === '' && (j === 0 || j === pieces.length - 1)) return;
        const f = ensure();
        f.s += piece; f.pat += piece; f.real = true;
      });
    });
    const out: string[] = [];
    for (const f of fields) {
      if (!f.real) continue;
      if (hasGlob(f.pat)) {
        const m = this.glob(f.pat);
        if (m.length > 0) { out.push(...m); continue; }
        out.push(unescapeGlob(f.pat));
        continue;
      }
      out.push(f.s);
    }
    return out;
  }

  /** ワイルドカードに合う道のりを、名前の順に返す。. で始まる名前は、パターンも . で始まるときだけ合う */
  glob(pat: string): string[] {
    const isAbs = pat.startsWith('/');
    const comps = pat.split('/').filter((c, i, a) => c !== '' || i === a.length - 1);
    if (isAbs && comps[0] === '') comps.shift();
    let cur: { prefix: string; node: Node }[] = [{ prefix: isAbs ? '/' : '', node: isAbs ? this.fs.root : this.fs.tryLookup('.', this.cwd)! }];
    if (!cur[0].node) return [];
    for (let ci = 0; ci < comps.length; ci++) {
      const comp = comps[ci];
      const last = ci === comps.length - 1;
      const next: typeof cur = [];
      for (const r of cur) {
        const n = r.node;
        if (n.kind !== 'dir' || !this.fs.canExec(n)) continue;
        if (comp === '') { next.push({ prefix: r.prefix, node: n }); continue; }
        const join = (name: string, child: Node) => next.push({ prefix: r.prefix + name + (last ? '' : '/'), node: child });
        if (!hasGlob(comp)) {
          const name = unescapeGlob(comp);
          const child = name === '.' ? n : name === '..' ? n.parent ?? n : n.children.get(name);
          if (child) join(name, child);
          continue;
        }
        if (!this.fs.canRead(n)) continue;
        const re = globToRegex(comp);
        for (const name of [...n.children.keys()].sort(byName)) {
          if (name.startsWith('.') && !comp.startsWith('.')) continue;
          if (re.test(name)) join(name, n.children.get(name)!);
        }
      }
      cur = next;
    }
    return cur.map((r) => r.prefix).filter((p) => p !== '').sort(byName);
  }

  // ───── 1 つのコマンド ─────
  private command(c: Cmd, stdin: string | null, isLast: boolean, stages: Stage[]): { code: number; piped: string | null } {
    const stage: Stage = { text: c.text, out: '', err: '', code: 0 };
    stages.push(stage);
    let piped = '';
    let outDest: Dest = isLast ? { k: 'term' } : { k: 'pipe' };
    let errDest: Dest = { k: 'term' };
    const write = (d: Dest, s: string, isErr: boolean) => {
      if (s === '') return;
      this.outSize += s.length;
      if (this.outSize > MAX_OUT) throw new StopError();
      if (isErr) stage.err += s; else stage.out += s;
      switch (d.k) {
        case 'term': {
          const kind = isErr ? 'err' : 'out';
          const lastChunk = this.term[this.term.length - 1];
          if (lastChunk?.kind === kind) lastChunk.text += s; else this.term.push({ kind, text: s });
          if (isErr) this.stderr += s; else this.stdout += s;
          break;
        }
        case 'pipe': piped += s; break;
        case 'file': d.node.content += s; break;
        case 'null': break;
      }
    };
    const fail = (msg: string, code = 1) => { write(errDest, msg + '\n', true); stage.code = code; return { code, piped: isLast ? null : '' }; };

    // リダイレクトは、コマンドを動かす前に左から順に開く(sort f > f で f が空になるのはこのため)
    for (const r of c.redirs) {
      if (r.op === '2>&1') { errDest = outDest; continue; }
      const t = this.expand(r.target!);
      const shown = t.join(' ') || "''";
      if (t.length !== 1) return fail(`bash: ${shown}: ambiguous redirect`);
      const path = t[0];
      if (r.op === '<') {
        try { stdin = this.fs.readFile(path, this.cwd); } catch (e) {
          if (e instanceof FsError) { this.noteFsError(e, path, 'リダイレクト「<」で読む'); return fail(`bash: ${path}: ${e.message}`); }
          throw e;
        }
        continue;
      }
      let d: Dest;
      if (path === '/dev/null') d = { k: 'null' };
      else {
        try { d = { k: 'file', node: this.fs.writeFile(path, this.cwd, '', r.op.endsWith('>>')) }; } catch (e) {
          if (e instanceof FsError) { this.noteFsError(e, path, 'リダイレクトで書く'); return fail(`bash: ${path}: ${e.message}`); }
          throw e;
        }
      }
      if (r.op === '>' || r.op === '>>') outDest = d;
      else if (r.op === '&>') { outDest = d; errDest = d; } else errDest = d;
    }

    const argv = c.words.flatMap((w) => this.expand(w));
    const assigns = c.assigns.map((a) => [a.name, this.expand(a.value).join(' ')] as const);
    if (argv.length === 0) {
      for (const [k, v] of assigns) this.vars.set(k, v);
      return { code: 0, piped: isLast ? null : '' };
    }
    const name = argv[0];
    const fn = COMMANDS[name];
    if (!fn) {
      this.noteUnknown(name);
      return fail(`bash: ${name}: command not found`, 127);
    }
    const ctx: Ctx = {
      sh: this, name, args: argv.slice(1), stdin, tty: outDest.k === 'term',
      outNode: outDest.k === 'file' ? outDest.node : null,
      out: (s) => write(outDest, s, false),
      err: (s) => write(errDest, s, true),
      note: (m) => this.note(m),
    };
    const code = fn(ctx);
    stage.code = code;
    if (outDest.k === 'file') outDest.node.mtime = this.fs.tick();
    return { code, piped: outDest.k === 'pipe' ? piped : isLast ? null : '' };
  }

  private noteUnknown(name: string) {
    const u = UNSUPPORTED[name];
    if (u) { this.note(u); return; }
    if (name.includes('/')) { this.note(`「${name}」のようにファイルを実行する書き方は、この版ではまだ使えません。`); return; }
    const near = similar(name, Object.keys(COMMANDS));
    if (near.length) this.note(`「${name}」というコマンドはありません。打ち間違いなら「${near.join('」「')}」ではありませんか。`);
    else this.note(`「${name}」というコマンドはありません。このサイトで使えるコマンドは「help」で一覧できます。`);
  }

  /** ファイルの誤りに、日本語の説明を添える */
  noteFsError(e: FsError, path: string, what = '') {
    const head = what ? `${what}とき、` : '';
    if (e.code === 'noent') {
      const abs = this.abs(path);
      const dir = abs.slice(0, abs.lastIndexOf('/')) || '/';
      const base = abs.slice(abs.lastIndexOf('/') + 1);
      const d = this.fs.tryLookup(dir, '/');
      if (d?.kind === 'dir' && this.fs.canRead(d)) {
        const near = similar(base, [...d.children.keys()]);
        if (near.length) { this.note(`${head}「${path}」が見つかりませんでした。「${near.join('」「')}」の打ち間違いではありませんか。`); return; }
        this.note(`${head}「${path}」が見つかりませんでした。いまいる場所は ${this.cwd} です。ls で、そこに何があるかを確かめてください。`);
      } else {
        this.note(`${head}「${path}」までの途中のディレクトリがありません。いまいる場所は ${this.cwd} です。`);
      }
    } else if (e.code === 'perm') {
      this.note(`${head}「${path}」を扱う権限がありません。ls -l で、持ち主と rwx の印を確かめてください。`);
    } else if (e.code === 'isdir') {
      this.note(`「${path}」はディレクトリです。中身を見るなら ls を使います。`);
    } else if (e.code === 'notdir') {
      this.note(`「${path}」の途中に、ディレクトリではなくファイルがあります。`);
    }
  }

  result(error?: RunResult['error'], steps: Step[] = []): RunResult {
    const screen = this.term.filter((t) => t.kind !== 'cmd').map((t) => t.text).join('');
    return { ok: !error && this.ok, stdout: this.stdout, stderr: this.stderr, screen, term: this.term, exitCode: this.last, notes: this.notes, error, trace: steps, fs: this.fs, cwd: this.cwd };
  }
}

export function snapshot(fs: Fs): FsEntry[] {
  const out: FsEntry[] = [];
  const walk = (n: Node, depth: number) => {
    const path = fs.pathOf(n);
    out.push({
      path, name: n.name || '/', depth, kind: n.kind, perm: permText(n), owner: n.owner, size: sizeOf(n), mtime: n.mtime,
      text: n.kind === 'file' ? n.content.slice(0, 4000) : undefined,
    });
    if (n.kind === 'dir') for (const k of [...n.children.keys()].sort(byName)) walk(n.children.get(k)!, depth + 1);
  };
  walk(fs.root, 0);
  return out;
}

/** 台本を最初から実行する。教材と採点はこれを使う */
export function run(script: string, opts: RunOptions = {}): RunResult {
  const fs = Fs.fromSpec(opts.fs ?? {}, opts.user);
  const sh = new Shell(fs, opts.cwd);
  const { steps, error } = sh.exec(script, opts.trace);
  return sh.result(error, steps);
}
