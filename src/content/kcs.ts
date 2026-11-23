import type { KC } from './types';

/** 知識要素。習得度はこの単位で推定し、復習もこの単位で選ぶ */
export const KCS: KC[] = [
  { id: 'pwd', label: 'いまいる場所を知る(pwd とプロンプト)' },
  { id: 'ls', label: '中身を一覧する(ls と -a・-l)' },
  { id: 'cd', label: '場所を移る(cd・..・~)', confusable: ['path'] },
  { id: 'path', label: '絶対パスと相対パス', confusable: ['cd'] },
  { id: 'mkdir', label: 'ディレクトリとファイルを作る(mkdir・-p・touch)' },
  { id: 'cpmv', label: '写す・動かす・名前を変える(cp・mv)', confusable: ['rm'] },
  { id: 'rm', label: '消す(rm・-r・rmdir)', confusable: ['cpmv'] },
  { id: 'cat', label: '中身を出す(cat・-n)', confusable: ['headtail'] },
  { id: 'headtail', label: '先頭と最後を出す(head・tail・-n)', confusable: ['cat'] },
  { id: 'wc', label: '数える(wc・-l・-w・-c)' },
];
