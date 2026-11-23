// 作品コース「ログ調査」。1 台のサーバーの認証ログから、総当たり攻撃と侵入の跡を本編のコマンドだけで突き止める
// IP は文書用に予約された範囲(192.0.2.0/24・198.51.100.0/24・203.0.113.0/24)と、家の中の 192.168.1.10 だけを使う
import type { Course, Problem } from './types';
import type { FsSpec } from '../shell/fs';

/** 段落を空行でつなぐ。箇条書きは 1 つの文字列の中で改行してまとめる */
const L = (...s: string[]) => s.join('\n\n');

const LOG_DIR = '/var/log';

/**
 * 調べる認証ログ。筋書き:
 * 03 時台に 203.0.113.5 が root や存在しない名前で総当たり、
 * 04 時台に 198.51.100.23 が you のパスワードを当てて入り込み、sudo で /etc/shadow を読んだ。
 * 192.168.1.10 は持ち主が家から入った正しい記録
 */
const AUTH = [
  'Nov 23 02:58:10 michi sshd[1180]: Accepted publickey for you from 192.168.1.10 port 50100 ssh2',
  'Nov 23 03:12:01 michi sshd[1201]: Failed password for root from 203.0.113.5 port 52011 ssh2',
  'Nov 23 03:12:03 michi sshd[1202]: Failed password for root from 203.0.113.5 port 52012 ssh2',
  'Nov 23 03:12:05 michi sshd[1203]: Failed password for invalid user admin from 203.0.113.5 port 52013 ssh2',
  'Nov 23 03:12:07 michi sshd[1204]: Failed password for invalid user test from 203.0.113.5 port 52014 ssh2',
  'Nov 23 03:12:09 michi sshd[1205]: Failed password for root from 203.0.113.5 port 52015 ssh2',
  'Nov 23 03:12:11 michi sshd[1206]: Failed password for invalid user admin from 203.0.113.5 port 52016 ssh2',
  'Nov 23 04:40:22 michi sshd[1310]: Failed password for you from 198.51.100.23 port 40001 ssh2',
  'Nov 23 04:40:25 michi sshd[1311]: Failed password for you from 198.51.100.23 port 40002 ssh2',
  'Nov 23 04:40:28 michi sshd[1312]: Failed password for you from 198.51.100.23 port 40003 ssh2',
  'Nov 23 04:40:31 michi sshd[1313]: Accepted password for you from 198.51.100.23 port 40004 ssh2',
  'Nov 23 04:41:02 michi sudo:      you : TTY=pts/1 ; PWD=/home/you ; USER=root ; COMMAND=/bin/cat /etc/shadow',
  'Nov 23 05:00:01 michi CRON[1400]: pam_unix(cron:session): session opened for user root',
  'Nov 23 07:15:44 michi sshd[1500]: Failed password for invalid user oracle from 192.0.2.77 port 61000 ssh2',
  'Nov 23 07:15:47 michi sshd[1501]: Failed password for root from 192.0.2.77 port 61001 ssh2',
  'Nov 23 09:02:13 michi sshd[1600]: Accepted publickey for you from 192.168.1.10 port 50200 ssh2',
].join('\n') + '\n';

/** 採点で隠して使う、別の夜のログ。答えを丸暗記しても通らないように、IP も名前も回数も変える */
const AUTH2 = [
  'Nov 24 01:05:00 michi sshd[2001]: Failed password for invalid user pi from 198.51.100.200 port 33001 ssh2',
  'Nov 24 01:05:02 michi sshd[2002]: Failed password for invalid user pi from 198.51.100.200 port 33002 ssh2',
  'Nov 24 01:05:04 michi sshd[2003]: Failed password for root from 198.51.100.200 port 33003 ssh2',
  'Nov 24 01:05:06 michi sshd[2004]: Failed password for invalid user ubuntu from 198.51.100.200 port 33004 ssh2',
  'Nov 24 02:10:10 michi sshd[2100]: Failed password for root from 192.0.2.9 port 41000 ssh2',
  'Nov 24 03:30:00 michi sshd[2200]: Failed password for you from 203.0.113.99 port 50001 ssh2',
  'Nov 24 03:30:04 michi sshd[2201]: Accepted password for you from 203.0.113.99 port 50002 ssh2',
  'Nov 24 03:31:10 michi sudo:      you : TTY=pts/0 ; PWD=/home/you ; USER=root ; COMMAND=/usr/bin/id',
  'Nov 24 08:00:00 michi sshd[2300]: Accepted publickey for you from 192.168.1.10 port 51000 ssh2',
].join('\n') + '\n';

/** 本物の auth.log は root と adm グループしか読めないが、ここでは練習のため誰でも読めるようにしておく */
const fsOf = (log: string): FsSpec => ({ [`${LOG_DIR}/auth.log`]: { content: log, mode: '644', owner: 'root' } });
const FS = fsOf(AUTH);
const HIDDEN = [{}, { fs: fsOf(AUTH2), hidden: true }];

/** ログのある場所から始める問題の共通部分 */
const at = { fs: FS, cwd: LOG_DIR } satisfies Partial<Problem>;

export const LOGS: Course = {
  id: 'logs',
  title: '作品: ログ調査',
  summary: 'あるサーバーの認証ログを調べ、どこから攻撃され、侵入されたのか、何をされたのかを本編のコマンドだけで突き止めて報告書にまとめます。本編の「⑤ 探す・並べる・数える」まで終えると取り組めます。',
  units: [
    {
      id: 'logs-open',
      title: 'ログを開く',
      summary: '/var/log の auth.log の大きさと形をつかみ、失敗したログインを数える',
      kcs: ['grep', 'headtail', 'wc'],
      lessons: [{
        id: 'l1',
        title: '事件の知らせ',
        steps: [
          {
            kind: 'read',
            title: 'サーバーの様子がおかしい',
            body: L(
              'あなたが管理しているサーバー michi で、夜中に見覚えのない動きがあったと知らせが来ました。このコースでは、記録(ログ)だけを手がかりに、何が起きたのかを調べます。',
              'Linux では、ログの多くが `/var/log` に置かれます。`auth.log` には、ログインや sudo のような「だれが入ろうとしたか」の記録が 1 行に 1 件ずつ、時刻の順に足されていきます。',
              '本物のサーバーでは、auth.log は root と adm グループしか読めません。調べるときは `sudo` を付けます。ここでは練習のため、だれでも読めるようにしてあります。',
              'まずは何行あるか、最初と最後はどんな行かを見ます。いきなり cat で全部出さないのは、本物のログは何万行もあるからです。',
            ),
            example: 'cd /var/log\nls -l\nwc -l auth.log\nhead -n 3 auth.log\ntail -n 2 auth.log\n',
            fs: FS,
          },
          {
            kind: 'read',
            title: '1 行の読み方',
            body: L(
              'sshd(外からログインを受け付けるプログラム)の行は、次の形をしています。',
              '`Nov 23 03:12:01 michi sshd[1201]: Failed password for root from 203.0.113.5 port 52011 ssh2`',
              '- `Nov 23 03:12:01` いつ\n- `michi` どのサーバーで\n- `Failed password` パスワードが違って失敗した(成功なら `Accepted`)\n- `for root` どの名前で入ろうとしたか\n- `from 203.0.113.5` どこから来たか(IP)',
              '存在しない名前で試されたときは `for invalid user admin` のように `invalid user` が付きます。',
            ),
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-open-1',
              type: 'write',
              kcs: ['wc'],
              ...at,
              prompt: 'auth.log が何行あるかを表示してください。',
              starter: '',
              solution: 'wc -l auth.log\n',
              tests: HIDDEN,
              hints: ['行を数えるのは wc -l です。'],
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-open-2',
              type: 'choice',
              kcs: ['grep'],
              ...at,
              prompt: '次の行は何を表していますか。',
              code: 'Nov 23 04:40:31 michi sshd[1313]: Accepted password for you from 198.51.100.23 port 40004 ssh2\n',
              choices: [
                { text: '198.51.100.23 から you としてログインしようとして失敗した', why: '失敗なら Failed です。Accepted は受け入れられた、つまり成功です。' },
                { text: '198.51.100.23 から you として、パスワードでログインに成功した', why: '正解です。' },
                { text: 'you が 198.51.100.23 へログインした', why: 'from の後ろは、入ってきた側の IP です。' },
                { text: 'パスワードが変更された', why: 'パスワードの変更は、別の形の行で記録されます。' },
              ],
              answer: 1,
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-open-3',
              type: 'write',
              kcs: ['grep'],
              ...at,
              prompt: 'パスワードが違って失敗したログイン(Failed password の行)が何件あるかを表示してください。数だけを出します。',
              starter: '',
              solution: 'grep -c "Failed password" auth.log\n',
              tests: HIDDEN,
              hints: ['探す文字列に空白が入るときは、引用符で囲みます。', 'grep -c で数だけが出ます。'],
            },
          },
        ],
      }],
      check: [
        {
          id: 'logs-open-check-1',
          type: 'predict',
          kcs: ['grep'],
          ...at,
          prompt: '次のコマンドは何を表示しますか(ログはファイルの木で見られます)。',
          code: 'grep -c Accepted auth.log\n',
        },
        {
          id: 'logs-open-check-2',
          type: 'write',
          kcs: ['grep', 'headtail', 'pipe'],
          ...at,
          prompt: '失敗したログイン(Failed password の行)のうち、最後の 2 件だけを表示してください。',
          starter: '',
          solution: 'grep "Failed password" auth.log | tail -n 2\n',
          tests: HIDDEN,
          hints: ['grep で絞ってから、| で tail へ渡します。'],
        },
      ],
    },
    {
      id: 'logs-ip',
      title: '攻撃元を数える',
      summary: '失敗したログインの IP を取り出し、どこから何回来たかを多い順に並べる',
      kcs: ['cut', 'sort', 'uniq', 'grep'],
      lessons: [{
        id: 'l1',
        title: 'IP を取り出す',
        steps: [
          {
            kind: 'read',
            title: 'cut で取れない列',
            body: L(
              '空白で区切ると、ふつうの行では IP は 11 列目です。ところが `invalid user admin` の行は 2 語多いので、IP は 13 列目にずれます。`cut -d " " -f 11` では、IP と名前が混ざってしまいます。',
              'こういうときは、grep の `-o`(合った部分だけを出す)を使います。`grep -oE "from [0-9.]+"` は `from` の後に数字とドットが続く部分だけを取り出します。`[0-9.]+` は「数字かドットが 1 文字以上」という意味です。',
              'そこから `cut -d " " -f 2` で IP だけにすれば、本編で覚えた `sort | uniq -c | sort -nr` で数えられます。',
            ),
            example: 'grep Failed auth.log | cut -d " " -f 11\ngrep Failed auth.log | grep -oE "from [0-9.]+"\ngrep Failed auth.log | grep -oE "from [0-9.]+" | cut -d " " -f 2 | sort | uniq -c | sort -nr\n',
            fs: FS,
            cwd: LOG_DIR,
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-ip-1',
              type: 'choice',
              kcs: ['cut'],
              ...at,
              prompt: '`grep Failed auth.log | cut -d " " -f 11` の出力に、IP ではなく admin や test が混ざるのはなぜですか。',
              choices: [
                { text: 'invalid user の行は語が 2 つ多く、IP が後ろにずれるから', why: '正解です。区切りの数で列を決める cut は、行の形がそろっていないと使えません。' },
                { text: 'cut は IP を読めないから', why: 'cut は中身を問わず、区切りで切るだけです。' },
                { text: '-d " " ではなく -d , にするべきだから', why: 'このログは空白で区切られています。' },
                { text: 'grep Failed の探し方が間違っているから', why: '探した行は正しく、切り方の問題です。' },
              ],
              answer: 0,
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-ip-2',
              type: 'fill',
              kcs: ['grep'],
              ...at,
              prompt: '失敗した行から、「from IP」の部分だけを取り出してください。',
              code: 'grep Failed auth.log | grep ___ "from [0-9.]+"\n',
              answers: ['-oE'],
              tests: HIDDEN,
              explain: '-o は合った部分だけを、-E は + のような書き方(拡張正規表現)を使えるようにします。',
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-ip-3',
              type: 'write',
              kcs: ['grep', 'cut', 'sort', 'uniq'],
              ...at,
              prompt: '失敗したログインの IP ごとの回数を、多い順に表示してください。',
              starter: 'grep Failed auth.log | grep -oE "from [0-9.]+"',
              solution: 'grep Failed auth.log | grep -oE "from [0-9.]+" | cut -d " " -f 2 | sort | uniq -c | sort -nr\n',
              tests: HIDDEN,
              hints: ['書き始めの行の出力は「from 203.0.113.5」の形です。cut で 2 列目を取ります。', 'その後は sort | uniq -c | sort -nr です。'],
            },
          },
        ],
      }],
      check: [
        {
          id: 'logs-ip-check-1',
          type: 'write',
          kcs: ['grep', 'cut', 'sort', 'uniq'],
          ...at,
          prompt: '失敗したログインがあった IP の一覧を、重なりなしで表示してください(回数は要りません)。',
          starter: '',
          solution: 'grep Failed auth.log | grep -oE "from [0-9.]+" | cut -d " " -f 2 | sort -u\n',
          tests: HIDDEN,
          hints: ['sort | uniq か、sort -u で重なりを除けます。'],
        },
        {
          id: 'logs-ip-check-2',
          type: 'predict',
          kcs: ['grep', 'cut'],
          ...at,
          prompt: '次のコマンドは何を表示しますか。',
          code: 'grep "Failed password for you" auth.log | grep -oE "from [0-9.]+" | cut -d " " -f 2 | uniq\n',
        },
      ],
    },
    {
      id: 'logs-user',
      title: '狙われた名前',
      summary: 'どの名前で入ろうとしたかを数え、総当たりの手口を読む',
      kcs: ['grep', 'cut', 'sort', 'uniq'],
      lessons: [{
        id: 'l1',
        title: '試された名前',
        steps: [
          {
            kind: 'read',
            title: '総当たり攻撃',
            body: L(
              'インターネットにつながったサーバーには、よくある名前とパスワードを片端から試す「総当たり攻撃」が毎日のように来ます。',
              'よく狙われるのは root、admin、test、oracle、pi、ubuntu のように、多くのサーバーにありそうな名前です。存在しない名前で来た試みは `invalid user 名前` として記録されます。',
              '狙われた名前が分かると、root のログインを禁止する、パスワードの代わりに鍵(publickey)を使う、といった守りを決められます。',
            ),
            example: 'grep -c "Failed password for root" auth.log\ngrep -o "invalid user [a-z]*" auth.log\ngrep -o "invalid user [a-z]*" auth.log | cut -d " " -f 3 | sort | uniq -c | sort -nr\n',
            fs: FS,
            cwd: LOG_DIR,
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-user-1',
              type: 'predict',
              kcs: ['grep'],
              ...at,
              prompt: '次のコマンドは何を表示しますか。',
              code: 'grep -c "Failed password for root" auth.log\n',
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-user-2',
              type: 'write',
              kcs: ['grep', 'cut', 'sort', 'uniq'],
              ...at,
              prompt: '存在しない名前(invalid user)で試された名前ごとの回数を、多い順に表示してください。',
              starter: '',
              solution: 'grep -o "invalid user [a-z]*" auth.log | cut -d " " -f 3 | sort | uniq -c | sort -nr\n',
              tests: HIDDEN,
              hints: ['grep -o "invalid user [a-z]*" で「invalid user 名前」の部分だけが出ます。', '名前は空白で区切って 3 列目です。'],
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-user-3',
              type: 'choice',
              kcs: ['grep'],
              prompt: 'このログから考えて、まず取るべき守りとして適したものはどれですか。',
              choices: [
                { text: 'パスワードでのログインをやめ、鍵(publickey)だけにする', why: '正解です。この事件は you のパスワードが当てられたことが原因です。鍵だけにすれば、パスワードの総当たりは効かなくなります。' },
                { text: 'auth.log を消して記録を残さないようにする', why: 'ログを消すと、次に何が起きても調べられなくなります。攻撃者が跡を消すためによくやる手口です。' },
                { text: 'ls を使わないようにする', why: 'ls は攻撃と関係ありません。' },
                { text: '何もしない。失敗したログインは無害だから', why: '失敗の後に成功した記録があります。調べ終わるまでは無害とは言えません。' },
              ],
              answer: 0,
            },
          },
        ],
      }],
      check: [
        {
          id: 'logs-user-check-1',
          type: 'write',
          kcs: ['grep', 'cut', 'sort'],
          ...at,
          prompt: 'invalid user で試された名前の一覧を、重なりなしで表示してください。',
          starter: '',
          solution: 'grep -o "invalid user [a-z]*" auth.log | cut -d " " -f 3 | sort -u\n',
          tests: HIDDEN,
          hints: ['名前を取り出してから sort -u です。'],
        },
      ],
    },
    {
      id: 'logs-breach',
      title: '侵入を見つける',
      summary: '成功したログインから見覚えのない IP を探し、その相手が入った後に何をしたかをたどる',
      kcs: ['grep', 'pipe'],
      lessons: [{
        id: 'l1',
        title: '失敗の後の成功',
        steps: [
          {
            kind: 'read',
            title: '見覚えのない成功',
            body: L(
              '失敗がいくら多くても、入られていなければ被害はありません。本当に怖いのは「失敗が続いた後の成功」です。',
              'まず成功(Accepted)の行だけを出し、そこから自分がいつも使う場所(家の 192.168.1.10)を `grep -v` で除きます。残ったものが見覚えのないログインです。',
              '怪しい IP が見つかったら、その IP の行を全部出して時刻の順に眺めます。さらに、入った後の sudo の記録を見れば、管理者の権限で何をしたかが分かります。',
            ),
            example: 'grep Accepted auth.log\ngrep Accepted auth.log | grep -v 192.168.1.10\ngrep 198.51.100.23 auth.log\ngrep sudo auth.log\n',
            fs: FS,
            cwd: LOG_DIR,
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-breach-1',
              type: 'write',
              kcs: ['grep', 'pipe'],
              ...at,
              prompt: '成功したログインのうち、家(192.168.1.10)以外から来たものだけを表示してください。',
              starter: '',
              solution: 'grep Accepted auth.log | grep -v 192.168.1.10\n',
              tests: HIDDEN,
              hints: ['grep Accepted で成功だけにします。', '| grep -v で、家の IP の行を除きます。'],
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-breach-2',
              type: 'predict',
              kcs: ['grep', 'cut'],
              ...at,
              prompt: '入り込んだ相手が sudo で何をしたかを調べます。次のコマンドは何を表示しますか。',
              code: 'grep COMMAND= auth.log | cut -d "=" -f 5\n',
              explain: '= で区切ると、5 つ目が実行したコマンドです。/etc/shadow には、全員のパスワードを変換した値が入っています。持ち出されると、時間をかけて元のパスワードを割り出されるおそれがあります。',
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-breach-3',
              type: 'choice',
              kcs: ['grep'],
              prompt: 'ここまでの調べで分かった筋書きとして正しいものはどれですか。',
              choices: [
                { text: '203.0.113.5 が root で入り込み、/etc/shadow を読んだ', why: '203.0.113.5 は失敗ばかりで、成功の記録はありません。' },
                { text: '198.51.100.23 が you のパスワードを 4 回目で当てて入り、sudo で /etc/shadow を読んだ', why: '正解です。04:40 台の失敗 3 回、成功 1 回、その直後の sudo の行がつながっています。' },
                { text: '192.168.1.10 から攻撃された', why: 'それは家からのいつものログインで、鍵(publickey)で入っています。' },
                { text: '何も起きていない', why: '見覚えのない IP からの成功と、その後の sudo があります。' },
              ],
              answer: 1,
            },
          },
        ],
      }],
      check: [
        {
          id: 'logs-breach-check-1',
          type: 'write',
          kcs: ['grep', 'pipe', 'cut'],
          ...at,
          prompt: '成功したログインのうち、家(192.168.1.10)以外から来たものの IP だけを表示してください。',
          starter: '',
          solution: 'grep Accepted auth.log | grep -v 192.168.1.10 | grep -oE "from [0-9.]+" | cut -d " " -f 2\n',
          tests: HIDDEN,
          hints: ['前の問題の続きに、IP を取り出す grep -oE と cut をつなぎます。'],
        },
      ],
    },
    {
      id: 'logs-report',
      title: '報告書にまとめる',
      summary: '調べた結果を > と >> で 1 つのファイルにまとめ、ほかの人に渡せる形にする',
      kcs: ['redirect', 'pipe', 'grep'],
      lessons: [{
        id: 'l1',
        title: '報告書を作る',
        steps: [
          {
            kind: 'read',
            title: '結果をファイルに残す',
            body: L(
              '調べた結果は、画面に出して終わりにせず、ファイルに残して共有します。後から同じ手順で確かめ直せるよう、何を打ったかも書いておくのが調査の作法です。',
              '1 行目は `>` で作り、2 行目からは `>>` で足していきます。`>` を何度も使うと、それまでの行が消えてしまいます。',
              '報告書はホームに置きます。/var/log は root のものなので、あなたは書き込めません。',
            ),
            example: 'echo "## 失敗したログインの回数" > ~/report.txt\ngrep -c "Failed password" auth.log >> ~/report.txt\necho "## 攻撃元" >> ~/report.txt\ngrep Failed auth.log | grep -oE "from [0-9.]+" | cut -d " " -f 2 | sort | uniq -c | sort -nr >> ~/report.txt\ncat ~/report.txt\n',
            fs: FS,
            cwd: LOG_DIR,
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-report-1',
              type: 'predict',
              kcs: ['redirect', 'perm'],
              ...at,
              prompt: 'いま /var/log にいます。次のコマンドを打つと、画面に何が出ますか。',
              code: 'echo "調査メモ" > report.txt\n',
              explain: '/var/log の持ち主は root で、あなたには書く権限がありません。報告書は ~/report.txt のようにホームに書きます。',
            },
          },
          {
            kind: 'problem',
            problem: {
              id: 'logs-report-2',
              type: 'parsons',
              kcs: ['redirect'],
              ...at,
              prompt: '~/report.txt に、見出しと、成功したログインの行をこの順で書いてください。使わない行が 1 つあります。',
              lines: ['echo "## 成功したログイン" > ~/report.txt', 'grep Accepted auth.log >> ~/report.txt'],
              distractors: ['grep Accepted auth.log > ~/report.txt'],
              tests: HIDDEN,
              check: ['out', 'fs'],
              explain: '2 行目を > にすると、1 行目の見出しが消えてしまいます。',
            },
          },
        ],
      }],
      check: [
        {
          id: 'logs-report-check-1',
          type: 'write',
          kcs: ['redirect', 'pipe', 'grep'],
          ...at,
          prompt: '最後の報告書です。~/report.txt に、(1) `## 侵入元` という見出し、(2) 家(192.168.1.10)以外から成功したログインの IP、(3) `## sudo で実行されたコマンド` という見出し、(4) sudo で実行されたコマンド(COMMAND= の後ろ)の 4 行を、この順で書いてください。画面には何も出しません。',
          starter: '',
          solution: [
            'echo "## 侵入元" > ~/report.txt',
            'grep Accepted auth.log | grep -v 192.168.1.10 | grep -oE "from [0-9.]+" | cut -d " " -f 2 >> ~/report.txt',
            'echo "## sudo で実行されたコマンド" >> ~/report.txt',
            'grep COMMAND= auth.log | cut -d "=" -f 5 >> ~/report.txt',
          ].join('\n') + '\n',
          tests: HIDDEN,
          check: ['out', 'fs'],
          hints: [
            '1 行目だけ > で作り、残りは >> で足します。',
            '2 行目は「侵入を見つける」の確認テスト、4 行目は sudo の問題で使った形です。',
          ],
        },
      ],
    },
  ],
};
