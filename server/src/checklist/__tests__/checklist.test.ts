import { describe, it, expect } from 'vitest';
import { CHECKLIST, type ChecklistItem } from '../index.js';

describe('CHECKLIST', () => {
  const VALID_CATEGORIES = ['correctness', 'security', 'tests', 'performance', 'style'] as const;
  const VALID_CRITICALITY = [1, 2, 3] as const;

  it('exports a non-empty readonly array', () => {
    expect(Array.isArray(CHECKLIST)).toBe(true);
    expect(CHECKLIST.length).toBeGreaterThan(0);
  });

  it('has between 20 and 30 items total (D-02 target ~25)', () => {
    expect(CHECKLIST.length).toBeGreaterThanOrEqual(20);
    expect(CHECKLIST.length).toBeLessThanOrEqual(30);
  });

  it('every item has required fields with valid types', () => {
    for (const item of CHECKLIST) {
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
      expect(VALID_CATEGORIES).toContain(item.category);
      expect(VALID_CRITICALITY).toContain(item.criticality);
      expect(typeof item.text).toBe('string');
      expect(item.text.length).toBeGreaterThan(0);
      if (item.evaluationHint !== undefined) {
        expect(typeof item.evaluationHint).toBe('string');
      }
    }
  });

  it('ids are unique across the whole checklist', () => {
    const ids = CHECKLIST.map((i) => i.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every category has between 3 and 7 items', () => {
    for (const cat of VALID_CATEGORIES) {
      const count = CHECKLIST.filter((i) => i.category === cat).length;
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(7);
    }
  });

  it('all 5 categories are represented', () => {
    const seen = new Set(CHECKLIST.map((i) => i.category));
    for (const cat of VALID_CATEGORIES) {
      expect(seen.has(cat)).toBe(true);
    }
  });

  it('type-level ChecklistItem export is available', () => {
    // Structural assertion -- compile-time only. Runtime assertion: can assign any item to the type.
    const first: ChecklistItem = CHECKLIST[0];
    expect(first.id).toBeDefined();
  });
});
