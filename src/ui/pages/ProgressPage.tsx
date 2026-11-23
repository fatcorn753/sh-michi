import { useRef, useState } from 'react';
import { useStore, store } from '../../learn/store';
import { BKT } from '../../learn/engine';
import { KCS } from '../../content';

export function ProgressPage() {
  const s = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const solved = s.log.filter((l) => l.ok).length;
  const days = new Set(s.log.map((l) => new Date(l.t).toDateString())).size;
  const mastered = KCS.filter((k) => (s.kc[k.id]?.p ?? 0) >= BKT.mastered).length;

  const download = () => {
    const blob = new Blob([store.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    // 日付は利用者の地域の日付にする(toISOString は UTC なので、日本の朝は前日になる)
    a.download = `sh-michi-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <h1>記録</h1>
      {store.saveFailed() && <div className="td-notice" data-tone="warning" role="status"><div><p className="td-notice-title">記録を保存できていません</p><p>ブラウザの設定でサイトのデータ保存が止められている可能性があります。</p></div></div>}
      <section className="td-card" aria-labelledby="sum-h">
        <h2 id="sum-h" className="sr-only">まとめ</h2>
        <div className="td-stats">
          <div className="td-stat"><span className="td-stat-label">身に付けた項目</span><span className="td-stat-value">{mastered}<span className="td-stat-unit">/ {KCS.length}</span></span></div>
          <div className="td-stat"><span className="td-stat-label">正解した問題</span><span className="td-stat-value">{solved}<span className="td-stat-unit">回</span></span></div>
          <div className="td-stat"><span className="td-stat-label">学んだ日</span><span className="td-stat-value">{days}<span className="td-stat-unit">日</span></span></div>
        </div>
      </section>

      <section className="stack" aria-labelledby="kc-h">
        <h2 id="kc-h">項目ごとの習得度</h2>
        <p className="small muted">解いた問題の正誤から推定しています。95% を超えると「身に付いた」とみなします。</p>
        <div className="td-table-wrap">
          <table className="td-table">
            <thead><tr><th>項目</th><th data-align="end">解いた数</th><th>習得度</th></tr></thead>
            <tbody>
              {KCS.map((k) => {
                const st = s.kc[k.id];
                const p = Math.round((st?.p ?? 0) * 100);
                return (
                  <tr key={k.id}>
                    <td>{k.label}</td>
                    <td data-align="end">{st?.attempts ?? 0}</td>
                    <td><span className="row"><span className="meter"><i style={{ width: `${p}%` }} /></span><span className="num small">{st ? `${p}%` : '—'}</span></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" aria-labelledby="data-h">
        <h2 id="data-h">記録の持ち出し</h2>
        <p className="small muted">記録はこの端末のブラウザにだけ保存されています。別の端末へ移すときや、念のための控えに使ってください。</p>
        <div className="row">
          <button className="td-btn" type="button" onClick={download}>記録を書き出す</button>
          <button className="td-btn" type="button" onClick={() => file.current?.click()}>記録を読み込む</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setMsg(store.import(await f.text()) ? '記録を読み込みました。' : 'このファイルは読み込めませんでした。書き出した JSON ファイルを選んでください。');
            e.target.value = '';
          }} />
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
      </section>
    </div>
  );
}
