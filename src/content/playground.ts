// 「自由に打つ」の端末に最初から置いておくファイル。どの単元の練習にも使えるよう、少しずつ種類をそろえる
import { home } from './util';

export const PLAY_FS = home({
  'memo.txt': '牛乳を買う\nレポートを出す\n部屋を片付ける\n',
  'notes/': null,
  'notes/linux.txt': 'pwd でいる場所を確かめる\nls で中身を見る\ncd で移る\n',
  'notes/todo.md': '# やること\n- 復習\n- 確認テスト\n',
  'photos/': null,
  'photos/cat.jpg': '',
  'photos/dog.jpg': '',
  'logs/': null,
  'logs/access.log': [
    '10.0.0.5 GET /index.html 200',
    '10.0.0.7 GET /login 200',
    '10.0.0.5 POST /login 401',
    '10.0.0.9 GET /index.html 200',
    '10.0.0.5 POST /login 401',
    '10.0.0.5 POST /login 200',
    '10.0.0.7 GET /admin 403',
  ].join('\n') + '\n',
  'scores.csv': 'name,math,english\naoi,80,72\nkai,95,60\nrin,70,88\n',
  '.bashrc': '# シェルの設定ファイル(. で始まる名前は ls -a で見える)\n',
});
