import { useEffect, useRef, useState } from 'react';
import { engine } from '../board/engine';
import { drawElement } from '../board/render';
import { useUI } from '../store';

const EXAMPLES = [
  'okrąg wpisany w czworokąt ABCD',
  'okrąg opisany na trójkącie ABC',
  'dwa okręgi styczne zewnętrznie',
  'trójkąt ABC z wysokością CD',
  'styczne z punktu P do okręgu',
  'wykres y = x^2 - 4x + 3',
];

/** "✨ Rysuj" button for the top bar (also Ctrl+K). */
export function DrawButton() {
  return (
    <button className="btn pill draw-pill" title="Narysuj figurę lub wykres z opisu (Ctrl+K)" onClick={() => engine.openDraw()}>
      <span aria-hidden="true">✨</span><span>Rysuj</span>
    </button>
  );
}

export function DrawDialog() {
  const draw = useUI(s => s.draw);
  const [prompt, setPrompt] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);

  // Draw the preview with the board's own renderer, scaled to fit.
  useEffect(() => {
    const c = canvas.current, p = draw?.preview;
    if (!c || !p) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    const k = Math.min(W / p.width, H / p.height, 1.2);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W - p.width * k) / 2, dpr * (H - p.height * k) / 2);
    ctx.clearRect(0, 0, p.width, p.height);
    for (const el of p.elements) drawElement(ctx, el);
  }, [draw?.preview]);

  if (!draw) return null;
  const loading = draw.status === 'loading';
  const submit = () => { if (prompt.trim().length >= 3 && !loading) void engine.requestDrawing(prompt.trim()); };

  return (
    <div className="pdf-overlay" role="dialog" aria-modal="true" aria-labelledby="draw-title" onKeyDown={e => { if (e.key === 'Escape') engine.closeDraw(); }}>
      <div className="pdf-dialog draw-dialog card">
        <h2 id="draw-title">✨ Narysuj</h2>
        <p className="pdf-summary">
          {draw.target.kind === 'card' ? 'Rysunek trafi do pola „Rozwiązanie” tej karty.' : 'Rysunek trafi na środek widoku.'}
          {' '}AI tylko rysuje: nie rozwiązuje i nie liczy wyników.
        </p>

        <form className="draw-form" onSubmit={e => { e.preventDefault(); submit(); }}>
          <textarea
            id="draw-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={300} rows={2} autoFocus
            placeholder="np. okrąg wpisany w czworokąt ABCD" aria-label="Co narysować"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <div className="draw-examples">
            {EXAMPLES.map(x => <button key={x} type="button" className="draw-chip" onClick={() => setPrompt(x)}>{x}</button>)}
          </div>
        </form>

        {loading && <p className="pdf-status">Rysuję… ✏️</p>}
        {draw.status === 'error' && <p className="draw-error" role="alert">{draw.message}</p>}
        {draw.preview && !loading && (
          <div className="draw-preview">
            {draw.title && <p className="draw-title">{draw.title}</p>}
            <canvas ref={canvas} aria-label="Podgląd rysunku" />
            {draw.warnings.map(w => <p key={w} className="draw-warning">⚠️ {w}</p>)}
          </div>
        )}

        <div className="pdf-actions">
          <button className="btn tiny" onClick={engine.closeDraw}>Anuluj</button>
          {draw.preview && !loading ? (
            <>
              <button className="btn tiny" onClick={submit}>Spróbuj inaczej</button>
              <button className="btn pdf-go" onClick={engine.insertDrawing}>Wstaw</button>
            </>
          ) : (
            <button className="btn pdf-go" onClick={submit} disabled={loading || prompt.trim().length < 3}>Narysuj</button>
          )}
        </div>
      </div>
    </div>
  );
}
