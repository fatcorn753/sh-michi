// コマンドの実装。出力の形と英語のエラー文は、本物(GNU coreutils・LANG=C)にそろえる
import { Fs, FsError, permText, sizeOf, byName, type DirNode, type Node } from './fs';
import type { CmdFn, Ctx } from './shell';
import { esc, globToRegex, grepRegex, lines, width } from './util';
import { MAN } from './help';

type Opts = Record<string, string | true>;

/** オプションを読む。-la のようにまとめた書き方と、名前の後ろに置いたオプションも受け付ける */
function getopts(c: Ctx, flags: string, withArg = ''): { o: Opts; rest: string[] } | null {
  const o: Opts = {};
  const rest: string[] = [];
  const a = c.args;
  for (let i = 0; i < a.length; i++) {
    const s = a[i];
    if (s === '--') { rest.push(...a.slice(i + 1)); break; }
    if (s.startsWith('--')) {
      c.err(`${c.name}: unrecognized option '${s}'\n`);
      c.note(`「${s}」のような長い名前のオプションは、この版では使えません。「man ${c.name}」で使えるオプションを確かめてください。`);
      return null;
    }
    if (s.length < 2 || s[0] !== '-') { rest.push(s); continue; }
    for (let j = 1; j < s.length; j++) {
      const ch = s[j];
      if (withArg.includes(ch)) {
        const v = j + 1 < s.length ? s.slice(j + 1) : a[++i];
        if (v === undefined) {
          c.err(`${c.name}: option requires an argument -- '${ch}'\n`);
          c.note(`「-${ch}」の後ろには値が要ります(例: -${ch} ${ch === 'n' ? '5' : '…'})。`);
          return null;
        }
        o[ch] = v;
        break;
      }
      if (!flags.includes(ch)) {
        c.err(`${c.name}: invalid option -- '${ch}'\n`);
        c.note(`${c.name} に「-${ch}」というオプションはありません(この版で使えるのは ${[...flags, ...withArg].map((x) => '-' + x).join(' ') || 'なし'})。`);
        return null;
      }
      o[ch] = true;
    }
  }
  return { o, rest };
}

/** ファイルの誤りを、本物と同じ英語と日本語の説明で出す */
function fsFail(c: Ctx, e: unknown, path: string, fmt: (msg: string) => string): void {
  if (!(e instanceof FsError)) throw e;
  c.err(fmt(e.message) + '\n');
  c.sh.noteFsError(e, path);
}

/** 入力を読む。ファイル名がなければ前のコマンドからの入力 */
function inputs(c: Ctx, files: string[], each: (text: string, name: string) => void): number {
  if (files.length === 0) files = ['-'];
  let code = 0;
  for (const f of files) {
    if (f === '-') {
      if (c.stdin === null) c.note(`${c.name} にファイル名を渡していないので、本物ではキーボードからの入力を待ち続けます(Ctrl + D で終わり)。このサイトでは、入力なしとして終わらせました。`);
      each(c.stdin ?? '', '(standard input)');
      continue;
    }
    try { each(c.sh.fs.readFile(f, c.sh.cwd), f); } catch (e) {
      fsFail(c, e, f, (m) => `${c.name}: ${f}: ${m}`);
      code = 1;
    }
  }
  return code;
}

const missing = (c: Ctx, what = 'operand') => {
  c.err(`${c.name}: missing ${what}\nTry '${c.name} --help' for more information.\n`);
  c.note(`${c.name} には、扱うファイルやディレクトリの名前を渡してください。`);
  return 1;
};

// ───── 場所 ─────
const pwd: CmdFn = (c) => { c.out(c.sh.cwd + '\n'); return 0; };

const cd: CmdFn = (c) => {
  const sh = c.sh;
  if (c.args.length > 1) { c.err('bash: cd: too many arguments\n'); c.note('cd に渡せる場所は 1 つだけです。名前に空白があるなら "…" で囲みます。'); return 1; }
  let to = c.args[0] ?? sh.fs.home;
  if (to === '-') { to = sh.oldpwd; c.out(to + '\n'); }
  try {
    const n = sh.lookup(to);
    if (n.kind !== 'dir') throw new FsError('notdir');
    if (!sh.fs.canExec(n)) throw new FsError('perm');
    sh.oldpwd = sh.cwd;
    sh.cwd = sh.fs.pathOf(n);
    return 0;
  } catch (e) {
    fsFail(c, e, to, (m) => `bash: cd: ${to}: ${m}`);
    return 1;
  }
};

// ───── 一覧 ─────
function human(n: number): string {
  if (n < 1024) return String(n);
  const u = ['K', 'M', 'G'];
  let v = n, i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))) + u[i];
}

function blocks(n: Node): number { return n.kind === 'dir' ? 4 : Math.ceil(sizeOf(n) / 4096) * 4; }

/** 端末の幅(80 文字)に収まるよう、上から下へ縦に並べる(本物の ls と同じ並べ方) */
function columns(names: string[]): string {
  if (names.length === 0) return '';
  const w = names.map(width);
  for (let cols = names.length; cols >= 1; cols--) {
    const rows = Math.ceil(names.length / cols);
    const used = Math.ceil(names.length / rows);
    if (used !== cols && cols > 1) continue;
    const cw: number[] = [];
    for (let col = 0; col < cols; col++) {
      let m = 0;
      for (let r = 0; r < rows; r++) { const i = col * rows + r; if (i < names.length) m = Math.max(m, w[i]); }
      cw.push(m);
    }
    const total = cw.reduce((a, b) => a + b, 0) + 2 * (cols - 1);
    if (total > 80 && cols > 1) continue;
    let s = '';
    for (let r = 0; r < rows; r++) {
      const parts: string[] = [];
      for (let col = 0; col < cols; col++) {
        const i = col * rows + r;
        if (i >= names.length) break;
        const lastInRow = col === cols - 1 || (col + 1) * rows + r >= names.length;
        parts.push(lastInRow ? names[i] : names[i] + ' '.repeat(cw[col] - w[i] + 2));
      }
      s += parts.join('') + '\n';
    }
    return s;
  }
  return names.join('\n') + '\n';
}

const ls: CmdFn = (c) => {
  const p = getopts(c, 'laA1RhdrtSF');
  if (!p) return 2;
  const { o } = p;
  const fs = c.sh.fs;
  const ops = p.rest.length ? p.rest : ['.'];
  let code = 0;
  const files: { name: string; n: Node }[] = [];
  const dirs: { name: string; n: DirNode }[] = [];
  for (const name of ops) {
    try {
      const n = c.sh.lookup(name);
      if (n.kind === 'dir' && !o.d) dirs.push({ name, n }); else files.push({ name, n });
    } catch (e) {
      fsFail(c, e, name, (m) => `ls: cannot access '${name}': ${m}`);
      code = 2;
    }
  }
  const order = (xs: { name: string; n: Node }[]) => {
    xs.sort((a, b) => byName(a.name, b.name));
    if (o.t) xs.sort((a, b) => b.n.mtime - a.n.mtime);
    if (o.S) xs.sort((a, b) => sizeOf(b.n) - sizeOf(a.n));
    if (o.r) xs.reverse();
    return xs;
  };
  const deco = (x: { name: string; n: Node }) => x.name + (o.F ? (x.n.kind === 'dir' ? '/' : (x.n.mode & 0o111) ? '*' : '') : '');
  const render = (xs: { name: string; n: Node }[], total: boolean): string => {
    if (o.l) {
      const rows = xs.map((x) => {
        const links = x.n.kind === 'dir' ? 2 + [...x.n.children.values()].filter((k) => k.kind === 'dir').length : 1;
        return [permText(x.n), String(links), x.n.owner, x.n.group, o.h ? human(sizeOf(x.n)) : String(sizeOf(x.n)), Fs.dateText(x.n.mtime), deco(x)];
      });
      const wd = [1, 2, 3, 4].map((i) => Math.max(0, ...rows.map((r) => r[i].length)));
      let s = total ? `total ${xs.reduce((a, x) => a + (x.name === '.' || x.name === '..' ? 4 : blocks(x.n)), 0)}\n` : '';
      for (const r of rows) s += `${r[0]} ${r[1].padStart(wd[0])} ${r[2].padEnd(wd[1])} ${r[3].padEnd(wd[2])} ${r[4].padStart(wd[3])} ${r[5]} ${r[6]}\n`;
      return s;
    }
    const names = xs.map(deco);
    return o['1'] || !c.tty ? names.map((n) => n + '\n').join('') : columns(names);
  };
  let out = render(order(files), false);
  const listDir = (name: string, n: DirNode, header: boolean) => {
    if (!fs.canRead(n)) {
      c.err(`ls: cannot open directory '${name}': Permission denied\n`);
      c.sh.noteFsError(new FsError('perm'), name);
      code = 2;
      return;
    }
    let xs = [...n.children.values()].map((k) => ({ name: k.name, n: k }));
    if (!o.a && !o.A) xs = xs.filter((x) => !x.name.startsWith('.'));
    xs = order(xs);
    if (o.a) xs = [{ name: '.', n }, { name: '..', n: n.parent ?? n }, ...xs];
    if (out !== '' || header) out += (out !== '' ? '\n' : '') + `${name}:\n`;
    out += render(xs, true);
    if (o.R) {
      for (const x of xs) {
        if (x.n.kind === 'dir' && x.name !== '.' && x.name !== '..') listDir(`${name === '/' ? '' : name}/${x.name}`, x.n, true);
      }
    }
  };
  const many = ops.length > 1 || !!o.R;
  for (const d of order(dirs)) listDir(d.name, d.n as DirNode, many);
  c.out(out);
  return code;
};

// ───── 作る・消す・写す ─────
const mkdir: CmdFn = (c) => {
  const p = getopts(c, 'p');
  if (!p) return 1;
  if (!p.rest.length) return missing(c);
  const fs = c.sh.fs;
  let code = 0;
  for (const name of p.rest) {
    try {
      if (p.o.p) {
        let cur = '';
        for (const part of c.sh.abs(name).split('/').filter(Boolean)) {
          cur += '/' + part;
          const n = fs.tryLookupStrict(cur, '/');
          if (n) { if (n.kind !== 'dir') throw new FsError('exist'); continue; }
          const { dir, name: nm } = fs.parentOf(cur, '/');
          if (!fs.canWrite(dir)) throw new FsError('perm');
          fs.addDir(dir, nm);
        }
        continue;
      }
      if (fs.tryLookupStrict(name, c.sh.cwd)) throw new FsError('exist');
      const { dir, name: nm } = fs.parentOf(name, c.sh.cwd);
      if (!fs.canWrite(dir)) throw new FsError('perm');
      fs.addDir(dir, nm);
    } catch (e) {
      fsFail(c, e, name, (m) => `mkdir: cannot create directory '${name}': ${m}`);
      if (e instanceof FsError && e.code === 'noent') c.note('途中のディレクトリもまとめて作るなら、mkdir -p を使います。');
      if (e instanceof FsError && e.code === 'exist') c.note(`「${name}」はもうあります。`);
      code = 1;
    }
  }
  return code;
};

const touch: CmdFn = (c) => {
  const p = getopts(c, '');
  if (!p) return 1;
  if (!p.rest.length) return missing(c, 'file operand');
  const fs = c.sh.fs;
  let code = 0;
  for (const name of p.rest) {
    try {
      const n = fs.tryLookupStrict(name, c.sh.cwd);
      if (n) { n.mtime = fs.tick(); continue; }
      const { dir, name: nm } = fs.parentOf(name, c.sh.cwd);
      if (!fs.canWrite(dir)) throw new FsError('perm');
      fs.addFile(dir, nm);
    } catch (e) {
      fsFail(c, e, name, (m) => `touch: cannot touch '${name}': ${m}`);
      code = 1;
    }
  }
  return code;
};

/** n が anc の中(anc 自身を含む)にあるか */
function inside(n: Node, anc: Node): boolean {
  for (let x: Node | null = n; x; x = x.parent) if (x === anc) return true;
  return false;
}

const rm: CmdFn = (c) => {
  const p = getopts(c, 'rRf');
  if (!p) return 1;
  const rec = p.o.r || p.o.R, force = p.o.f;
  if (!p.rest.length) return force ? 0 : missing(c);
  const fs = c.sh.fs;
  let code = 0;
  for (const name of p.rest) {
    const base = name.replace(/\/+$/, '').split('/').pop();
    if (base === '.' || base === '..') { c.err(`rm: refusing to remove '.' or '..' directory: skipping '${name}'\n`); code = 1; continue; }
    if (c.sh.abs(name) === '/') { c.err(`rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n`); code = 1; continue; }
    try {
      const n = c.sh.lookup(name);
      if (n.kind === 'dir' && !rec) {
        c.err(`rm: cannot remove '${name}': Is a directory\n`);
        c.note(`ディレクトリを中身ごと消すには rm -r を使います。空のディレクトリなら rmdir でも消せます。`);
        code = 1;
        continue;
      }
      if (!fs.canWrite(n.parent!) || (n.kind === 'dir' && n.children.size > 0 && !fs.canWrite(n))) throw new FsError('perm');
      fs.remove(n);
    } catch (e) {
      if (force && e instanceof FsError && e.code === 'noent') continue;
      fsFail(c, e, name, (m) => `rm: cannot remove '${name}': ${m}`);
      code = 1;
    }
  }
  return code;
};

const rmdir: CmdFn = (c) => {
  const p = getopts(c, '');
  if (!p) return 1;
  if (!p.rest.length) return missing(c);
  let code = 0;
  for (const name of p.rest) {
    try {
      const n = c.sh.lookup(name);
      if (n.kind !== 'dir') throw new FsError('notdir');
      if (n.children.size > 0) {
        c.err(`rmdir: failed to remove '${name}': Directory not empty\n`);
        c.note(`rmdir で消せるのは空のディレクトリだけです。中身ごと消すなら rm -r を使います(元に戻せないので、先に ls で中身を確かめます)。`);
        code = 1;
        continue;
      }
      if (!c.sh.fs.canWrite(n.parent!)) throw new FsError('perm');
      c.sh.fs.remove(n);
    } catch (e) {
      fsFail(c, e, name, (m) => `rmdir: failed to remove '${name}': ${m}`);
      code = 1;
    }
  }
  return code;
};

/** cp と mv の共通部分。行き先がディレクトリなら、その中へ同じ名前で置く */
function transfer(c: Ctx, move: boolean): number {
  const p = getopts(c, move ? '' : 'rR');
  if (!p) return 1;
  const fs = c.sh.fs;
  const ops = p.rest;
  if (ops.length < 2) return missing(c, ops.length ? `destination file operand after '${ops[0]}'` : 'file operand');
  const dst = ops[ops.length - 1];
  const srcs = ops.slice(0, -1);
  const dn = fs.tryLookup(dst, c.sh.cwd);
  if (srcs.length > 1 && dn?.kind !== 'dir') {
    c.err(`${c.name}: target '${dst}' is not a directory\n`);
    c.note(`いくつものファイルを${move ? '動かす' : '写す'}ときは、最後に行き先のディレクトリを書きます。`);
    return 1;
  }
  let code = 0;
  for (const s of srcs) {
    try {
      const sn = c.sh.lookup(s);
      if (!move && sn.kind === 'dir' && !(p.o.r || p.o.R)) {
        c.err(`cp: -r not specified; omitting directory '${s}'\n`);
        c.note('ディレクトリを中身ごと写すには cp -r を使います。');
        code = 1;
        continue;
      }
      const base = c.sh.abs(s).split('/').pop()!;
      const target = dn?.kind === 'dir' ? `${c.sh.abs(dst)}/${base}` : c.sh.abs(dst);
      const tn = fs.tryLookupStrict(target, '/');
      if (tn === sn) { c.err(`${c.name}: '${s}' and '${dst}' are the same file\n`); code = 1; continue; }
      const shownTarget = dn?.kind === 'dir' ? `${dst.replace(/\/$/, '')}/${base}` : dst;
      const into = fs.tryLookup(target.slice(0, target.lastIndexOf('/')) || '/', '/');
      if (sn.kind === 'dir' && into && inside(into, sn)) {
        c.err(move ? `mv: cannot move '${s}' to a subdirectory of itself, '${shownTarget}'\n` : `cp: cannot copy a directory, '${s}', into itself, '${shownTarget}'\n`);
        code = 1;
        continue;
      }
      if (sn.kind === 'file' && !move && !fs.canRead(sn)) throw new FsError('perm');
      if (tn?.kind === 'dir') {
        c.err(`${c.name}: cannot overwrite directory '${target}' with non-directory\n`);
        code = 1;
        continue;
      }
      const { dir, name } = fs.parentOf(target, '/');
      if (!fs.canWrite(dir) || (move && !fs.canWrite(sn.parent!))) throw new FsError('perm');
      if (tn && sn.kind === 'file' && tn.kind === 'file' && !move) {
        if (!fs.canWrite(tn)) throw new FsError('perm');
        tn.content = sn.content;
        tn.mtime = fs.tick();
        continue;
      }
      if (tn) fs.remove(tn);
      if (move) {
        fs.remove(sn);
        sn.name = name;
        sn.parent = dir;
        dir.children.set(name, sn);
        dir.mtime = fs.tick();
      } else fs.cloneInto(sn, dir, name);
    } catch (e) {
      fsFail(c, e, s, (m) => move && e instanceof FsError && e.code === 'noent' ? `mv: cannot stat '${s}': ${m}` : `${c.name}: cannot ${move ? 'move' : 'stat'} '${s}': ${m}`);
      code = 1;
    }
  }
  return code;
}

const cp: CmdFn = (c) => transfer(c, false);
const mv: CmdFn = (c) => transfer(c, true);

// ───── 中身を見る ─────
const cat: CmdFn = (c) => {
  const p = getopts(c, 'n');
  if (!p) return 1;
  let n = 0;
  let code = 0;
  for (const f of p.rest.length ? p.rest : ['-']) {
    if (f !== '-' && c.outNode && c.sh.fs.tryLookup(f, c.sh.cwd) === c.outNode) {
      c.err(`cat: ${f}: input file is output file\n`);
      c.note('読んでいるファイルに、同じファイルへの出力を書き足すと終わらなくなるので、cat は止まります。');
      code = 1;
      continue;
    }
    code |= inputs(c, [f], (text) => {
      if (!p.o.n) { c.out(text); return; }
      c.out(text.replace(/[^\n]*\n|[^\n]+$/g, (l) => `${String(++n).padStart(6)}\t${l}`));
    });
  }
  return code;
};

const echo: CmdFn = (c) => {
  let a = c.args, nl = true, e = false;
  while (a.length && /^-[ne]+$/.test(a[0])) {
    if (a[0].includes('n')) nl = false;
    if (a[0].includes('e')) e = true;
    a = a.slice(1);
  }
  let s = a.join(' ');
  if (e) s = s.replace(/\\([nt\\])/g, (_, x) => (x === 'n' ? '\n' : x === 't' ? '\t' : '\\'));
  c.out(s + (nl ? '\n' : ''));
  return 0;
};

/** head と tail。-5 のように数だけ書く古い形も受け付ける */
function headTail(c: Ctx, tail: boolean): number {
  const args = c.args.map((a) => (/^-\d+$/.test(a) ? `-n${a.slice(1)}` : a));
  const p = getopts({ ...c, args }, '', 'n');
  if (!p) return 1;
  const spec = (p.o.n as string | undefined) ?? '10';
  const fromStart = tail && spec.startsWith('+');
  const k = Number(spec.replace(/^[+-]/, ''));
  if (!/^[+-]?\d+$/.test(spec)) {
    c.err(`${c.name}: invalid number of lines: '${spec}'\n`);
    c.note(`-n の後ろには行の数を書きます(例: ${c.name} -n 3 file.txt)。`);
    return 1;
  }
  const files = p.rest.length ? p.rest : ['-'];
  let first = true;
  return inputs(c, files, (text, name) => {
    if (files.length > 1) { c.out(`${first ? '' : '\n'}==> ${name} <==\n`); first = false; }
    const ls = text.split(/(?<=\n)/);
    if (ls[ls.length - 1] === '') ls.pop();
    const pick = !tail ? ls.slice(0, k) : fromStart ? ls.slice(Math.max(0, k - 1)) : k === 0 ? [] : ls.slice(-k);
    c.out(pick.join(''));
  });
}

const head: CmdFn = (c) => headTail(c, false);
const tail: CmdFn = (c) => headTail(c, true);

const wc: CmdFn = (c) => {
  const p = getopts(c, 'lwcm');
  if (!p) return 1;
  let { l, w, c: bytes, m } = p.o;
  if (!l && !w && !bytes && !m) l = w = bytes = true;
  const rows: { n: number[]; name: string | null }[] = [];
  const files = p.rest;
  const code = inputs(c, files, (text, name) => {
    const n: number[] = [];
    if (l) n.push((text.match(/\n/g) ?? []).length);
    if (w) n.push(text.split(/\s+/).filter(Boolean).length);
    if (m) n.push([...text].length);
    if (bytes) n.push(new TextEncoder().encode(text).length);
    rows.push({ n, name: files.length ? name : null });
  });
  if (rows.length > 1) rows.push({ n: rows[0].n.map((_, i) => rows.reduce((a, r) => a + r.n[i], 0)), name: 'total' });
  // 数が 1 つで入力も 1 つなら詰めて書く。そうでなければ、桁をそろえる
  const single = rows.length === 1 && rows[0].n.length === 1;
  const wd = single ? 0 : files.length === 0 ? 7 : Math.max(1, ...rows.flatMap((r) => r.n.map((x) => String(x).length)));
  for (const r of rows) c.out(r.n.map((x) => String(x).padStart(wd)).join(' ') + (r.name !== null ? ` ${r.name}` : '') + '\n');
  return code;
};

// ───── 探す・並べる・数える ─────
const grep: CmdFn = (c) => {
  const p = getopts(c, 'invcrRlhEwoF');
  if (!p) return 2;
  const o = p.o;
  const [pat, ...files0] = p.rest;
  if (pat === undefined) {
    c.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n");
    c.note('grep には、探す文字(パターン)を渡します(例: grep error log.txt)。');
    return 2;
  }
  let src = o.F ? esc(pat) : grepRegex(pat, !!o.E);
  if (o.w) src = `(?<![\\w])(?:${src})(?![\\w])`;
  let re: RegExp;
  try { re = new RegExp(src, o.i ? 'gi' : 'g'); } catch {
    c.err(`grep: Invalid regular expression\n`);
    c.note('パターンの書き方が正しくありません。[ や ( が閉じているか確かめてください。普通の文字として探すなら grep -F を使います。');
    return 2;
  }
  const rec = o.r || o.R;
  const files: string[] = [];
  let code = 0;
  const fs = c.sh.fs;
  const walk = (path: string, n: Node) => {
    if (n.kind === 'file') { files.push(path); return; }
    if (!fs.canRead(n) || !fs.canExec(n)) { c.err(`grep: ${path}: Permission denied\n`); code = 2; return; }
    for (const k of [...n.children.keys()].sort(byName)) walk(`${path.replace(/\/$/, '')}/${k}`, n.children.get(k)!);
  };
  for (const f of rec && files0.length === 0 ? ['.'] : files0) {
    const n = fs.tryLookup(f, c.sh.cwd);
    if (n?.kind === 'dir') {
      if (rec) { walk(f, n); continue; }
      c.err(`grep: ${f}: Is a directory\n`);
      c.note(`ディレクトリの中をまとめて探すには grep -r を使います。`);
      code = 2;
      continue;
    }
    files.push(f);
  }
  if (rec && files0.length === 0) files.forEach((f, i) => { files[i] = f.replace(/^\.\//, ''); });
  const prefix = !o.h && (files.length > 1 || rec);
  let matched = false;
  const targets = files0.length || rec ? files : ['-'];
  const r = targets.length === 0 ? 0 : inputs(c, targets, (text, name) => {
    let count = 0;
    const ls = lines(text);
    ls.forEach((line, i) => {
      re.lastIndex = 0;
      const hit = re.test(line) !== !!o.v;
      if (!hit) return;
      count++;
      if (o.c || o.l) return;
      const pre = (prefix ? `${name}:` : '') + (o.n ? `${i + 1}:` : '');
      if (o.o && !o.v) {
        re.lastIndex = 0;
        for (const m of line.matchAll(re)) if (m[0] !== '') c.out(pre + m[0] + '\n');
      } else c.out(pre + line + '\n');
    });
    if (count > 0) matched = true;
    if (o.c) c.out((prefix ? `${name}:` : '') + count + '\n');
    if (o.l && count > 0) c.out(name + '\n');
  });
  if (r !== 0) code = 2;
  return code === 2 ? 2 : matched ? 0 : 1;
};

/** sort の比べ方。-k で区切りの何番目を比べるか、-n で数として比べるかを決める */
const sort: CmdFn = (c) => {
  const p = getopts(c, 'nrufb', 'kt');
  if (!p) return 2;
  const o = p.o;
  const sep = o.t as string | undefined;
  if (sep !== undefined && sep.length !== 1) { c.err('sort: multi-character tab \'' + sep + "'\n"); return 2; }
  let kStart = 0, kEnd = Infinity, kNum = !!o.n, kRev = false;
  if (o.k) {
    const m = (o.k as string).match(/^(\d+)([nr]*)(?:,(\d+)([nr]*))?$/);
    if (!m || +m[1] < 1) { c.err(`sort: invalid number at field start: invalid count at start of '${o.k}'\n`); c.note('-k の後ろには、何番目の列で並べるかを書きます(例: -k 2 や -k 2,2)。'); return 2; }
    kStart = +m[1] - 1;
    kEnd = m[3] ? +m[3] : Infinity;
    const mods = (m[2] ?? '') + (m[4] ?? '');
    if (mods.includes('n')) kNum = true;
    if (mods.includes('r')) kRev = true;
  }
  const all: string[] = [];
  const code = inputs(c, p.rest, (text) => { all.push(...lines(text)); });
  const key = (line: string): string => {
    if (!o.k) return line;
    let fields: { s: number; e: number }[];
    if (sep !== undefined) {
      fields = [];
      let s = 0;
      for (let i = 0; i <= line.length; i++) if (i === line.length || line[i] === sep) { fields.push({ s, e: i }); s = i + 1; }
    } else {
      // 空白で区切るときは、前の空白も列に含める(本物の sort と同じ)
      fields = [...line.matchAll(/\s*\S+/g)].map((m) => ({ s: m.index!, e: m.index! + m[0].length }));
    }
    if (kStart >= fields.length) return '';
    const end = Math.min(kEnd, fields.length) - 1;
    return line.slice(fields[kStart].s, end >= kStart ? fields[end].e : fields[kStart].e);
  };
  const num = (s: string) => { const m = s.match(/^\s*(-?\d*\.?\d+)/); return m ? parseFloat(m[1]) : 0; };
  const fold = (s: string) => (o.f ? s.toUpperCase() : s);
  const cmpKey = (a: string, b: string) => {
    let r = kNum ? num(a) - num(b) : byName(fold(o.b ? a.trimStart() : a), fold(o.b ? b.trimStart() : b));
    if (kRev) r = -r;
    return r;
  };
  const cmp = (a: string, b: string) => {
    let r = cmpKey(key(a), key(b));
    // 比べる所が同じなら、行全体を文字コード順で比べて順番を決める(-u のときは同じものとして扱う)
    if (r === 0 && !o.u) r = byName(a, b);
    return o.r ? -r : r;
  };
  const sorted = [...all].sort(cmp);
  const out = o.u ? sorted.filter((x, i) => i === 0 || cmpKey(key(sorted[i - 1]), key(x)) !== 0) : sorted;
  c.out(out.map((x) => x + '\n').join(''));
  return code ? 2 : 0;
};

const uniq: CmdFn = (c) => {
  const p = getopts(c, 'cdui');
  if (!p) return 1;
  if (p.rest.length > 1) {
    c.err(`uniq: extra operand '${p.rest[1]}'\n`);
    c.note('uniq に渡せる入力ファイルは 1 つです(2 つ目は書き出し先として扱われます)。この版では、書き出しは > を使ってください。');
    return 1;
  }
  return inputs(c, p.rest, (text) => {
    const ls = lines(text);
    const same = (a: string, b: string) => (p.o.i ? a.toLowerCase() === b.toLowerCase() : a === b);
    for (let i = 0; i < ls.length;) {
      let j = i + 1;
      while (j < ls.length && same(ls[j], ls[i])) j++;
      const n = j - i;
      if ((!p.o.d || n > 1) && (!p.o.u || n === 1)) c.out((p.o.c ? `${String(n).padStart(7)} ` : '') + ls[i] + '\n');
      i = j;
    }
  });
};

/** 1,3 や 2-4 や -3 や 5- の形の番号の並びを、番号ごとの判定にする */
function parseList(spec: string): ((i: number) => boolean) | null {
  const parts = spec.split(',');
  const ranges: [number, number][] = [];
  for (const part of parts) {
    const m = part.match(/^(\d*)(-?)(\d*)$/);
    if (!m || (m[1] === '' && m[3] === '')) return null;
    const a = m[1] ? +m[1] : 1;
    const b = m[2] ? (m[3] ? +m[3] : Infinity) : a;
    if (a < 1 || b < a) return null;
    ranges.push([a, b]);
  }
  return (i) => ranges.some(([a, b]) => i >= a && i <= b);
}

const cut: CmdFn = (c) => {
  const p = getopts(c, 's', 'dfc');
  if (!p) return 1;
  const o = p.o;
  if (!o.f && !o.c) {
    c.err("cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information.\n");
    c.note('cut には、どの列を取り出すかを -f(区切りの何番目)か -c(何文字目)で渡します。例: cut -d , -f 2');
    return 1;
  }
  const list = parseList((o.f ?? o.c) as string);
  if (!list) { c.err(`cut: invalid field value '${o.f ?? o.c}'\n`); c.note('番号は 1 から数えます。1,3 や 2-4 のように書きます。'); return 1; }
  const d = (o.d as string | undefined) ?? '\t';
  if (d.length !== 1) {
    c.err('cut: the delimiter must be a single character\n');
    c.note(`-d には区切りの文字を 1 文字だけ書きます。空白で区切るなら -d ' ' のように引用符で囲みます。`);
    return 1;
  }
  return inputs(c, p.rest, (text) => {
    for (const line of lines(text)) {
      if (o.c) { c.out([...line].filter((_, i) => list(i + 1)).join('') + '\n'); continue; }
      if (!line.includes(d)) { if (!o.s) c.out(line + '\n'); continue; }
      c.out(line.split(d).filter((_, i) => list(i + 1)).join(d) + '\n');
    }
  });
};

/** tr の文字の組。a-z のような範囲と [:upper:] のような名前を広げる */
function trSet(s: string): string[] {
  const named: Record<string, string> = { lower: 'a-z', upper: 'A-Z', digit: '0-9', alpha: 'A-Za-z', alnum: 'A-Za-z0-9', space: ' \t\n\r\f\v', blank: ' \t', punct: '!-/:-@[-`{-~' };
  s = s.replace(/\[:(\w+):\]/g, (m, n) => named[n] ?? m);
  const chars = [...s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\')];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i + 1] === '-' && i + 2 < chars.length) {
      const a = chars[i].codePointAt(0)!, b = chars[i + 2].codePointAt(0)!;
      for (let x = a; x <= b; x++) out.push(String.fromCodePoint(x));
      i += 2;
    } else out.push(chars[i]);
  }
  return out;
}

const tr: CmdFn = (c) => {
  const p = getopts(c, 'ds');
  if (!p) return 1;
  // -d だけなら組は 1 つ、-s だけなら 1 つか 2 つ、-d と -s なら 2 つ、どちらもなければ 2 つ
  const need = p.o.d ? (p.o.s ? 2 : 1) : p.o.s ? 1 : 2;
  const most = p.o.d && !p.o.s ? 1 : 2;
  if (p.rest.length < need) {
    c.err(`tr: missing operand\nTry 'tr --help' for more information.\n`);
    c.note('tr には、置き換え前と置き換え後の文字の組を渡します(例: tr a-z A-Z)。');
    return 1;
  }
  if (p.rest.length > most) {
    const extra = p.rest[most];
    c.err(`tr: extra operand '${extra}'\n`);
    c.note(`tr はファイル名を受け取りません。「tr … < ${extra}」か「cat ${extra} | tr …」のように、入力として渡します。`);
    return 1;
  }
  const s1 = trSet(p.rest[0]);
  const s2 = p.rest[1] !== undefined ? trSet(p.rest[1]) : [];
  const map = new Map<string, string>();
  if (!p.o.d) s1.forEach((ch, i) => map.set(ch, s2[Math.min(i, s2.length - 1)] ?? ch));
  const del = new Set(p.o.d ? s1 : []);
  const squeeze = new Set(p.o.s ? (p.o.d || s2.length === 0 ? (p.o.d ? s2 : s1) : s2) : []);
  if (c.stdin === null) c.note('tr は前のコマンドからの入力(| や <)を読みます。何も渡していないので、本物ではキーボードからの入力を待ち続けます。');
  let out = '';
  let prev = '';
  for (const ch of c.stdin ?? '') {
    if (del.has(ch)) continue;
    const t = map.get(ch) ?? ch;
    if (squeeze.has(t) && t === prev) continue;
    out += t;
    prev = t;
  }
  c.out(out);
  return 0;
};

const find: CmdFn = (c) => {
  const a = c.args;
  const starts: string[] = [];
  let i = 0;
  while (i < a.length && !a[i].startsWith('-')) starts.push(a[i++]);
  if (!starts.length) starts.push('.');
  const tests: ((n: Node, name: string, depth: number) => boolean)[] = [];
  let maxdepth = Infinity, mindepth = 0;
  for (; i < a.length; i++) {
    const t = a[i];
    const v = a[i + 1];
    if (['-name', '-iname', '-type', '-maxdepth', '-mindepth'].includes(t) && v === undefined) {
      c.err(`find: missing argument to \`${t}'\n`);
      c.note(`${t} の後ろに値を書いてください(例: find . ${t} ${t === '-type' ? 'f' : t.endsWith('depth') ? '1' : "'*.txt'"})。`);
      return 1;
    }
    if (t === '-name' || t === '-iname') {
      const re = globToRegex(t === '-iname' ? v.toLowerCase() : v);
      tests.push((_n, name) => re.test(t === '-iname' ? name.toLowerCase() : name));
      i++;
    } else if (t === '-type') {
      if (v !== 'f' && v !== 'd') { c.err(`find: Unknown argument to -type: ${v}\n`); c.note('-type の後ろは、ファイルなら f、ディレクトリなら d です。'); return 1; }
      tests.push((n) => (v === 'f' ? n.kind === 'file' : n.kind === 'dir'));
      i++;
    } else if (t === '-maxdepth' || t === '-mindepth') {
      if (!/^\d+$/.test(v)) { c.err(`find: Expected a positive decimal integer argument to ${t}, but got '${v}'\n`); return 1; }
      if (t === '-maxdepth') maxdepth = +v; else mindepth = +v;
      i++;
    } else {
      c.err(`find: unknown predicate \`${t}'\n`);
      c.note(`この版の find で使える条件は -name・-iname・-type・-maxdepth・-mindepth です。`);
      return 1;
    }
  }
  const fs = c.sh.fs;
  let code = 0;
  const visit = (n: Node, path: string, depth: number) => {
    if (depth >= mindepth && tests.every((t) => t(n, n.name || '/', depth))) c.out(path + '\n');
    if (n.kind !== 'dir' || depth >= maxdepth) return;
    if (!fs.canRead(n) || !fs.canExec(n)) { c.err(`find: '${path}': Permission denied\n`); code = 1; return; }
    for (const k of [...n.children.keys()].sort(byName)) visit(n.children.get(k)!, `${path.replace(/\/$/, '')}/${k}`, depth + 1);
  };
  for (const s of starts) {
    const n = fs.tryLookup(s, c.sh.cwd);
    if (!n) {
      c.err(`find: '${s}': No such file or directory\n`);
      if (s.includes('*')) c.note(`「${s}」はシェルが先にファイル名へ広げようとします。find に * を渡すときは '*.txt' のように引用符で囲みます。`);
      else c.sh.noteFsError(new FsError('noent'), s);
      code = 1;
      continue;
    }
    visit(n, s, 0);
  }
  return code;
};

// ───── 権限 ─────
const chmod: CmdFn = (c) => {
  const p = getopts(c, 'R');
  if (!p) return 1;
  const [mode, ...files] = p.rest;
  if (mode === undefined || files.length === 0) return missing(c, mode === undefined ? 'operand' : `operand after '${mode}'`);
  const fs = c.sh.fs;
  let apply: ((m: number, isDir: boolean) => number) | null = null;
  if (/^[0-7]{3,4}$/.test(mode)) {
    const v = parseInt(mode, 8) & 0o777;
    apply = () => v;
  } else {
    const clauses = mode.split(',').map((cl) => cl.match(/^([ugoa]*)([+\-=])([rwxX]*)$/));
    if (clauses.every(Boolean)) {
      apply = (m, isDir) => {
        for (const cl of clauses as RegExpMatchArray[]) {
          const who = cl[1] || 'a';
          let bits = 0;
          for (const ch of cl[3]) bits |= ch === 'r' ? 4 : ch === 'w' ? 2 : ch === 'x' || (ch === 'X' && (isDir || (m & 0o111))) ? 1 : 0;
          let mask = 0;
          if (who.includes('u') || who.includes('a')) mask |= bits << 6;
          if (who.includes('g') || who.includes('a')) mask |= bits << 3;
          if (who.includes('o') || who.includes('a')) mask |= bits;
          // u・g・o を書かないときは、umask(022)で消える印は付けない(本物と同じ)
          if (!cl[1]) mask &= ~0o022;
          const whoMask = (who.includes('u') || who.includes('a') ? 0o700 : 0) | (who.includes('g') || who.includes('a') ? 0o070 : 0) | (who.includes('o') || who.includes('a') ? 0o007 : 0);
          if (cl[2] === '+') m |= mask;
          else if (cl[2] === '-') m &= ~mask;
          else m = (m & ~whoMask) | mask;
        }
        return m;
      };
    }
  }
  if (!apply) {
    c.err(`chmod: invalid mode: '${mode}'\n`);
    c.note('権限は 755 のような 3 桁の数か、u+x・go-w・a=r のような書き方で渡します。');
    return 1;
  }
  let code = 0;
  const change = (n: Node, name: string) => {
    if (fs.user !== 'root' && n.owner !== fs.user) {
      c.err(`chmod: changing permissions of '${name}': Operation not permitted\n`);
      c.note(`「${name}」の持ち主は ${n.owner} です。権限を変えられるのは、持ち主(と root)だけです。`);
      code = 1;
      return;
    }
    n.mode = apply!(n.mode, n.kind === 'dir');
    if (p.o.R && n.kind === 'dir') for (const [k, ch] of n.children) change(ch, `${name}/${k}`);
  };
  for (const f of files) {
    try { change(c.sh.lookup(f), f); } catch (e) {
      fsFail(c, e, f, (m) => `chmod: cannot access '${f}': ${m}`);
      code = 1;
    }
  }
  return code;
};

const whoami: CmdFn = (c) => { c.out(c.sh.user + '\n'); return 0; };
const id: CmdFn = (c) => {
  const u = c.sh.user;
  c.out(u === 'root' ? 'uid=0(root) gid=0(root) groups=0(root)\n' : `uid=1000(${u}) gid=1000(${u}) groups=1000(${u})\n`);
  return 0;
};

const help: CmdFn = (c) => {
  c.out('このサイトで使えるコマンド(「man コマンド名」で使い方を表示します):\n');
  c.out(columns(Object.keys(COMMANDS).sort(byName)));
  return 0;
};

const man: CmdFn = (c) => {
  const name = c.args[0];
  if (!name) { c.err('What manual page do you want?\nFor example, try \'man man\'.\n'); return 1; }
  const m = MAN[name];
  if (!m) { c.err(`No manual entry for ${name}\n`); c.note(`「${name}」の説明はありません。使えるコマンドは help で一覧できます。`); return 16; }
  c.out(m.trimStart());
  return 0;
};

const clear: CmdFn = (c) => { c.sh.term.length = 0; return 0; };

export const COMMANDS: Record<string, CmdFn> = {
  pwd, cd, ls, mkdir, touch, rm, rmdir, cp, mv, cat, echo, head, tail, wc,
  grep, sort, uniq, cut, tr, find, chmod, whoami, id, help, man, clear,
  true: () => 0,
  false: () => 1,
};
