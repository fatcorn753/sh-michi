// 学習エンジン。習得度の推定(BKT)と、間隔を空けた復習の予定を受け持つ
// 根拠: Corbett & Anderson (1995) の知識追跡、Cepeda et al. (2006, 2008) の分散学習

export interface KCState {
  /** 習得している確率 P(L) */
  p: number;
  attempts: number;
  correct: number;
  last: number;
}

export interface CardState {
  /** 次に復習する日時(ミリ秒) */
  due: number;
  /** いまの間隔(日) */
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
}

export const BKT = { init: 0.15, learn: 0.15, guess: 0.2, slip: 0.1, mastered: 0.95 };

/** 選択肢の数が分かれば、当て推量の確率をそれに合わせる */
export function guessFor(choices?: number): number {
  return choices ? Math.min(0.5, 1 / choices) : BKT.guess;
}

/** 1 回の解答で P(L) を更新する。ヒントを見た解答は不正解として扱う */
export function updateKC(s: KCState | undefined, correct: boolean, guess = BKT.guess, now = Date.now()): KCState {
  const prior = s?.p ?? BKT.init;
  const slip = BKT.slip;
  const post = correct
    ? (prior * (1 - slip)) / (prior * (1 - slip) + (1 - prior) * guess)
    : (prior * slip) / (prior * slip + (1 - prior) * (1 - guess));
  const p = post + (1 - post) * BKT.learn;
  return {
    p: Math.min(0.999, Math.max(0.001, p)),
    attempts: (s?.attempts ?? 0) + 1,
    correct: (s?.correct ?? 0) + (correct ? 1 : 0),
    last: now,
  };
}

const DAY = 86_400_000;

/**
 * 復習の予定を決める。正解なら間隔を伸ばし、不正解なら翌日からやり直す。
 * 間隔は 1 → 3 → 約 7 → 約 16 日…と伸びる(SM-2 を簡単にしたもの)
 */
export function schedule(c: CardState | undefined, correct: boolean, now = Date.now()): CardState {
  if (!c) {
    return { due: now + (correct ? DAY : DAY / 2), interval: correct ? 1 : 0.5, ease: 2.3, reps: correct ? 1 : 0, lapses: correct ? 0 : 1 };
  }
  if (!correct) {
    return { due: now + DAY / 2, interval: 0.5, ease: Math.max(1.3, c.ease - 0.2), reps: 0, lapses: c.lapses + 1 };
  }
  const interval = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.interval * c.ease);
  return { due: now + interval * DAY, interval, ease: Math.min(2.8, c.ease + 0.05), reps: c.reps + 1, lapses: c.lapses };
}

/**
 * 復習で出す問題を選ぶ。期限の来たものから、似た KC が並ぶように混ぜる(交互練習)。
 * 同じ KC が 3 問続かないように並べ替える
 */
export function pickReview<T extends { id: string; kcs: string[] }>(
  items: T[], cards: Record<string, CardState>, now = Date.now(), limit = 10,
): T[] {
  const due = items
    .filter((it) => cards[it.id] && cards[it.id].due <= now)
    .sort((a, b) => cards[a.id].due - cards[b.id].due)
    .slice(0, limit * 2);
  const out: T[] = [];
  const pool = [...due];
  while (out.length < limit && pool.length) {
    const lastK = out.slice(-2).map((x) => x.kcs[0]);
    let i = pool.findIndex((x) => !(lastK.length === 2 && lastK.every((k) => k === x.kcs[0])));
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** 乱数の種から決まる乱数(同じ種なら同じ問題になる。答え合わせと再表示で値がずれないように) */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
