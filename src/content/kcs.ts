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
  { id: 'pipe', label: 'パイプでつなぐ(|)', confusable: ['redirect'] },
  { id: 'redirect', label: 'ファイルへ書く(> と >>)', confusable: ['pipe'] },
  { id: 'stderr', label: 'エラーの行き先と入力(2>・2>&1・<)' },
  { id: 'grep', label: '行を探す(grep・-i・-v・-n・-c)' },
  { id: 'sort', label: '並べる(sort・-n・-r・-t・-k)', confusable: ['uniq'] },
  { id: 'uniq', label: '重なりをまとめて数える(uniq・-c)', confusable: ['sort'] },
  { id: 'cut', label: '列を切り出す(cut・-d・-f)' },
  { id: 'perm', label: '権限を読む(rwx・持ち主・root)', confusable: ['chmod'] },
  { id: 'chmod', label: '権限を変える(chmod の数字と記号)', confusable: ['perm'] },
  { id: 'glob', label: 'ワイルドカード(* ? [...])', confusable: ['find'] },
  { id: 'find', label: '木をたどって探す(find・-name・-type)', confusable: ['glob'] },
];
