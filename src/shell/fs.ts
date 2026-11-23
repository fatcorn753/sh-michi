// 仮想のファイルシステム。木構造をそのまま持ち、所有者と権限(rwx)で読み書きを止める

export interface FileNode { kind: 'file'; name: string; mode: number; owner: string; group: string; mtime: number; content: string; parent: DirNode | null }
export interface DirNode { kind: 'dir'; name: string; mode: number; owner: string; group: string; mtime: number; children: Map<string, Node>; parent: DirNode | null }
export type Node = FileNode | DirNode;

/** 教材でファイルを並べる書き方。キーが / で終わるとディレクトリ。値は中身か、細かい指定 */
export type FsSpec = Record<string, string | null | { content?: string; mode?: number | string; owner?: string }>;

/** 失敗の種類。メッセージは本物の coreutils と同じ英語にそろえる */
export type FsErr = 'noent' | 'notdir' | 'perm' | 'isdir' | 'exist' | 'notempty';
export const ERR_TEXT: Record<FsErr, string> = {
  noent: 'No such file or directory',
  notdir: 'Not a directory',
  perm: 'Permission denied',
  isdir: 'Is a directory',
  exist: 'File exists',
  notempty: 'Directory not empty',
};

export class FsError extends Error {
  constructor(public code: FsErr) { super(ERR_TEXT[code]); }
}

/** 時刻は本物の時計を使わない(実行するたびに出力が変わると採点できないため)。変更のたびに 1 分ずつ進む */
const EPOCH = Date.UTC(2026, 10, 23, 9, 0);

export class Fs {
  root: DirNode;
  clock = 0;
  constructor(public user = 'you') {
    this.root = { kind: 'dir', name: '', mode: 0o755, owner: 'root', group: 'root', mtime: 0, children: new Map(), parent: null };
  }

  get home(): string { return this.user === 'root' ? '/root' : `/home/${this.user}`; }

  tick(): number { return ++this.clock; }

  /** 時刻を ls -l の形(Nov 23 09:05)にする */
  static dateText(mtime: number): string {
    const d = new Date(EPOCH + mtime * 60_000);
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    const p = (n: number) => String(n).padStart(2, '0');
    return `${mon} ${String(d.getUTCDate()).padStart(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }

  // ───── 権限 ─────
  private bits(n: Node): number {
    if (this.user === 'root') return 7;
    if (n.owner === this.user) return (n.mode >> 6) & 7;
    if (n.group === this.user) return (n.mode >> 3) & 7;
    return n.mode & 7;
  }
  canRead(n: Node): boolean { return (this.bits(n) & 4) !== 0; }
  canWrite(n: Node): boolean { return (this.bits(n) & 2) !== 0; }
  /** root でも、実行の印が 1 つもないファイルは実行できない(本物と同じ) */
  canExec(n: Node): boolean { return this.user === 'root' ? n.kind === 'dir' || (n.mode & 0o111) !== 0 : (this.bits(n) & 1) !== 0; }

  // ───── 道のり ─────
  /** 絶対パスにして、. と .. を片付ける(ファイルシステムは見ない) */
  normalize(path: string, cwd: string): string {
    const abs = path.startsWith('/') ? path : `${cwd}/${path}`;
    const out: string[] = [];
    for (const part of abs.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') out.pop(); else out.push(part);
    }
    return '/' + out.join('/');
  }

  pathOf(n: Node): string {
    const parts: string[] = [];
    for (let x: Node | null = n; x && x.parent; x = x.parent) parts.unshift(x.name);
    return '/' + parts.join('/');
  }

  /** 道のりをたどる。途中のディレクトリに x(通る権限)がないと Permission denied */
  lookup(path: string, cwd: string): Node {
    const abs = this.normalize(path, cwd);
    let cur: Node = this.root;
    if (abs === '/') return cur;
    for (const part of abs.slice(1).split('/')) {
      if (cur.kind !== 'dir') throw new FsError('notdir');
      if (!this.canExec(cur)) throw new FsError('perm');
      const next: Node | undefined = cur.children.get(part);
      if (!next) throw new FsError('noent');
      cur = next;
    }
    // 「file.txt/」のように、ファイルの後ろに / を付けた書き方
    if (path.endsWith('/') && cur.kind !== 'dir') throw new FsError('notdir');
    return cur;
  }

  tryLookup(path: string, cwd: string): Node | null {
    try { return this.lookup(path, cwd); } catch { return null; }
  }

  /** 作る場所(親ディレクトリ)と名前に分ける。親が無ければ例外 */
  parentOf(path: string, cwd: string): { dir: DirNode; name: string } {
    const abs = this.normalize(path, cwd);
    if (abs === '/') throw new FsError('exist');
    const i = abs.lastIndexOf('/');
    const dir = this.lookup(abs.slice(0, i) || '/', '/');
    if (dir.kind !== 'dir') throw new FsError('notdir');
    if (!this.canExec(dir)) throw new FsError('perm');
    return { dir, name: abs.slice(i + 1) };
  }

  // ───── 作る・消す ─────
  addFile(dir: DirNode, name: string, content = '', mode = 0o644): FileNode {
    const f: FileNode = { kind: 'file', name, mode, owner: this.user, group: this.user, mtime: this.tick(), content, parent: dir };
    dir.children.set(name, f);
    dir.mtime = f.mtime;
    return f;
  }

  addDir(dir: DirNode, name: string, mode = 0o755): DirNode {
    const d: DirNode = { kind: 'dir', name, mode, owner: this.user, group: this.user, mtime: this.tick(), children: new Map(), parent: dir };
    dir.children.set(name, d);
    dir.mtime = d.mtime;
    return d;
  }

  remove(n: Node) {
    const p = n.parent;
    if (!p) return;
    p.children.delete(n.name);
    p.mtime = this.tick();
    n.parent = null;
  }

  /** ファイルに書く。無ければ作る。append なら後ろに足す */
  writeFile(path: string, cwd: string, text: string, append: boolean): FileNode {
    const n = this.tryLookupStrict(path, cwd);
    if (n) {
      if (n.kind === 'dir') throw new FsError('isdir');
      if (!this.canWrite(n)) throw new FsError('perm');
      n.content = append ? n.content + text : text;
      n.mtime = this.tick();
      return n;
    }
    const { dir, name } = this.parentOf(path, cwd);
    if (!this.canWrite(dir)) throw new FsError('perm');
    return this.addFile(dir, name, text);
  }

  /** 無いときだけ null を返し、権限などの誤りは例外のまま投げる */
  tryLookupStrict(path: string, cwd: string): Node | null {
    try { return this.lookup(path, cwd); } catch (e) {
      if (e instanceof FsError && e.code === 'noent') return null;
      throw e;
    }
  }

  readFile(path: string, cwd: string): string {
    const n = this.lookup(path, cwd);
    if (n.kind === 'dir') throw new FsError('isdir');
    if (!this.canRead(n)) throw new FsError('perm');
    return n.content;
  }

  /** 中身ごと写す(cp -r)。持ち主は写した人になる */
  cloneInto(src: Node, dir: DirNode, name: string): Node {
    if (src.kind === 'file') return this.addFile(dir, name, src.content, src.mode);
    const d = this.addDir(dir, name, src.mode);
    for (const c of src.children.values()) this.cloneInto(c, d, c.name);
    return d;
  }

  static fromSpec(spec: FsSpec, user = 'you'): Fs {
    const fs = new Fs(user);
    const asRoot = (f: () => void) => { const u = fs.user; fs.user = 'root'; f(); fs.user = u; };
    // 本物の Linux に似せた最小の骨組み
    asRoot(() => {
      const home = fs.addDir(fs.root, 'home');
      fs.addDir(fs.root, 'tmp', 0o777);
      const etc = fs.addDir(fs.root, 'etc');
      fs.addFile(etc, 'hostname', 'michi\n');
      fs.addFile(etc, 'passwd', `root:x:0:0:root:/root:/bin/bash\n${user}:x:1000:1000::/home/${user}:/bin/bash\n`);
      fs.addDir(fs.root, 'root', 0o700);
      const h = fs.addDir(home, user);
      h.owner = user; h.group = user;
    });
    for (const [key, val] of Object.entries(spec)) {
      const isDir = key.endsWith('/');
      const path = key.replace(/\/+$/, '');
      const opt = typeof val === 'object' && val !== null ? val : { content: val ?? '' };
      const owner = opt.owner ?? (path.startsWith(fs.home) ? user : 'root');
      // 途中のディレクトリを作る
      const parts = path.split('/').filter(Boolean);
      let cur = fs.root;
      for (let i = 0; i < parts.length - (isDir ? 0 : 1); i++) {
        let next = cur.children.get(parts[i]);
        if (!next) {
          next = { kind: 'dir', name: parts[i], mode: 0o755, owner, group: owner, mtime: 0, children: new Map(), parent: cur };
          cur.children.set(parts[i], next);
        }
        if (next.kind !== 'dir') throw new Error(`教材のファイル指定がおかしい: ${key}`);
        cur = next;
      }
      const mode = typeof opt.mode === 'string' ? parseInt(opt.mode, 8) : opt.mode;
      if (isDir) {
        if (mode !== undefined) cur.mode = mode;
        cur.owner = owner; cur.group = owner;
      } else {
        const name = parts[parts.length - 1];
        cur.children.set(name, { kind: 'file', name, mode: mode ?? 0o644, owner, group: owner, mtime: 0, content: opt.content ?? '', parent: cur });
      }
    }
    fs.clock = 0;
    return fs;
  }
}

export function permText(n: Node): string {
  const r = (m: number) => (m & 4 ? 'r' : '-') + (m & 2 ? 'w' : '-') + (m & 1 ? 'x' : '-');
  return (n.kind === 'dir' ? 'd' : '-') + r(n.mode >> 6) + r(n.mode >> 3) + r(n.mode);
}

export function sizeOf(n: Node): number {
  return n.kind === 'dir' ? 4096 : new TextEncoder().encode(n.content).length;
}

/** 名前の並べ方。本物の LANG=C と同じく、文字コードの順(大文字が先) */
export const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
