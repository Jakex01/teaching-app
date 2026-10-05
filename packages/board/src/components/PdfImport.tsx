import { useRef, useState } from 'react';
import { engine, type PdfTarget } from '../board/engine';
import { LIMITS } from '../protocol';
import { useUI } from '../store';
import { PdfIcon, PlusIcon } from './Icons';

/** "PDF" button: pick a worksheet to put on the notebook. (Dropping a PDF on the board works too.) */
export function PdfButton() {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn pill" title="Wstaw arkusz PDF (możesz go też przeciągnąć na tablicę)" onClick={() => input.current?.click()}>
        <PdfIcon /><span>PDF</span>
      </button>
      <input
        ref={input} type="file" accept="application/pdf,.pdf" hidden
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = ''; // picking the same file again should work too
          if (file) void engine.openPdf(file);
        }}
      />
    </>
  );
}

/** Shown while one image is selected: turns a pasted task (e.g. a screenshot) into "task + room for the solution". */
export function SolutionSpaceButton() {
  const oneImage = useUI(s => s.selection.oneImage);
  if (!oneImage) return null;
  return (
    <button className="btn pill solution-pill" title="Dodaj obok ramkę na rozwiązanie" onClick={engine.addSolutionSpace}>
      <PlusIcon /><span>Miejsce na rozwiązanie</span>
    </button>
  );
}

/** Polish plural: 1 strona, 2–4 strony (but 12–14 stron), 5+ stron. */
function pagesWord(n: number) {
  if (n === 1) return 'strona';
  const last = n % 10, lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'strony' : 'stron';
}

/** "matematyka-2025-maj_matura.pdf" → "Matematyka 2025 maj matura" (a section name). */
function nameFromFile(file: string) {
  const name = file.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 80) || 'Arkusz';
}

export function PdfDialog() {
  const pdf = useUI(s => s.pdf);
  const sections = useUI(s => s.sections);
  const [choice, setChoice] = useState<'tasks' | 'pages' | null>(null);
  // Where to put it: 'new' section (default), an existing section id, or 'none'.
  const [where, setWhere] = useState('new');
  const [sectionName, setSectionName] = useState<string | null>(null);
  if (!pdf) return null;
  const newName = sectionName ?? nameFromFile(pdf.fileName);
  const target: PdfTarget = where === 'new' ? { kind: 'new', title: newName } : where === 'none' ? { kind: 'none' } : { kind: 'section', id: where };

  const a = pdf.analysis;
  const hasTasks = !!a && a.taskCount > 0;
  const mode = hasTasks ? (choice ?? 'tasks') : 'pages';
  const busy = !!pdf.progress;

  return (
    <div className="pdf-overlay" role="dialog" aria-modal="true" aria-labelledby="pdf-title">
      <div className="pdf-dialog card">
        <h2 id="pdf-title">Wstaw arkusz PDF</h2>
        <p className="pdf-file" title={pdf.fileName}>📄 {pdf.fileName}</p>

        {!a ? (
          <p className="pdf-status">{pdf.progress ?? 'Czytam PDF…'}</p>
        ) : (
          <>
            <p className="pdf-summary">
              {a.pageCount} {pagesWord(a.pageCount)}
              {a.usedPages < a.pageCount && ` (wczytam pierwsze ${a.usedPages})`}
              {hasTasks ? ` · znalazłem zadania: ${a.taskCount}` : ' · nie znalazłem numerów zadań'}
            </p>
            <div className="pdf-target">
              <label htmlFor="pdf-where">📁 Do której sekcji</label>
              <select id="pdf-where" value={where} disabled={busy} onChange={e => setWhere(e.target.value)}>
                <option value="new">Nowa sekcja</option>
                {sections.map(s => <option key={s.id} value={s.id}>Sekcja: {s.title}</option>)}
                <option value="none">Bez sekcji (obok tego, co jest)</option>
              </select>
              {where === 'new' && (
                <input value={newName} maxLength={80} disabled={busy} onChange={e => setSectionName(e.target.value)} aria-label="Nazwa nowej sekcji" />
              )}
            </div>
            <div className="pdf-options">
              <label className={`pdf-option${hasTasks ? '' : ' disabled'}`}>
                <input type="radio" name="pdf-mode" checked={mode === 'tasks'} disabled={!hasTasks || busy} onChange={() => setChoice('tasks')} />
                <span>
                  <b>Zadania z miejscem na rozwiązanie</b>
                  <small>
                    {hasTasks
                      ? `Każde zadanie osobno, obok ramka na rozwiązanie.${a.taskCount > LIMITS.pdfPieces ? ` Wstawię pierwsze ${LIMITS.pdfPieces}.` : ''}`
                      : 'Działa dla arkuszy z nagłówkami „Zadanie 1.”. Ten PDF ich nie ma (może to skan).'}
                  </small>
                </span>
              </label>
              <label className="pdf-option">
                <input type="radio" name="pdf-mode" checked={mode === 'pages'} disabled={busy} onChange={() => setChoice('pages')} />
                <span>
                  <b>Całe strony z miejscem na notatki</b>
                  <small>Każda strona osobno, obok wolne miejsce.</small>
                </span>
              </label>
            </div>
          </>
        )}

        <div className="pdf-actions">
          {busy && a && <span className="pdf-status">{pdf.progress}</span>}
          <button className="btn tiny" onClick={engine.cancelPdf} disabled={busy && !!a}>Anuluj</button>
          <button className="btn pdf-go" onClick={() => { void engine.insertPdf(mode, target); setSectionName(null); setWhere('new'); }} disabled={!a || busy}>Wstaw</button>
        </div>
      </div>
    </div>
  );
}
