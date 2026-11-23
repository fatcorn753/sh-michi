// 学習の記録を端末内(localStorage)に保存する。アカウントは作らない
import { useSyncExternalStore } from 'react';
import { schedule, updateKC, type CardState, type KCState } from './engine';

export interface TestRecord { at: number; kind: 'diag' | 'post'; score: number; total: number; byKc: Record<string, [number, number]> }

export interface State {
  v: 1;
  startedAt: number;
  /** 作品コースの系統 */
  track: 'pc' | 'mcu' | null;
  /** 診断で決めた出発点(単元 ID)。経験者は途中の単元から始める */
  startUnit: string | null;
  kc: Record<string, KCState>;
  cards: Record<string, CardState>;
  /** 終えたステップ(lessonId/index) */
  done: Record<string, number>;
  /** 確認テストに合格した単元と得点 */
  passed: Record<string, number>;
  tests: TestRecord[];
  drafts: Record<string, string>;
  log: { t: number; id: string; ok: boolean }[];
}

const KEY = 'sh-michi:v1';

const fresh = (): State => ({
  v: 1, startedAt: Date.now(), track: null, startUnit: null,
  kc: {}, cards: {}, done: {}, passed: {}, tests: [], drafts: {}, log: [],
});

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw) as State;
    return s.v === 1 ? { ...fresh(), ...s } : fresh();
  } catch {
    return fresh();
  }
}

let state: State = typeof localStorage === 'undefined' ? fresh() : load();
const subs = new Set<() => void>();
let saveError = false;

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = false;
  } catch {
    // 保存できなくても学習は続けられる。画面に「保存できていません」と出す
    saveError = true;
  }
  subs.forEach((f) => f());
}

export const store = {
  get: () => state,
  saveFailed: () => saveError,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },

  update(fn: (s: State) => Partial<State>) { commit({ ...state, ...fn(state) }); },

  /** 1 問の解答を記録する。KC の習得度と、その問題の復習予定を更新する */
  answer(id: string, kcs: string[], ok: boolean, guess?: number) {
    const kc = { ...state.kc };
    for (const k of kcs) kc[k] = updateKC(kc[k], ok, guess);
    const cards = { ...state.cards, [id]: schedule(state.cards[id], ok) };
    const log = [...state.log, { t: Date.now(), id, ok }].slice(-1000);
    commit({ ...state, kc, cards, log });
  },

  markDone(key: string) { commit({ ...state, done: { ...state.done, [key]: Date.now() } }); },

  saveDraft(id: string, code: string) { commit({ ...state, drafts: { ...state.drafts, [id]: code } }); },

  export(): string { return JSON.stringify(state, null, 1); },

  import(text: string): boolean {
    try {
      const s = JSON.parse(text) as State;
      if (s.v !== 1 || typeof s.kc !== 'object') return false;
      commit({ ...fresh(), ...s });
      return true;
    } catch {
      return false;
    }
  },

  reset() { commit(fresh()); },
};

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
