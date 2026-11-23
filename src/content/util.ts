// 教材を書くための小さな道具

/** 先頭の空行と共通の字下げを取り除く */
export function src(s: string): string {
  const lines = s.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(ind)).join('\n') + '\n';
}

/** ホームの下のファイルを短く書く。'memo.txt' は /home/you/memo.txt になる */
export const HOME = '/home/you';
export function home(spec: Record<string, string | null | { content?: string; mode?: string | number; owner?: string }>) {
  return Object.fromEntries(Object.entries(spec).map(([k, v]) => [k.startsWith('/') ? k : `${HOME}/${k}`, v]));
}

export const r = String.raw;
