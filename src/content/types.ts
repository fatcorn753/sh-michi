// 教材のデータ形式。正解の出力は書かず、シェルで実行して求める(教材と実行結果がずれないように)
import type { FsSpec } from '../shell/fs';

/** 変数の範囲。問題を出すたびに値を変えて、答えの丸暗記を防ぐ */
export type Params = Record<string, [number, number] | string[]>;

interface ProblemBase {
  id: string;
  /** 知識要素(KC)。習得度はこの単位で推定する */
  kcs: string[];
  prompt: string;
  params?: Params;
  /** 始めのファイル。省略すると空のホームだけ */
  fs?: FsSpec;
  /** 始めにいる場所。省略するとホーム */
  cwd?: string;
  /** 解いた後に見せる解説 */
  explain?: string;
}

/** 採点の 1 回ぶん。fs を書くと、問題の fs の代わりにこのファイルで確かめる */
export interface TestCase { fs?: FsSpec; hidden?: boolean }

/** 何を比べて採点するか。out: 画面への出力、fs: 終わったときのファイル、cwd: 終わったときにいる場所 */
export type Check = 'out' | 'fs' | 'cwd';

export type Problem = ProblemBase & (
  /** 出力の予測(PRIMM の Predict)。答えた後に実行して確かめる */
  | { type: 'predict'; code: string }
  /** 選択肢。choices[i] に、それを選んだ人向けの説明を付ける */
  | { type: 'choice'; code?: string; choices: { text: string; why: string }[]; answer: number }
  /** 行の並べ替え。distractors は使わない行(よくある誤り) */
  | { type: 'parsons'; lines: string[]; distractors?: string[]; tests: TestCase[]; check?: Check[] }
  /** 穴埋め。code の中の ___ を埋める。answers は参照解(採点は実行結果で行う) */
  | { type: 'fill'; code: string; answers: string[]; tests: TestCase[]; check?: Check[] }
  /** 白紙から書く・直す。solution は参照解 */
  | { type: 'write'; starter: string; solution: string; tests: TestCase[]; check?: Check[]; hints: string[] }
);

export type Step =
  | { kind: 'read'; title: string; body: string; /** 1 行ずつ動かして見せる例題 */ example?: string; fs?: FsSpec }
  | { kind: 'problem'; problem: Problem };

export interface Lesson { id: string; title: string; steps: Step[] }

export interface Unit {
  id: string;
  title: string;
  summary: string;
  kcs: string[];
  lessons: Lesson[];
  /** 確認テスト。合格すると次の単元が開く */
  check: Problem[];
}

export interface KC { id: string; label: string; /** 混同しやすい KC(交互練習で一緒に出す) */ confusable?: string[] }

export interface Course {
  id: string;
  title: string;
  summary: string;
  units: Unit[];
}
