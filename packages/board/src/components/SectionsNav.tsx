import { useState, type CSSProperties } from 'react';
import { engine } from '../board/engine';
import { useUI } from '../store';

/** Sections of the board: jump to one, rename it, or add a new one (teacher). */
export function SectionsNav() {
  const sections = useUI(s => s.sections);
  const isTeacher = useUI(s => s.me?.role === 'teacher');
  const inNotebook = useUI(s => !!s.notebook);
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  if (!inNotebook || (!sections.length && !isTeacher)) return null;

  const submitNew = (title: string) => {
    if (title.trim()) engine.addSection(title);
    setAdding(false);
  };

  return (
    <nav className="sections card" aria-label="Sekcje tablicy">
      <button className="sections-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        📁 Sekcje{sections.length ? ` (${sections.length})` : ''} <span className="sections-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {sections.length > 0 && (
            <ul className="sections-list">
              {sections.map(s => (
                <li key={s.id} style={{ '--sc': s.color } as CSSProperties}>
                  {editing === s.id ? (
                    <form onSubmit={e => { e.preventDefault(); engine.renameSection(s.id, String(new FormData(e.currentTarget).get('title') ?? '')); setEditing(null); }}>
                      <input name="title" defaultValue={s.title} maxLength={80} autoFocus onBlur={e => { engine.renameSection(s.id, e.currentTarget.value); setEditing(null); }} aria-label="Nazwa sekcji" />
                    </form>
                  ) : (
                    <>
                      <button className="sections-item" onClick={() => engine.goToSection(s.id)} title={s.title}>{s.title}</button>
                      {isTeacher && <button className="sections-edit" onClick={() => setEditing(s.id)} title="Zmień nazwę" aria-label={`Zmień nazwę: ${s.title}`}>✎</button>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isTeacher && (adding ? (
            <form className="sections-new" onSubmit={e => { e.preventDefault(); submitNew(String(new FormData(e.currentTarget).get('title') ?? '')); }}>
              <input name="title" maxLength={80} autoFocus placeholder="np. Matura 2026" aria-label="Nazwa nowej sekcji" onBlur={e => submitNew(e.currentTarget.value)} />
            </form>
          ) : (
            <button className="sections-add" onClick={() => setAdding(true)}>+ Sekcja</button>
          ))}
        </>
      )}
    </nav>
  );
}
