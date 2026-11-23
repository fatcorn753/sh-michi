import { Inline } from './Problems';

/** 教材の本文用のごく小さな整形。空行で段落、「- 」で箇条書き、`code` で等幅 */
export function Md({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => l.trim().startsWith('- '))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}><Inline text={l.trim().slice(2)} /></li>)}</ul>;
        }
        return <p key={i}><Inline text={lines.join('')} /></p>;
      })}
    </div>
  );
}
