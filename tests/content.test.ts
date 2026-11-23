// 教材の検査。例と参照解が実際に動き、問題として成り立っているかを確かめる
import { describe, expect, it } from 'vitest';
import { COURSES, KCS } from '../src/content';
import { PLAY_FS } from '../src/content/playground';
import type { Problem } from '../src/content/types';
import { run } from '../src/shell/shell';
import { instantiate, referenceCode, runTests } from '../src/learn/grade';

const problems: Problem[] = [];
const reads: { title: string; code: string; fs?: Problem['fs'] }[] = [];
for (const c of COURSES) for (const u of c.units) {
  for (const l of u.lessons) for (const s of l.steps) {
    if (s.kind === 'problem') problems.push(s.problem);
    else if (s.example) reads.push({ title: `${u.id}/${s.title}`, code: s.example, fs: s.fs });
  }
  problems.push(...u.check);
}
const SEEDS = [1, 2, 3, 1000, 424242];
const kcIds = new Set(KCS.map((k) => k.id));

describe('教材の形', () => {
  it('問題 ID は重複しない', () => {
    const ids = problems.map((p) => p.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
  it('単元 ID はコースをまたいでも重複しない', () => {
    const ids = COURSES.flatMap((c) => c.units.map((u) => u.id));
    expect(ids.length).toBe(new Set(ids).size);
  });
  it('KC はすべて定義済みで、どの KC もどこかの単元で扱う', () => {
    for (const p of problems) for (const k of p.kcs) expect(kcIds.has(k), `${p.id}: ${k}`).toBe(true);
    const used = new Set(COURSES.flatMap((c) => c.units.flatMap((u) => u.kcs)));
    for (const k of used) expect(kcIds.has(k), k).toBe(true);
    for (const k of kcIds) expect(used.has(k), k).toBe(true);
  });
  it('混同しやすい KC は互いに指し合う', () => {
    for (const k of KCS) for (const o of k.confusable ?? []) {
      expect(KCS.find((x) => x.id === o)?.confusable, `${k.id} → ${o}`).toContain(k.id);
    }
  });
});

describe('例題が動く', () => {
  for (const ex of reads) {
    it(ex.title, () => {
      const r = run(ex.code, { fs: ex.fs });
      expect(r.error, JSON.stringify(r.error)).toBeUndefined();
      expect(r.screen.length).toBeGreaterThan(0);
      expect(r.ok, r.stderr).toBe(true);
    });
  }
  it('自由に打つ画面の初めのファイルが作れる', () => {
    expect(run('ls -a\n', { fs: PLAY_FS }).ok).toBe(true);
  });
});

describe('問題が成り立つ', () => {
  for (const p0 of problems) {
    it(p0.id, () => {
      for (const seed of p0.params ? SEEDS : [1]) {
        const p = instantiate(p0, seed);
        expect(JSON.stringify(p), '置き換え残り').not.toMatch(/\$[a-z]\w*/);
        switch (p.type) {
          case 'predict': {
            const r = run(p.code, { fs: p.fs, cwd: p.cwd });
            expect(r.error, `${p.id} ${JSON.stringify(r.error)}`).toBeUndefined();
            expect(r.screen.trim().length, p.id).toBeGreaterThan(0);
            break;
          }
          case 'choice':
            expect(p.answer).toBeLessThan(p.choices.length);
            break;
          case 'parsons': case 'fill': case 'write': {
            const ref = referenceCode(p);
            const r = run(ref, { fs: p.fs, cwd: p.cwd });
            expect(r.ok, `${p.id} 参照解が失敗: ${r.stderr}`).toBe(true);
            const g = runTests(ref, ref, p);
            expect(g.ok, p.id).toBe(true);
            // 何も打たない・書き始めのまま・穴を空けたままでは合格しない
            const blank = p.type === 'write' ? p.starter : p.type === 'fill' ? p.code.replace(/___/g, '') : '';
            expect(runTests(blank, ref, p).ok, `${p.id} 空のまま合格する`).toBe(false);
            if (p.type === 'parsons') {
              // 使わない行を混ぜた並びでは合格しない
              for (const d of p.distractors ?? []) {
                const bad = [...p.lines.slice(0, -1), d, p.lines[p.lines.length - 1]].join('\n') + '\n';
                const swapped = p.lines.map((l) => (l === p.lines[0] ? d : l)).join('\n') + '\n';
                expect(runTests(bad, ref, p).ok && runTests(swapped, ref, p).ok, `${p.id} 誤りの行でも合格する: ${d}`).toBe(false);
              }
            }
            break;
          }
        }
      }
    });
  }
});
