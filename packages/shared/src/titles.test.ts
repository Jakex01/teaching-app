import { describe, expect, it } from 'vitest';
import { findSimilarBoards, titleKeys, titleSimilarity } from './titles';

describe('board names', () => {
  it('ignores diacritics, case and Polish endings', () => {
    expect(titleKeys('Ciągi – ROZSZERZENIE')).toEqual(['ciag', 'rozs']);
    expect(titleSimilarity('Zadania z ciągów', 'Ciągi')).toBe(1);
    expect(titleSimilarity('Matura 2026', 'Matura')).toBe(1);
  });

  it('does not match on a year alone or on unrelated topics', () => {
    expect(titleSimilarity('Funkcja kwadratowa 2025', 'Matura 2025')).toBe(0);
    expect(titleSimilarity('Trygonometria', 'Ciągi')).toBe(0);
  });

  it('suggests the board, or the section inside it, that fits', () => {
    const boards = [
      { id: 'b1', title: 'Matura', sections: ['Matura próbna styczeń 2025'] },
      { id: 'b2', title: 'Zeszyt', sections: ['Ciągi – rozszerzenie'] },
      { id: 'b3', title: 'Geometria', sections: [] },
    ];
    expect(findSimilarBoards('Matura 2026', boards).map(s => s.boardId)).toEqual(['b1']);
    expect(findSimilarBoards('Ciąg geometryczny rozszerzenie', boards)[0]).toMatchObject({ boardId: 'b2', section: 'Ciągi – rozszerzenie' });
    expect(findSimilarBoards('Pochodne', boards)).toEqual([]);
  });
});
