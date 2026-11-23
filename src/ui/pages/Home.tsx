import { ArrowRight } from 'lucide-react';
import { useStore } from '../../learn/store';
import { dueReviews } from '../../learn/catalog';
import { COURSES } from '../../content';

export function Home() {
  const s = useStore();
  const due = dueReviews(s).length;
  const main = COURSES[0];
  const next = main.units.find((u) => s.passed[u.id] === undefined);
  const started = s.log.length > 0;

  return (
    <div className="page page-narrow">
      <h1>{started ? 'おかえりなさい' : 'Linux のコマンドを、ファイルの木を見ながら学ぶ'}</h1>
      {!started && (
        <>
          <p className="lead">打ったコマンドを 1 行ずつ動かし、どのファイルが増えたか・変わったか・消えたかを図で確かめながら進みます。インストールは要りません。記録はこの端末の中だけに保存されます。</p>
          <div className="prose">
            <p>サーバーの管理やセキュリティの仕事では、黒い画面(端末)でコマンドを打つ力が土台になります。このサイトでは、本物の Linux に似せた練習用の環境で、壊す心配をせずに試せます。</p>
            <ul>
              <li>打つ前に、画面に何が出るかを予測して「読む力」を付けます。</li>
              <li>間違えたら、本物と同じ英語のエラーに、日本語の説明を添えます。</li>
              <li>単元の終わりの確認テストに合格すると、次の単元が開きます。</li>
              <li>忘れかけたころに、ファイルの中身を変えた問題で復習します。</li>
            </ul>
          </div>
        </>
      )}
      <div className="stack">
        {due > 0 && (
          <a className="td-row" href="#/review">
            <span className="td-row-main"><span className="td-row-title">復習が {due} 問あります</span><span className="td-row-meta">忘れかけたころに解くと、長く覚えていられます。</span></span>
            <ArrowRight className="icon" strokeWidth={1.75} aria-hidden />
          </a>
        )}
        {next ? (
          <a className="td-row" href={`#/learn/${main.id}/${next.id}`}>
            <span className="td-row-main"><span className="td-row-title">{started ? `続き: ${next.title}` : `始める: ${next.title}`}</span><span className="td-row-meta">{next.summary}</span></span>
            <ArrowRight className="icon" strokeWidth={1.75} aria-hidden />
          </a>
        ) : (
          <a className="td-row" href="#/course">
            <span className="td-row-main"><span className="td-row-title">本編を終えました</span><span className="td-row-meta">続きの単元は準備中です。「自由に打つ」で試してみてください。</span></span>
            <ArrowRight className="icon" strokeWidth={1.75} aria-hidden />
          </a>
        )}
        <a className="td-row" href="#/play">
          <span className="td-row-main"><span className="td-row-title">自由に打ってみる</span><span className="td-row-meta">練習用のファイルが置いてある端末で、好きなコマンドを試せます。</span></span>
          <ArrowRight className="icon" strokeWidth={1.75} aria-hidden />
        </a>
      </div>
    </div>
  );
}
