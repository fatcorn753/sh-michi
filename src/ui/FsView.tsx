import { useState } from 'react';
import { File, FileText, Folder, FolderOpen, MapPin } from 'lucide-react';
import type { FsEntry } from '../shell/shell';

const ic = { className: 'icon-sm', strokeWidth: 1.75, 'aria-hidden': true } as const;
const HOME = '/home/you';

/** 道のりが、相手の道のりの下(相手自身を含む)にあるか */
const under = (p: string, anc: string) => p === anc || p.startsWith(anc === '/' ? '/' : anc + '/');

/**
 * ファイルの木。いまいる場所に印を付け、前の時点から増えた・変わった・消えたものを色で示す。
 * /etc などの関係の薄いディレクトリは、中に入ったときと「全部見る」のときだけ開く
 */
export function FsView({ entries, cwd, prev, hideChanges = false, focus = HOME }: {
  entries: FsEntry[];
  cwd: string;
  prev?: FsEntry[];
  hideChanges?: boolean;
  /** 最初から開いておく場所 */
  focus?: string;
}) {
  const [all, setAll] = useState(false);
  const [perm, setPerm] = useState(false);
  const before = prev ? new Map(prev.map((e) => [e.path, e])) : null;
  const now = new Set(entries.map((e) => e.path));
  const removed = before && !hideChanges ? [...before.values()].filter((e) => !now.has(e.path)) : [];
  // 開いておくディレクトリ: focus と cwd までの道のりと、その下
  const open = (dir: string) => all || under(focus, dir) || under(dir, focus) || under(cwd, dir) || under(dir, cwd)
    || (before !== null && entries.some((e) => under(e.path, dir) && e.path !== dir && changed(e)));
  const changed = (e: FsEntry): 'add' | 'mod' | undefined => {
    if (!before || hideChanges) return undefined;
    const b = before.get(e.path);
    if (!b) return 'add';
    if (b.text !== e.text || b.perm !== e.perm || b.kind !== e.kind) return 'mod';
    return undefined;
  };
  const shown = entries.filter((e) => {
    const parent = e.path.slice(0, e.path.lastIndexOf('/')) || '/';
    if (e.path === '/') return true;
    // 親のどれかが閉じていれば隠す
    for (let p = parent; ; p = p.slice(0, p.lastIndexOf('/')) || '/') {
      if (!open(p)) return false;
      if (p === '/') break;
    }
    return true;
  });
  const hidden = entries.length - shown.length;
  return (
    <div className="fs-view">
      <div className="row small">
        <label className="td-check"><span>権限と持ち主</span><input className="td-switch" type="checkbox" role="switch" checked={perm} onChange={(e) => setPerm(e.target.checked)} /></label>
        {(hidden > 0 || all) && <button className="td-btn" data-variant="ghost" type="button" onClick={() => setAll(!all)}>{all ? '関係する所だけ見る' : `閉じている所も見る(${hidden} 件)`}</button>}
      </div>
      <ul className="fs-tree" aria-label="ファイルの木">
        {shown.map((e) => {
          const ch = changed(e);
          const here = e.path === cwd;
          const isOpen = e.kind === 'dir' && (open(e.path) || e.path === '/');
          const icon = e.kind === 'dir' ? (isOpen ? <FolderOpen {...ic} /> : <Folder {...ic} />) : e.text ? <FileText {...ic} /> : <File {...ic} />;
          const label = (
            <span className="fs-name">
              {icon}
              <span>{e.name}{e.kind === 'dir' && e.path !== '/' ? '/' : ''}</span>
              {perm && <span className="fs-meta">{e.perm} {e.owner}</span>}
              {here && <span className="fs-here"><MapPin {...ic} />いまいる場所</span>}
              {ch && <span className="fs-badge">{ch === 'add' ? '増えた' : '変わった'}</span>}
              {e.kind === 'dir' && !isOpen && <span className="fs-meta">…</span>}
            </span>
          );
          return (
            <li key={e.path} style={{ paddingLeft: `calc(${e.depth} * var(--space-4))` }} data-change={ch} data-here={here ? '' : undefined}>
              {e.kind === 'file' && e.text ? (
                <details>
                  <summary>{label}</summary>
                  <pre className="fs-content">{e.text}</pre>
                </details>
              ) : label}
            </li>
          );
        })}
      </ul>
      {removed.length > 0 && (
        <p className="small fs-removed">消えたもの: {removed.map((e) => e.path.replace(/^\/home\/you(?=\/|$)/, '~')).join('、')}</p>
      )}
    </div>
  );
}
