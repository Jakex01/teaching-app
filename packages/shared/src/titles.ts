// Comparing board and section names, so the app can say "you already have a board for this".
// Polish words change their endings (ciągi, ciągów; matura, maturalna), so words are compared by their
// first letters, without diacritics. Numbers (years) are kept whole.

const IGNORED = new Set(['i', 'w', 'z', 'na', 'do', 'od', 'oraz', 'dla', 'o', 'po', 'ze', 'we', 'a', 'the']);
const STEM = 4;

/** The comparable parts of a name: "Ciągi – rozszerzenie 2025" → ["ciag", "rozs", "2025"]. */
export function titleKeys(title: string): string[] {
  const plain = title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ł/g, 'l');
  const words = plain.split(/[^a-z0-9]+/).filter(w => w && !IGNORED.has(w));
  return [...new Set(words.map(w => (/^\d+$/.test(w) ? w : w.slice(0, STEM))))];
}

/** 0–1: how much of the shorter name the other one covers. A shared number (a year) alone doesn't count. */
export function titleSimilarity(a: string, b: string): number {
  const ka = titleKeys(a), kb = new Set(titleKeys(b));
  if (!ka.length || !kb.size) return 0;
  const shared = ka.filter(k => kb.has(k));
  if (!shared.some(k => !/^\d+$/.test(k))) return 0;
  return shared.length / Math.min(ka.length, kb.size);
}

export interface SimilarBoard { boardId: string; title: string; section?: string; score: number }

/** Existing boards (or sections inside them) whose names look like `title`, best first. */
export function findSimilarBoards(title: string, boards: { id: string; title: string; sections: string[] }[], min = 0.5): SimilarBoard[] {
  const out: SimilarBoard[] = [];
  for (const b of boards) {
    let best: SimilarBoard = { boardId: b.id, title: b.title, score: titleSimilarity(title, b.title) };
    for (const s of b.sections) {
      const score = titleSimilarity(title, s);
      if (score > best.score) best = { boardId: b.id, title: b.title, section: s, score };
    }
    if (best.score >= min) out.push(best);
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 3);
}
