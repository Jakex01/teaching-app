import { useEffect } from 'react';
import { engine } from '../board/engine';
import { useUI } from '../store';

/** After pasting a task: "Wstaw do sekcji: [list]". Disappears by itself after a while. */
export function PlaceInSection() {
  const placed = useUI(s => s.placed);
  const sections = useUI(s => s.sections);

  useEffect(() => {
    if (!placed) return;
    const t = setTimeout(engine.dismissPlaced, 20_000);
    return () => clearTimeout(t);
  }, [placed]);

  if (!placed || !sections.length) return null;
  return (
    <div className="place-bar card" role="dialog" aria-label="Wstaw do sekcji">
      <span>📁 Wstaw do sekcji:</span>
      <select
        defaultValue=""
        onChange={e => { if (e.target.value) engine.moveIntoSection(placed.ids, e.target.value); }}
        aria-label="Wybierz sekcję"
      >
        <option value="" disabled>wybierz…</option>
        {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <button className="btn tiny" onClick={engine.dismissPlaced}>Zostaw tutaj</button>
    </div>
  );
}
