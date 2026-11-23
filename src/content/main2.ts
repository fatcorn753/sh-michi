// 本編の単元 4〜7: パイプとリダイレクト、grep・sort・uniq、権限、ワイルドカードと find
import type { Unit } from './types';
import { home } from './util';

/** 段落を空行でつなぐ。箇条書きは 1 つの文字列の中で改行してまとめる */
const L = (...s: string[]) => s.join('\n\n');

/** Web サーバーのアクセス記録。IP・方法・場所・結果の番号(200 成功、401 認証の失敗、403 禁止) */
const ACCESS = [
  '10.0.0.5 GET /index.html 200',
  '10.0.0.7 GET /login 200',
  '10.0.0.5 POST /login 401',
  '10.0.0.9 GET /index.html 200',
  '10.0.0.5 POST /login 401',
  '10.0.0.7 GET /admin 403',
  '10.0.0.5 POST /login 401',
  '10.0.0.7 POST /login 200',
].join('\n') + '\n';

/** 採点で隠して使う、別の中身のアクセス記録 */
const ACCESS2 = [
  '192.168.1.20 GET /login 200',
  '192.168.1.30 POST /login 401',
  '192.168.1.30 POST /login 401',
  '192.168.1.40 GET /admin 403',
  '192.168.1.20 GET /index.html 200',
  '192.168.1.30 POST /login 200',
].join('\n') + '\n';

const APP = 'INFO start\nERROR disk full\nWarning: slow\nerror: retry failed\nINFO done\n';

const SCORES = 'name,math,english\naoi,80,72\nkai,95,60\nrin,70,88\n';

export const PIPE: Unit = {
  id: 'pipe',
  title: '④ パイプとリダイレクト',
  summary: '| で出力を次のコマンドへ渡し、> と >> でファイルへ書き、2> でエラーを分ける',
  kcs: ['pipe', 'redirect', 'stderr'],
  lessons: [
    {
      id: 'pipe',
      title: 'コマンドをつなぐ',
      steps: [
        {
          kind: 'read',
          title: '| (パイプ)',
          body: L(
            'コマンドの出力は、ふつう画面に出ます。`コマンド1 | コマンド2` と書くと、1 の出力が画面に出る代わりに 2 の入力になります。',
            '`grep 401 access.log | wc -l` なら、401 を含む行を探し、その行の数を数えます。小さなコマンドをつなぎ合わせて、目的の答えを作るのが Linux の流儀です。',
            '下の例を動かすと、各段が次へ何を渡したかが見られます。',
          ),
          example: 'cat access.log | grep 401\ngrep 401 access.log | wc -l\ngrep login access.log | head -n 2\n',
          fs: home({ 'access.log': ACCESS }),
        },
        {
          kind: 'problem',
          problem: {
            id: 'pipe-pipe-1',
            type: 'predict',
            kcs: ['pipe'],
            prompt: 'access.log の中身はファイルの木で見られます。次のコマンドは何を表示しますか。',
            params: { c: ['200', '401'] },
            fs: home({ 'access.log': ACCESS }),
            code: 'grep $c access.log | wc -l\n',
            explain: 'grep が $c を含む行だけを渡し、wc -l がその行を数えます。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'pipe-pipe-2',
            type: 'fill',
            kcs: ['pipe'],
            prompt: 'POST の行が何行あるかを表示してください。',
            fs: home({ 'access.log': ACCESS }),
            code: 'grep POST access.log ___ wc -l\n',
            answers: ['|'],
            tests: [{}, { fs: home({ 'access.log': ACCESS2 }), hidden: true }],
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'pipe-pipe-3',
            type: 'choice',
            kcs: ['pipe', 'redirect'],
            prompt: '`grep 401 access.log | wc -l` と `grep 401 access.log > wc` の違いはどれですか。',
            choices: [
              { text: '同じ意味で、どちらも行数を表示する', why: '> の後ろはコマンドではなくファイルの名前として扱われます。' },
              { text: '| は wc コマンドに渡し、> は wc という名前のファイルに書く', why: '正解です。| の右はコマンド、> の右はファイルです。' },
              { text: '| はファイルに書き、> はコマンドに渡す', why: '逆です。' },
              { text: '> の方はエラーになる', why: 'エラーにはならず、wc という名前のファイルができます。気づきにくい誤りです。' },
            ],
            answer: 1,
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'pipe-pipe-4',
            type: 'write',
            kcs: ['pipe'],
            prompt: 'access.log から $w を含む行を探し、その最初の 2 行だけを表示してください。',
            params: { w: ['login', 'GET'] },
            fs: home({ 'access.log': ACCESS }),
            starter: '',
            solution: 'grep $w access.log | head -n 2\n',
            tests: [{}, { fs: home({ 'access.log': ACCESS2 }), hidden: true }],
            hints: ['探すのは grep、先頭だけ出すのは head です。', 'grep の出力を | で head へ渡します。'],
          },
        },
      ],
    },
    {
      id: 'redirect',
      title: 'ファイルへ書く・エラーを分ける',
      steps: [
        {
          kind: 'read',
          title: '> と >> と <',
          body: L(
            '`コマンド > ファイル` で、画面に出るはずの出力をファイルに書きます。ファイルがなければ作り、あれば中身を消してから書きます。',
            '`>>` は消さずに最後へ足します。記録をためていくときに使います。',
            '`コマンド < ファイル` は逆向きで、ファイルの中身をコマンドの入力にします。',
            '`>` はコマンドが動く前にファイルを空にします。そのため `sort a.txt > a.txt` は a.txt を空にしてしまいます。結果は別の名前に書いてください。',
          ),
          example: 'grep 401 access.log > fails.txt\ncat fails.txt\necho "--- end" >> fails.txt\nwc -l < fails.txt\n',
          fs: home({ 'access.log': ACCESS }),
        },
        {
          kind: 'read',
          title: '2> でエラーを分ける(エラーの例)',
          body: L(
            'コマンドの出力には 2 つの流れがあります。ふつうの結果が流れる標準出力(1 番)と、エラーが流れる標準エラー出力(2 番)です。`>` が受け取るのは 1 番だけなので、エラーは画面に残ります。',
            '`2> ファイル` でエラーだけをファイルへ、`> ファイル 2>&1` で両方を同じファイルへ書きます。エラーを捨てたいときは `2> /dev/null` と書きます。',
          ),
          example: 'cat nofile.txt\ncat nofile.txt 2> err.txt\ncat err.txt\ncat memo.txt nofile.txt > all.txt 2>&1\ncat all.txt\n',
          fs: home({ 'memo.txt': 'メモ\n' }),
        },
        {
          kind: 'problem',
          problem: {
            id: 'pipe-redir-1',
            type: 'predict',
            kcs: ['redirect'],
            prompt: '次のコマンドで、最後の cat は何を表示しますか。',
            params: { a: ['red', 'cat'], b: ['blue', 'dog'] },
            code: 'echo $a > f.txt\necho $b > f.txt\ncat f.txt\n',
            explain: '> は書く前に中身を消すので、残るのは後から書いた $b だけです。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'pipe-redir-2',
            type: 'predict',
            kcs: ['redirect'],
            prompt: '次のコマンドで、最後の cat は何を表示しますか。',
            params: { a: ['red', 'cat'], b: ['blue', 'dog'] },
            code: 'echo $a > f.txt\necho $b >> f.txt\necho $a >> f.txt\ncat f.txt\n',
            explain: '>> は最後へ足すので、3 行とも残ります。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'pipe-err-1',
            type: 'fill',
            kcs: ['stderr'],
            prompt: 'エラーの文だけを err.txt に書いて、画面には出さないようにしてください。',
            code: 'cat nofile.txt ___ err.txt\n',
            answers: ['2>'],
            tests: [{}],
            check: ['out', 'fs'],
            explain: '2> は 2 番(標準エラー出力)の行き先を変えます。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'pipe-redir-3',
            type: 'write',
            kcs: ['redirect', 'pipe'],
            prompt: 'access.log から 401 を含む行を探し、fails.txt に書いてください。画面には何も出さないでください。',
            fs: home({ 'access.log': ACCESS }),
            starter: '',
            solution: 'grep 401 access.log > fails.txt\n',
            tests: [{}, { fs: home({ 'access.log': ACCESS2 }), hidden: true }],
            check: ['out', 'fs'],
            hints: ['探すのは grep です。', '画面の代わりにファイルへ書くのは > です。'],
          },
        },
      ],
    },
  ],
  check: [
    {
      id: 'pipe-check-1',
      type: 'predict',
      kcs: ['redirect'],
      prompt: '次のコマンドで、最後の cat は何を表示しますか。',
      params: { a: ['one', 'apple'], b: ['two', 'banana'] },
      code: 'echo $a >> log.txt\necho $b > log.txt\necho $a >> log.txt\ncat log.txt\n',
    },
    {
      id: 'pipe-check-2',
      type: 'choice',
      kcs: ['redirect'],
      prompt: 'names.txt を並べ替えて、同じ names.txt に戻したいです。どれが正しいですか。',
      choices: [
        { text: 'sort names.txt > names.txt', why: '> が sort より先に names.txt を空にするので、何も残りません。' },
        { text: 'sort names.txt >> names.txt', why: '元の行の後ろに、並べ替えた行が足されるだけです。' },
        { text: 'sort names.txt > sorted.txt の後に mv sorted.txt names.txt', why: '正解です。別の名前に書いてから置き換えます。' },
        { text: 'sort names.txt | names.txt', why: '| の右はコマンドです。names.txt というコマンドはありません。' },
      ],
      answer: 2,
    },
    {
      id: 'pipe-check-3',
      type: 'write',
      kcs: ['pipe', 'redirect'],
      prompt: 'access.log のうち 403 を含む行の数を数え、その数を count.txt に書いてください。',
      fs: home({ 'access.log': ACCESS }),
      starter: '',
      solution: 'grep 403 access.log | wc -l > count.txt\n',
      tests: [{}, { fs: home({ 'access.log': ACCESS2 }), hidden: true }],
      check: ['out', 'fs'],
      hints: ['grep で探して | で wc -l へ渡します。', '最後のコマンドの出力を > でファイルへ書きます。'],
    },
  ],
};

export const SEARCH: Unit = {
  id: 'search',
  title: '⑤ 探す・並べる・数える',
  summary: 'grep で行を探し、cut で列を切り出し、sort と uniq で並べて数える。ログ調査の基本の道具',
  kcs: ['grep', 'sort', 'uniq', 'cut'],
  lessons: [
    {
      id: 'grep',
      title: 'grep で行を探す',
      steps: [
        {
          kind: 'read',
          title: 'grep とオプション',
          body: L(
            '`grep 文字列 ファイル` は、その文字列を含む行だけを表示します。',
            'よく使うオプション:\n- `-i` 大文字と小文字を区別しない\n- `-v` 含まない行を表示する\n- `-n` 行番号を付ける\n- `-c` 行を出す代わりに、行の数を表示する',
            '`grep -E "401|403"` のように -E を付けると、「401 か 403」のような書き方(正規表現)が使えます。',
          ),
          example: 'grep login access.log\ngrep -v 200 access.log\ngrep -n admin access.log\ngrep -c 401 access.log\ngrep -i error app.log\n',
          fs: home({ 'access.log': ACCESS, 'app.log': APP }),
        },
        {
          kind: 'problem',
          problem: {
            id: 'search-grep-1',
            type: 'predict',
            kcs: ['grep'],
            prompt: 'access.log の中身はファイルの木で見られます。次のコマンドは何を表示しますか。',
            params: { w: ['index', 'admin', 'POST'] },
            fs: home({ 'access.log': ACCESS }),
            code: 'grep -c $w access.log\n',
            explain: '-c は合う行を出す代わりに、その数だけを表示します。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'search-grep-2',
            type: 'choice',
            kcs: ['grep'],
            prompt: '成功(200)でなかったアクセスだけを見たいです。どれを打ちますか。',
            choices: [
              { text: 'grep 200 access.log', why: 'これは成功した行だけを出します。' },
              { text: 'grep -v 200 access.log', why: '正解です。-v は合わない行を出します。' },
              { text: 'grep -c 200 access.log', why: '-c は成功した行の数を出します。' },
              { text: 'grep -i 200 access.log', why: '-i は大文字と小文字を区別しないだけです。' },
            ],
            answer: 1,
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'search-grep-3',
            type: 'fill',
            kcs: ['grep'],
            prompt: '$w を含む行を、行番号を付けて表示してください。',
            params: { w: ['admin', 'login'] },
            fs: home({ 'access.log': ACCESS }),
            code: 'grep ___ $w access.log\n',
            answers: ['-n'],
            tests: [{}, { fs: home({ 'access.log': ACCESS2 }), hidden: true }],
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'search-grep-4',
            type: 'write',
            kcs: ['grep'],
            prompt: 'app.log から、ERROR・error・Error のどの書き方でも、error を含む行をすべて表示してください。',
            fs: home({ 'app.log': APP }),
            starter: '',
            solution: 'grep -i error app.log\n',
            tests: [{}, { fs: home({ 'app.log': 'Error: a\nok\nERROR b\nerrors c\n' }), hidden: true }],
            hints: ['大文字と小文字を区別しないオプションがあります。', 'grep -i です。'],
          },
        },
      ],
    },
    {
      id: 'sort',
      title: '並べて数える',
      steps: [
        {
          kind: 'read',
          title: 'cut・sort・uniq',
          body: L(
            '`cut -d 区切り -f 番号` は、行を区切り文字で分けて、指定した列だけを取り出します。`cut -d , -f 1 scores.csv` なら CSV の 1 列目です。',
            '`sort` は行を並べます。ふつうは文字の順なので、10 が 9 より前に来ます。数として並べるには `-n`、逆順は `-r`、区切りと列は `-t , -k 2` のように指定します。',
            '`uniq` は、隣り合った同じ行を 1 つにまとめます。`-c` で何回続いたかを数えます。隣り合っていないと数えられないので、先に sort で並べます。',
            '`cut | sort | uniq -c | sort -nr` は「何が何回出たかを多い順に」の定番の形です。不正アクセスの調査で、どの IP が何回失敗したかを数えるのにも使います。',
          ),
          example: 'cut -d " " -f 1 access.log\ncut -d " " -f 1 access.log | sort | uniq -c\ncut -d " " -f 1 access.log | sort | uniq -c | sort -nr\nsort -t , -k 2 -n scores.csv\n',
          fs: home({ 'access.log': ACCESS, 'scores.csv': SCORES }),
        },
        {
          kind: 'problem',
          problem: {
            id: 'search-sort-1',
            type: 'predict',
            kcs: ['sort'],
            prompt: 'nums.txt には 1 行に 1 つずつ数が書いてあります。次のコマンドは何を表示しますか。',
            params: { a: [3, 9], b: [20, 80] },
            fs: home({ 'nums.txt': '$b\n$a\n100\n' }),
            code: 'sort nums.txt\n',
            explain: '-n を付けない sort は文字の順に並べます。1 文字目を比べるので、100 は $a より前に来ます。数として並べるなら sort -n です。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'search-uniq-1',
            type: 'choice',
            kcs: ['uniq', 'sort'],
            prompt: 'IP の一覧を uniq -c だけで数えたら、同じ IP が何度も別の行に出ました。なぜですか。',
            choices: [
              { text: 'uniq は隣り合った同じ行しかまとめないから', why: '正解です。先に sort で同じ行を隣に集めます。' },
              { text: 'uniq は IP を数えられないから', why: 'uniq は中身を問わず、同じ行をまとめます。' },
              { text: '-c が間違いで、-n を付けるべきだから', why: 'uniq に -n はありません。' },
              { text: '行の最後に空白があるから', why: 'この場合の原因は並び順です。' },
            ],
            answer: 0,
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'search-cut-1',
            type: 'fill',
            kcs: ['cut'],
            prompt: 'scores.csv から、名前(1 列目)と英語の点(3 列目)だけを取り出してください。',
            fs: home({ 'scores.csv': SCORES }),
            code: 'cut -d , -f ___ scores.csv\n',
            answers: ['1,3'],
            tests: [{}, { fs: home({ 'scores.csv': 'name,math,english\nmio,50,99\n' }), hidden: true }],
            explain: '-f には 1,3 のように列の番号をコンマで並べて書けます。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'search-uniq-2',
            type: 'write',
            kcs: ['cut', 'sort', 'uniq'],
            prompt: 'access.log の各 IP(1 列目)が何回出たかを数え、多い順に表示してください。',
            fs: home({ 'access.log': ACCESS }),
            starter: '',
            solution: 'cut -d " " -f 1 access.log | sort | uniq -c | sort -nr\n',
            tests: [{}, { fs: home({ 'access.log': ACCESS2 }), hidden: true }],
            hints: [
              'cut -d " " -f 1 で、空白で区切った 1 列目が取り出せます。',
              'sort で並べてから uniq -c で数え、最後に sort -nr で多い順にします。',
            ],
          },
        },
      ],
    },
  ],
  check: [
    {
      id: 'search-check-1',
      type: 'predict',
      kcs: ['sort', 'uniq'],
      prompt: '次のコマンドは何を表示しますか。',
      params: { a: ['cat', 'red'], b: ['dog', 'blue'] },
      fs: home({ 'pets.txt': '$b\n$a\n$b\n' }),
      code: 'sort pets.txt | uniq -c\n',
    },
    {
      id: 'search-check-2',
      type: 'write',
      kcs: ['grep', 'pipe'],
      prompt: 'access.log のうち、401 で失敗したログインが何回あったかを表示してください(数だけを出します)。',
      fs: home({ 'access.log': ACCESS }),
      starter: '',
      solution: 'grep -c 401 access.log\n',
      tests: [{}, { fs: home({ 'access.log': ACCESS2 }), hidden: true }],
      hints: ['grep -c か、grep と wc -l の組み合わせで数えられます。'],
    },
    {
      id: 'search-check-3',
      type: 'choice',
      kcs: ['sort'],
      prompt: 'scores.csv を数学(2 列目)の点の高い順に並べたいです。どれを打ちますか。',
      choices: [
        { text: 'sort -t , -k 2 -nr scores.csv', why: '正解です。-t , で区切り、-k 2 で 2 列目を、-nr で数の大きい順に並べます。' },
        { text: 'sort -k 2 scores.csv', why: '区切りを指定しないと空白で区切るので、2 列目が見つかりません。' },
        { text: 'sort -r scores.csv', why: '行の頭(名前)の文字で逆順に並ぶだけです。' },
        { text: 'cut -d , -f 2 scores.csv | sort -nr', why: '点だけが並び、誰の点かが分からなくなります。' },
      ],
      answer: 0,
    },
  ],
};

/** 権限の単元で使うファイル。/etc/shadow は本物と同じく root だけが読める */
const PERM_FS = home({
  'diary.txt': { content: '今日は晴れ\n', mode: '644' },
  'secret.txt': { content: 'パスワードのメモ\n', mode: '000' },
  'shared/': { mode: '755' },
  'shared/readme.txt': 'みんなで使うフォルダ\n',
  '/etc/shadow': { content: 'root:$6$Q7Kd:19000:0:99999:7:::\nyou:$6$W2Zp:19000:0:99999:7:::\n', mode: '640', owner: 'root' },
});

export const PERM: Unit = {
  id: 'perm',
  title: '⑥ 権限',
  summary: 'ls -l の rwx と持ち主を読み、chmod で変える。読めない・入れない・変えられないエラーの意味が分かる',
  kcs: ['perm', 'chmod'],
  lessons: [
    {
      id: 'read',
      title: '権限を読む',
      steps: [
        {
          kind: 'read',
          title: 'rwx と 3 つの立場',
          body: L(
            '`ls -l` の行の先頭 10 文字が権限です。1 文字目は種類(`d` ディレクトリ、`-` ファイル)で、残りの 9 文字が 3 文字ずつ 3 つの立場に分かれます。',
            '- 1 組目: 持ち主(user)\n- 2 組目: 持ち主と同じグループ(group)\n- 3 組目: それ以外の人(other)',
            '`r` は読める、`w` は書ける、`x` は実行できる、`-` はできないことを表します。ディレクトリの `x` は「中に入れる」意味です。',
            'あなたが誰かは `whoami` と `id` で分かります。root はすべての権限を持つ管理者です。',
          ),
          example: 'whoami\nid\nls -l\nls -l /etc\n',
          fs: PERM_FS,
        },
        {
          kind: 'read',
          title: '読めないファイル(エラーの例)',
          body: L(
            '権限が足りないと `Permission denied` になります。パスワードの情報が入った /etc/shadow は、root と shadow グループしか読めません。',
            '攻撃者がサーバーに入り込むと、まずこうしたファイルを読めないか、権限の設定に穴がないかを探します。権限を正しく読めることは、守る側の基本の力です。',
          ),
          example: 'cat diary.txt\ncat secret.txt\ncat /etc/shadow\nls -l secret.txt /etc/shadow\n',
          fs: PERM_FS,
        },
        {
          kind: 'problem',
          problem: {
            id: 'perm-read-1',
            type: 'choice',
            kcs: ['perm'],
            prompt: '次の行のファイルについて、持ち主でもグループでもない人ができることはどれですか。',
            code: '-rw-r----- 1 you staff 120 Nov 23 09:00 report.txt\n',
            choices: [
              { text: '読むことだけ', why: '3 組目は --- なので、読むこともできません。' },
              { text: '何もできない', why: '正解です。3 組目(other)が --- です。' },
              { text: '読むことと書くこと', why: 'それは 1 組目(持ち主)の rw- です。' },
              { text: '書くことだけ', why: 'w があるのは持ち主だけです。' },
            ],
            answer: 1,
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'perm-read-2',
            type: 'predict',
            kcs: ['perm'],
            prompt: 'secret.txt は持ち主があなたですが、権限が ---------- です。次のコマンドを打つと、画面に何が出ますか。',
            fs: PERM_FS,
            code: 'cat secret.txt\n',
            explain: '持ち主でも、r の印がなければ読めません。持ち主なので、chmod で自分に r を付け直すことはできます。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'perm-read-3',
            type: 'choice',
            kcs: ['perm'],
            prompt: 'ディレクトリ box の権限が drw------- で、持ち主はあなたです。cd box はどうなりますか。',
            choices: [
              { text: '入れる', why: 'ディレクトリに入るには x が要ります。' },
              { text: 'Permission denied で入れない', why: '正解です。r があるので ls box で名前は見えますが、x がないので中に入れません。' },
              { text: 'No such file or directory になる', why: 'box はあります。権限の問題です。' },
              { text: 'box の中身が消える', why: 'cd は何も消しません。' },
            ],
            answer: 1,
          },
        },
      ],
    },
    {
      id: 'chmod',
      title: 'chmod で変える',
      steps: [
        {
          kind: 'read',
          title: '数字と記号(最後の行はエラーの例)',
          body: L(
            '`chmod` は権限を変えます。書き方は 2 通りあります。',
            '数字: r=4、w=2、x=1 を足した数を、持ち主・グループ・それ以外の順に 3 けた並べます。`644` は rw-r--r--、`600` は rw-------、`755` は rwxr-xr-x です。',
            '記号: `u`(持ち主)`g`(グループ)`o`(それ以外)`a`(全員)に、`+` で足す、`-` で外す、`=` でそれだけにする。例: `chmod o-r file`、`chmod u+x file`。',
            '記号の書き方は、ほかの印を変えずに一部だけを変えられます。権限を変えられるのは、持ち主と root だけです。',
          ),
          example: 'ls -l diary.txt\nchmod 600 diary.txt\nls -l diary.txt\nchmod g+r diary.txt\nls -l diary.txt\nchmod 644 /etc/shadow\n',
          fs: PERM_FS,
        },
        {
          kind: 'problem',
          problem: {
            id: 'perm-chmod-1',
            type: 'choice',
            kcs: ['chmod'],
            prompt: 'rwxr-x--- を数字で書くとどれですか。',
            choices: [
              { text: '750', why: '正解です。rwx=4+2+1=7、r-x=4+1=5、---=0 です。' },
              { text: '754', why: '3 組目は --- なので 0 です。' },
              { text: '570', why: '並びは持ち主・グループ・それ以外の順です。' },
              { text: '640', why: '640 は rw-r----- です。' },
            ],
            answer: 0,
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'perm-chmod-2',
            type: 'fill',
            kcs: ['chmod'],
            prompt: 'secret.txt を、持ち主だけが読み書きでき、ほかの人は何もできないようにしてください。',
            fs: PERM_FS,
            code: 'chmod ___ secret.txt\n',
            answers: ['600'],
            tests: [{}],
            check: ['fs'],
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'perm-chmod-3',
            type: 'write',
            kcs: ['chmod'],
            prompt: '$f の、それ以外の人(other)の読む権限だけを外してください。ほかの印は変えないでください。',
            params: { f: ['notes.txt', 'plan.md'] },
            fs: home({ '$f': { content: 'x\n', mode: '644' } }),
            starter: '',
            solution: 'chmod o-r $f\n',
            tests: [{}, { fs: home({ '$f': { content: 'x\n', mode: '664' } }), hidden: true }],
            check: ['fs'],
            hints: ['数字で書くと、元の権限ごとに答えが変わってしまいます。', '記号で o から r を外す書き方は chmod o-r です。'],
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'perm-chmod-4',
            type: 'predict',
            kcs: ['chmod', 'perm'],
            prompt: '/etc/passwd の持ち主は root です。あなた(you)が次のコマンドを打つと、画面に何が出ますか。',
            fs: PERM_FS,
            code: 'chmod 666 /etc/passwd\n',
            explain: '権限を変えられるのは持ち主と root だけです。だれでも書けるようにされると、利用者の情報を書き換えられてしまいます。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'perm-chmod-5',
            type: 'write',
            kcs: ['chmod', 'mkdir'],
            prompt: 'ディレクトリ private を作り、あなただけが中を見たり入ったり書いたりでき、ほかの人は何もできないようにしてください。',
            starter: '',
            solution: 'mkdir private\nchmod 700 private\n',
            tests: [{}],
            check: ['fs'],
            hints: ['ディレクトリでは、中に入るのに x が要ります。', '持ち主が rwx、ほかが --- なので 700 です。'],
          },
        },
      ],
    },
  ],
  check: [
    {
      id: 'perm-check-1',
      type: 'choice',
      kcs: ['perm'],
      prompt: '次の行で、あなた(you)がこのファイルに書き込めない理由はどれですか。',
      code: '-rw-r--r-- 1 root root 42 Nov 23 09:00 hosts\n',
      choices: [
        { text: '持ち主が root で、それ以外の人の権限が r-- だから', why: '正解です。あなたは 3 組目に当たり、w がありません。' },
        { text: 'ファイルが大きすぎるから', why: '大きさは権限と関係ありません。' },
        { text: 'x がないから', why: '書くのに必要なのは w です。' },
        { text: '1 文字目が - だから', why: '- はふつうのファイルという意味です。' },
      ],
      answer: 0,
    },
    {
      id: 'perm-check-2',
      type: 'write',
      kcs: ['chmod'],
      prompt: 'diary.txt を、持ち主は読み書き、グループとそれ以外の人は読むだけにしてください。',
      fs: home({ 'diary.txt': { content: '日記\n', mode: '600' } }),
      starter: '',
      solution: 'chmod 644 diary.txt\n',
      tests: [{}, { fs: home({ 'diary.txt': { content: '日記\n', mode: '777' } }), hidden: true }],
      check: ['fs'],
      hints: ['rw-r--r-- を数字にします。'],
    },
    {
      id: 'perm-check-3',
      type: 'predict',
      kcs: ['perm'],
      prompt: '次のコマンドを打つと、画面に何が出ますか。',
      fs: PERM_FS,
      code: 'cat /etc/shadow\n',
    },
  ],
};

/** ワイルドカードと find で使う、少し深い木 */
const FIND_FS = home({
  'report1.txt': '', 'report2.txt': '', 'report10.txt': '', 'memo.md': '',
  'photo1.jpg': '', 'photo2.jpg': '', 'photo.png': '',
  'photos/': null,
  'logs/': null, 'logs/app.log': 'a\n', 'logs/old/': null, 'logs/old/app.log': 'b\n', 'logs/old/web.log': 'c\n', 'logs/readme.txt': '',
  'project/': null, 'project/src/': null, 'project/src/main.c': '', 'project/docs/': null, 'project/docs/guide.md': '',
});

export const FIND: Unit = {
  id: 'find',
  title: '⑦ ワイルドカードと find',
  summary: '* や ? でまとめて名前を指し、find で木の奥まで探す',
  kcs: ['glob', 'find'],
  lessons: [
    {
      id: 'glob',
      title: 'ワイルドカード',
      steps: [
        {
          kind: 'read',
          title: '* ? [...]',
          body: L(
            '名前の中に次の印を書くと、合うファイルの名前の並びに置き換わります。',
            '- `*` 何文字でも(0 文字も)\n- `?` ちょうど 1 文字\n- `[12]` 角かっこの中のどれか 1 文字',
            '置き換えるのはコマンドではなくシェルです。`ls *.txt` は、ls が動く前に `ls report1.txt report10.txt report2.txt` に書き換わります。`echo` で何に置き換わるかを確かめられます。',
            '合う名前が 1 つもないときは、印がそのまま残ります。. で始まる名前は、`*` には合いません。',
          ),
          example: 'echo *.txt\necho report?.txt\necho photo[12].jpg\nls *.jpg *.png\necho *.zip\n',
          fs: FIND_FS,
        },
        {
          kind: 'problem',
          problem: {
            id: 'find-glob-1',
            type: 'predict',
            kcs: ['glob'],
            prompt: 'ファイルの木を見て答えてください。次のコマンドは何を表示しますか。',
            params: { p: ['report?.txt', 'photo*', '*.md'] },
            fs: FIND_FS,
            code: 'echo $p\n',
            explain: '名前は文字の順に並びます。? はちょうど 1 文字なので report10.txt には合いません。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'find-glob-2',
            type: 'choice',
            kcs: ['glob'],
            prompt: '`rm *.log` を打ったとき、* を名前の並びに置き換えるのはだれですか。',
            choices: [
              { text: 'rm コマンド', why: 'rm に届くときには、すでに名前の並びになっています。' },
              { text: 'シェル', why: '正解です。そのため、どのコマンドでも同じようにワイルドカードが使えます。' },
              { text: 'ファイルシステム', why: 'ファイルシステムは名前を保管するだけです。' },
              { text: 'だれも置き換えず、*.log という名前のファイルを消す', why: '合う名前があれば置き換わります。合う名前がないときだけ、そのまま残ります。' },
            ],
            answer: 1,
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'find-glob-3',
            type: 'fill',
            kcs: ['glob', 'rm'],
            prompt: 'このディレクトリにある .tmp で終わるファイルを、まとめて消してください。',
            params: { a: ['a', 'cache'], b: ['b', 'work'] },
            fs: home({ '$a.tmp': '', '$b.tmp': '', 'keep.txt': '', 'tmp.txt': '' }),
            code: 'rm ___.tmp\n',
            answers: ['*'],
            tests: [{}],
            check: ['fs'],
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'find-glob-4',
            type: 'write',
            kcs: ['glob', 'cpmv'],
            prompt: 'ホームにある .jpg のファイルを、すべて photos の中へ動かしてください。',
            fs: FIND_FS,
            starter: '',
            solution: 'mv *.jpg photos/\n',
            tests: [{}, { fs: home({ 'a.jpg': '', 'b.jpg': '', 'c.png': '', 'photos/': null }), hidden: true }],
            check: ['fs'],
            hints: ['名前が .jpg で終わるものを、ワイルドカードでまとめて指します。', 'mv *.jpg photos/ です。'],
          },
        },
      ],
    },
    {
      id: 'find',
      title: 'find で木をたどる',
      steps: [
        {
          kind: 'read',
          title: 'find 場所 条件',
          body: L(
            'ワイルドカードが見るのは 1 つのディレクトリの中だけです。下の階層まで全部たどって探すには `find` を使います。',
            '`find 場所 -name "名前"` で名前を、`-type f`(ファイル)や `-type d`(ディレクトリ)で種類を絞ります。条件を並べると「両方に合うもの」になります。',
            '`-name` の後のワイルドカードは `"*.log"` のように引用符で囲みます。囲まないと、find が受け取る前にシェルが置き換えてしまいます。',
          ),
          example: 'find logs\nfind . -name "*.log"\nfind project -type d\nfind . -name "*.md" -type f\n',
          fs: FIND_FS,
        },
        {
          kind: 'problem',
          problem: {
            id: 'find-find-1',
            type: 'predict',
            kcs: ['find'],
            prompt: 'ファイルの木を見て答えてください。次のコマンドは何を表示しますか。',
            params: { p: ['*.log', 'app.*'] },
            fs: FIND_FS,
            code: 'find logs -name "$p"\n',
            explain: 'find は logs の下を奥までたどり、名前が合うものを道のりごと表示します。',
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'find-find-2',
            type: 'choice',
            kcs: ['find', 'glob'],
            prompt: 'find . -name "*.txt" の引用符を外して find . -name *.txt と書くと、ここに report1.txt と report2.txt があるとき何が起きますか。',
            choices: [
              { text: '同じ結果になる', why: '引用符がないと、シェルが先に *.txt を置き換えます。' },
              { text: 'シェルが先に *.txt を名前の並びに置き換え、find は思った通りに動かない', why: '正解です。find -name report1.txt report2.txt となり、エラーになります。' },
              { text: '下の階層の .txt だけが見つかる', why: '引用符の有無で探す階層は変わりません。' },
              { text: 'find が *.txt という名前のファイルを作る', why: 'find はファイルを作りません。' },
            ],
            answer: 1,
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'find-find-3',
            type: 'write',
            kcs: ['find', 'pipe'],
            prompt: 'logs の下(奥の階層も含む)に、名前が .log で終わるファイルがいくつあるかを表示してください。',
            fs: FIND_FS,
            starter: '',
            solution: 'find logs -name "*.log" | wc -l\n',
            tests: [{}, { fs: home({ 'logs/': null, 'logs/a.log': '', 'logs/b/': null, 'logs/b/c.log': '', 'logs/b/d/': null, 'logs/b/d/e.log': '', 'logs/x.txt': '' }), hidden: true }],
            hints: ['find logs -name "*.log" で一覧が出ます。', 'それを | で wc -l へ渡して数えます。'],
          },
        },
        {
          kind: 'problem',
          problem: {
            id: 'find-find-4',
            type: 'fill',
            kcs: ['find'],
            prompt: 'project の下にあるディレクトリだけを一覧してください。',
            fs: FIND_FS,
            code: 'find project -type ___\n',
            answers: ['d'],
            tests: [{}],
          },
        },
      ],
    },
  ],
  check: [
    {
      id: 'find-check-1',
      type: 'predict',
      kcs: ['glob'],
      prompt: '次のコマンドは何を表示しますか。',
      params: { p: ['report*.txt', 'photo?.jpg'] },
      fs: FIND_FS,
      code: 'echo $p\n',
    },
    {
      id: 'find-check-2',
      type: 'write',
      kcs: ['find'],
      prompt: 'ホームの下を奥までたどり、名前が .md で終わるファイルをすべて表示してください。',
      fs: FIND_FS,
      starter: '',
      solution: 'find . -name "*.md"\n',
      tests: [{}, { fs: home({ 'a.md': '', 'x/': null, 'x/y/': null, 'x/y/b.md': '' }), hidden: true }],
      hints: ['いまいる場所は . と書けます。', '-name の後は引用符で囲みます。'],
    },
    {
      id: 'find-check-3',
      type: 'choice',
      kcs: ['glob', 'find'],
      prompt: '下の階層のディレクトリの中まで含めて .log のファイルを探すには、どれを使いますか。',
      choices: [
        { text: 'ls *.log', why: '* はいまいる場所の中の名前にしか合いません。' },
        { text: 'find . -name "*.log"', why: '正解です。find は下の階層までたどります。' },
        { text: 'grep .log', why: 'grep はファイルの中身の行を探します。' },
        { text: 'echo */*.log', why: '1 つ下の階層しか見ません。' },
      ],
      answer: 1,
    },
  ],
};
