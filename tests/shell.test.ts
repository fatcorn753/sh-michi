import { describe, expect, it } from 'vitest';
import { run } from '../src/shell/shell';
import type { FsSpec } from '../src/shell/fs';

const H = '/home/you';
const FS: FsSpec = {
  [`${H}/memo.txt`]: 'apple\nbanana\ncherry\n',
  [`${H}/notes/`]: null,
  [`${H}/notes/a.txt`]: 'one\n',
  [`${H}/notes/b.md`]: 'two\n',
  [`${H}/.secret`]: 'hidden\n',
};
const sh = (src: string, fs: FsSpec = FS) => run(src, { fs, trace: true });
const out = (src: string, fs: FsSpec = FS) => sh(src, fs).stdout;
const err = (src: string, fs: FsSpec = FS) => sh(src, fs).stderr;

describe('場所', () => {
  it('pwd と cd', () => {
    expect(out('pwd')).toBe(`${H}\n`);
    expect(out('cd notes\npwd\ncd ..\npwd\ncd /tmp\ncd -\ncd\npwd')).toBe(`${H}/notes\n${H}\n${H}\n${H}\n`);
    expect(out('cd ~/notes && pwd')).toBe(`${H}/notes\n`);
  });
  it('cd の誤り', () => {
    expect(err('cd nope')).toBe('bash: cd: nope: No such file or directory\n');
    expect(err('cd memo.txt')).toBe('bash: cd: memo.txt: Not a directory\n');
    expect(err('cd /root')).toBe('bash: cd: /root: Permission denied\n');
    const r = sh('cd note');
    expect(r.notes[0].msg).toContain('notes');
  });
  it('ls は名前の順で、画面へは横に並べ、パイプへは 1 行ずつ', () => {
    expect(out('ls')).toBe('memo.txt  notes\n');
    expect(out('ls | cat')).toBe('memo.txt\nnotes\n');
    expect(out('ls -a')).toBe('.  ..  .secret  memo.txt  notes\n');
    expect(out('ls -A notes')).toBe('a.txt  b.md\n');
    expect(out('ls -F')).toBe('memo.txt  notes/\n');
    expect(out('ls notes memo.txt')).toBe('memo.txt\n\nnotes:\na.txt  b.md\n');
  });
  it('ls -l', () => {
    expect(out('ls -l')).toBe(
      'total 8\n' +
      '-rw-r--r-- 1 you you   20 Nov 23 09:00 memo.txt\n' +
      'drwxr-xr-x 2 you you 4096 Nov 23 09:00 notes\n',
    );
    expect(out('ls -l memo.txt')).toBe('-rw-r--r-- 1 you you 20 Nov 23 09:00 memo.txt\n');
  });
  it('ls の誤り', () => {
    const r = sh('ls nope');
    expect(r.stderr).toBe("ls: cannot access 'nope': No such file or directory\n");
    expect(r.exitCode).toBe(2);
    expect(err('ls -z')).toContain("ls: invalid option -- 'z'");
  });
  it('長い一覧は 80 桁に収まるよう縦に並べる', () => {
    const fs: FsSpec = {};
    for (let i = 0; i < 30; i++) fs[`${H}/file-${String(i).padStart(2, '0')}.txt`] = '';
    const lines = out('ls', fs).split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(80);
    expect(lines[0].startsWith('file-00.txt')).toBe(true);
    expect(lines[1].startsWith('file-01.txt')).toBe(true);
  });
});

describe('ファイル操作', () => {
  it('mkdir・touch・cp・mv・rm', () => {
    const r = sh('mkdir work\ntouch work/a\ncp memo.txt work/\nmv work/a work/b\nls work\nrm work/memo.txt\nls work');
    expect(r.stdout).toBe('b  memo.txt\nb\n');
    expect(r.ok).toBe(true);
  });
  it('mkdir -p と誤り', () => {
    expect(err('mkdir a/b/c')).toBe("mkdir: cannot create directory 'a/b/c': No such file or directory\n");
    expect(sh('mkdir a/b/c').notes.some((n) => n.msg.includes('mkdir -p'))).toBe(true);
    expect(out('mkdir -p a/b/c && ls a/b')).toBe('c\n');
    expect(err('mkdir notes')).toBe("mkdir: cannot create directory 'notes': File exists\n");
  });
  it('rm はディレクトリに -r が要る', () => {
    expect(err('rm notes')).toBe("rm: cannot remove 'notes': Is a directory\n");
    expect(out('rm -r notes; ls')).toBe('memo.txt\n');
    expect(err('rm nope')).toBe("rm: cannot remove 'nope': No such file or directory\n");
    expect(err('rm -f nope')).toBe('');
    expect(err('rmdir notes')).toBe("rmdir: failed to remove 'notes': Directory not empty\n");
  });
  it('cp と mv の細かい動き', () => {
    expect(err('cp notes x')).toBe("cp: -r not specified; omitting directory 'notes'\n");
    expect(out('cp -r notes n2 && ls n2')).toBe('a.txt  b.md\n');
    expect(out('mv memo.txt notes && ls notes')).toBe('a.txt  b.md  memo.txt\n');
    expect(err('mv nope x')).toBe("mv: cannot stat 'nope': No such file or directory\n");
    expect(err('cp memo.txt notes/a.txt notes/b.md')).toBe("cp: target 'notes/b.md' is not a directory\n");
    expect(err('mv notes notes/x')).toBe("mv: cannot move 'notes' to a subdirectory of itself, 'notes/x'\n");
    expect(err('mkdir notes/x; mv notes notes/x')).toBe("mv: cannot move 'notes' to a subdirectory of itself, 'notes/x/notes'\n");
  });
  it('持ち主でない場所には書けない', () => {
    expect(err('touch /etc/x')).toBe("touch: cannot touch '/etc/x': Permission denied\n");
    expect(err('rm /etc/hostname')).toBe("rm: cannot remove '/etc/hostname': Permission denied\n");
  });
});

describe('中身を見る', () => {
  it('cat・head・tail・wc', () => {
    expect(out('cat memo.txt')).toBe('apple\nbanana\ncherry\n');
    expect(out('cat -n memo.txt')).toBe('     1\tapple\n     2\tbanana\n     3\tcherry\n');
    expect(out('head -n 2 memo.txt')).toBe('apple\nbanana\n');
    expect(out('head -1 memo.txt')).toBe('apple\n');
    expect(out('tail -n 1 memo.txt')).toBe('cherry\n');
    expect(out('tail -n +2 memo.txt')).toBe('banana\ncherry\n');
    expect(out('wc -l memo.txt')).toBe('3 memo.txt\n');
    expect(out('wc memo.txt')).toBe(' 3  3 20 memo.txt\n');
    expect(out('cat memo.txt | wc -l')).toBe('3\n');
    expect(out('wc -l memo.txt notes/a.txt')).toBe('3 memo.txt\n1 notes/a.txt\n4 total\n');
  });
  it('複数のファイルの head には見出しが付く', () => {
    expect(out('head -n 1 memo.txt notes/a.txt')).toBe('==> memo.txt <==\napple\n\n==> notes/a.txt <==\none\n');
  });
  it('cat の誤り', () => {
    expect(err('cat notes')).toBe('cat: notes: Is a directory\n');
    expect(err('cat memo.tx')).toBe('cat: memo.tx: No such file or directory\n');
    expect(sh('cat memo.tx').notes[0].msg).toContain('memo.txt');
    expect(err('cat /root/x')).toBe('cat: /root/x: Permission denied\n');
  });
  it('知らないコマンドには候補を出す', () => {
    const r = sh('sl');
    expect(r.stderr).toBe('bash: sl: command not found\n');
    expect(r.exitCode).toBe(127);
    expect(r.notes[0].msg).toContain('ls');
    expect(sh('vim memo.txt').notes[0].msg).toContain('エディタ');
  });
});

describe('展開・リダイレクト・パイプ', () => {
  it('ワイルドカード', () => {
    expect(out('echo notes/*')).toBe('notes/a.txt notes/b.md\n');
    expect(out('echo *.txt')).toBe('memo.txt\n');
    expect(out('echo *')).toBe('memo.txt notes\n');
    expect(out('echo .*')).toBe('. .. .secret\n'.replace('. .. ', ''));
    expect(out('echo *.zip')).toBe('*.zip\n');
    expect(out("echo '*.txt'")).toBe('*.txt\n');
    expect(out('echo notes/?.txt')).toBe('notes/a.txt\n');
  });
  it('引用符と変数', () => {
    expect(out('x="a  b"\necho $x\necho "$x"')).toBe('a b\na  b\n');
    expect(out("echo '$HOME' \"$HOME\" ~")).toBe(`$HOME ${H} ${H}\n`);
    expect(out('false; echo $?')).toBe('1\n');
  });
  it('> は先に空にする。>> は足す', () => {
    expect(out('echo hi > a.txt\necho yo >> a.txt\ncat a.txt')).toBe('hi\nyo\n');
    expect(out('sort memo.txt > memo.txt; cat memo.txt')).toBe('');
    expect(sh('sort memo.txt > memo.txt').notes.map((n) => n.msg).join()).toMatch(/空にされています/);
    expect(sh('sort memo.txt > sorted.txt').notes).toEqual([]);
    expect(err('cat memo.txt >> memo.txt')).toBe('cat: memo.txt: input file is output file\n');
  });
  it('< と 2> と 2>&1', () => {
    expect(out('wc -l < memo.txt')).toBe('3\n');
    const r = sh('cat nope 2> e.txt; cat e.txt');
    expect(r.stdout).toBe('cat: nope: No such file or directory\n');
    expect(r.stderr).toBe('');
    expect(out('cat nope 2>&1 | wc -l')).toBe('1\n');
    expect(err('cat nope 2>/dev/null')).toBe('');
  });
  it('&& と ||', () => {
    expect(out('cat nope && echo ok || echo ng')).toBe('ng\n');
    expect(out('true && echo ok')).toBe('ok\n');
  });
  it('文法の誤り', () => {
    const r = sh('ls |');
    expect(r.error?.message).toContain("syntax error near unexpected token `newline'");
    expect(r.ok).toBe(false);
    expect(sh("echo 'abc").error?.hint).toContain('閉じていません');
    expect(sh('ls &').error?.hint).toContain('&&');
  });
});

describe('探す・並べる', () => {
  const LOG: FsSpec = { [`${H}/log.txt`]: 'b 2\na 10\nb 2\nc 1\nA 5\n' };
  it('grep', () => {
    expect(out('grep an memo.txt')).toBe('banana\n');
    expect(out('grep -n an memo.txt')).toBe('2:banana\n');
    expect(out('grep -c a memo.txt')).toBe('2\n');
    expect(out('grep -v a memo.txt')).toBe('cherry\n');
    expect(out('grep -i APPLE memo.txt')).toBe('apple\n');
    expect(out('grep -r o notes')).toBe('notes/a.txt:one\nnotes/b.md:two\n');
    expect(out('grep -E "^(a|c)" memo.txt')).toBe('apple\ncherry\n');
    expect(out('grep "^(a|c)" memo.txt')).toBe('');
    expect(out('grep -o "an" memo.txt')).toBe('an\nan\n');
    expect(sh('grep zzz memo.txt').exitCode).toBe(1);
    expect(err('grep x notes')).toBe('grep: notes: Is a directory\n');
  });
  it('sort と uniq', () => {
    expect(out('sort log.txt', LOG)).toBe('A 5\na 10\nb 2\nb 2\nc 1\n');
    expect(out('sort -k 2 -n log.txt', LOG)).toBe('c 1\nb 2\nb 2\nA 5\na 10\n');
    expect(out('sort -k2,2nr log.txt', LOG)).toBe('a 10\nA 5\nb 2\nb 2\nc 1\n');
    expect(out('sort -u log.txt', LOG)).toBe('A 5\na 10\nb 2\nc 1\n');
    expect(out('sort log.txt | uniq -c', LOG)).toBe('      1 A 5\n      1 a 10\n      2 b 2\n      1 c 1\n');
    expect(out('cut -d " " -f 1 log.txt | sort | uniq -c | sort -rn | head -n 1', LOG)).toBe('      2 b\n');
  });
  it('cut と tr', () => {
    const csv: FsSpec = { [`${H}/s.csv`]: 'name,score\nao,80\nki,95\n' };
    expect(out('cut -d , -f 2 s.csv', csv)).toBe('score\n80\n95\n');
    expect(out('cut -c 1-2 s.csv', csv)).toBe('na\nao\nki\n');
    expect(out('echo hello | tr a-z A-Z')).toBe('HELLO\n');
    expect(out('echo "a  b   c" | tr -s " "')).toBe('a b c\n');
    expect(out('echo hello | tr -d l')).toBe('heo\n');
    expect(err('tr a-z A-Z memo.txt')).toBe("tr: extra operand 'memo.txt'\n");
  });
  it('find', () => {
    expect(out('find notes')).toBe('notes\nnotes/a.txt\nnotes/b.md\n');
    expect(out("find . -name '*.txt'")).toBe('./memo.txt\n./notes/a.txt\n');
    expect(out('find . -type d')).toBe('.\n./notes\n');
    expect(out('find . -maxdepth 1 -type f')).toBe('./.secret\n./memo.txt\n');
  });
});

describe('権限', () => {
  it('chmod で読めなくする・戻す', () => {
    expect(out('chmod 600 memo.txt && ls -l memo.txt')).toBe('-rw------- 1 you you 20 Nov 23 09:00 memo.txt\n');
    expect(out('chmod u+x,g+w memo.txt && ls -l memo.txt')).toBe('-rwxrw-r-- 1 you you 20 Nov 23 09:00 memo.txt\n');
    expect(out('chmod +x memo.txt && ls -l memo.txt')).toBe('-rwxr-xr-x 1 you you 20 Nov 23 09:00 memo.txt\n');
    expect(out('chmod +w memo.txt && ls -l memo.txt')).toBe('-rw-r--r-- 1 you you 20 Nov 23 09:00 memo.txt\n');
    expect(err('chmod 000 memo.txt; cat memo.txt')).toBe('cat: memo.txt: Permission denied\n');
    expect(err('chmod 644 /etc/hostname')).toBe("chmod: changing permissions of '/etc/hostname': Operation not permitted\n");
    expect(err('chmod abc memo.txt')).toBe("chmod: invalid mode: 'abc'\n");
  });
  it('x のないディレクトリには入れない', () => {
    expect(err('chmod 644 notes; cd notes')).toBe('bash: cd: notes: Permission denied\n');
    expect(err('chmod 311 notes; ls notes')).toBe("ls: cannot open directory 'notes': Permission denied\n");
  });
});

describe('1 行ずつの記録', () => {
  it('行ごとに場所とファイルの様子とパイプの各段を残す', () => {
    const r = sh('cd notes\ntouch c.txt\ncat ../memo.txt | head -n 1');
    expect(r.trace.length).toBe(4);
    expect(r.trace[0].line).toBe(0);
    expect(r.trace[1].cwd).toBe(`${H}/notes`);
    expect(r.trace[2].fs.some((e) => e.path === `${H}/notes/c.txt`)).toBe(true);
    expect(r.trace[1].fs.some((e) => e.path === `${H}/notes/c.txt`)).toBe(false);
    expect(r.trace[3].stages.map((s) => s.out)).toEqual(['apple\nbanana\ncherry\n', 'apple\n']);
  });
  it('端末にはプロンプト付きでコマンドを残す', () => {
    const r = sh('cd notes\nls');
    expect(r.term.map((t) => t.text)).toEqual(['you@michi:~$ cd notes', 'you@michi:~/notes$ ls', 'a.txt  b.md\n']);
  });
});
