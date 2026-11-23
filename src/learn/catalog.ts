// 全コースの目録。問題を ID から引き、復習の対象や単元の開き具合を計算する
import type { Course, KC, Problem, Unit } from '../content/types';
import { COURSES, KCS } from '../content';
import { BKT, pickReview } from './engine';
import type { State } from './store';

export const kcLabel = (id: string): string => KCS.find((k: KC) => k.id === id)?.label ?? id;

const allProblems = new Map<string, { problem: Problem; course: Course; unit: Unit }>();
for (const c of COURSES) {
  for (const u of c.units) {
    for (const l of u.lessons) for (const s of l.steps) if (s.kind === 'problem') allProblems.set(s.problem.id, { problem: s.problem, course: c, unit: u });
    for (const p of u.check) allProblems.set(p.id, { problem: p, course: c, unit: u });
  }
}

export const findProblem = (id: string) => allProblems.get(id);
export const findCourse = (id: string) => COURSES.find((c) => c.id === id);
export const findUnit = (courseId: string, unitId: string) => findCourse(courseId)?.units.find((u) => u.id === unitId);

/** 単元が開いているか。前の単元の確認テストに合格しているか、診断で飛ばしてよいと分かっていれば開く */
export function unitOpen(s: State, course: Course, index: number): boolean {
  if (index === 0) return true;
  const u = course.units[index];
  if (s.passed[course.units[index - 1].id] !== undefined) return true;
  if (course.id === 'main' && s.startUnit) {
    const start = course.units.findIndex((x) => x.id === s.startUnit);
    if (start >= index) return true;
  }
  // 作品コースは、本編のどこまで進んだかで開く
  return u.kcs.length > 0 && u.kcs.every((k) => (s.kc[k]?.p ?? 0) >= BKT.mastered);
}

export function unitMastery(s: State, u: Unit): number {
  if (u.kcs.length === 0) return 0;
  return u.kcs.reduce((a, k) => a + Math.min(1, (s.kc[k]?.p ?? 0) / BKT.mastered), 0) / u.kcs.length;
}

export function lessonProgress(s: State, courseId: string, unitId: string, lessonId: string, steps: number): number {
  let n = 0;
  for (let i = 0; i < steps; i++) if (s.done[`${courseId}/${unitId}/${lessonId}/${i}`]) n++;
  return n;
}

/** 期限の来た復習問題。並べ替え・書く問題は時間がかかるので、復習では予測・選択・トレース・穴埋めだけにする */
export function dueReviews(s: State, now = Date.now()): Problem[] {
  const items = [...allProblems.values()]
    .map((x) => x.problem)
    .filter((p) => p.type === 'predict' || p.type === 'choice' || p.type === 'fill');
  return pickReview(items, s.cards, now, 10);
}
