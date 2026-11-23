import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Home as HomeIcon, RotateCcw, SquareTerminal } from 'lucide-react';
import { useStore } from '../learn/store';
import { dueReviews } from '../learn/catalog';
import { Home } from './pages/Home';
import { CourseMap } from './pages/CourseMap';
import { LessonPage } from './pages/LessonPage';
import { CheckPage } from './pages/CheckPage';
import { Review } from './pages/Review';
import { Playground } from './pages/Playground';
import { ProgressPage } from './pages/ProgressPage';

function useHash(): string[] {
  const get = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [h, setH] = useState(get);
  useEffect(() => {
    const f = () => { setH(get()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

const ic = { className: 'icon', strokeWidth: 1.75, 'aria-hidden': true } as const;

export function App() {
  const route = useHash();
  const s = useStore();
  const due = dueReviews(s).length;
  const top = route[0] ?? '';
  const nav = [
    { href: '#/', key: '', label: 'はじめに', icon: <HomeIcon {...ic} /> },
    { href: '#/course', key: 'course', label: 'コース', icon: <BookOpen {...ic} /> },
    { href: '#/review', key: 'review', label: '復習', icon: <RotateCcw {...ic} />, count: due },
    { href: '#/play', key: 'play', label: '自由に打つ', icon: <SquareTerminal {...ic} /> },
    { href: '#/progress', key: 'progress', label: '記録', icon: <BarChart3 {...ic} /> },
  ];
  const current = ['learn', 'check'].includes(top) ? 'course' : top;

  let page: React.ReactNode;
  switch (top) {
    case '': page = <Home />; break;
    case 'course': page = <CourseMap />; break;
    case 'learn': page = <LessonPage courseId={route[1]} unitId={route[2]} lessonId={route[3]} />; break;
    case 'check': page = <CheckPage courseId={route[1]} unitId={route[2]} />; break;
    case 'review': page = <Review />; break;
    case 'play': page = <Playground />; break;
    case 'progress': page = <ProgressPage />; break;
    default: page = <div className="td-empty"><p className="td-empty-title">ページが見つかりません</p><a className="td-btn" href="#/">はじめにへ戻る</a></div>;
  }

  return (
    <div className="app">
      <nav className="side" aria-label="メインメニュー">
        <div className="brand">シェルのみち<small>ファイルの木を見ながら学ぶ Linux</small></div>
        {nav.map((n) => (
          <a key={n.key} className="nav-link" href={n.href} aria-current={current === n.key ? 'page' : undefined}>
            {n.icon}{n.label}{n.count ? <span className="count" aria-label={`${n.count} 問`}>{n.count}</span> : null}
          </a>
        ))}
      </nav>
      <main className="main" id="main">{page}</main>
      <nav className="tabbar" aria-label="メインメニュー">
        {nav.map((n) => (
          <a key={n.key} href={n.href} aria-current={current === n.key ? 'page' : undefined}>
            {n.icon}<span>{n.label}{n.count ? `(${n.count})` : ''}</span>
          </a>
        ))}
      </nav>
      <div className="td-toast-region" aria-live="polite" />
    </div>
  );
}
