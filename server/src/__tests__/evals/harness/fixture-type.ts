import type { ChecklistCategory } from '@shared/types';

export interface SeededDefect {
  category: ChecklistCategory;
  rationaleMatches: RegExp;
}

export interface IntentMismatchHint {
  statedIntent: 'refactor' | 'bug-fix' | 'feature' | 'chore' | 'other';
  actualIntent: 'refactor' | 'bug-fix' | 'feature' | 'chore' | 'other';
  confidenceCeiling: number;
}

export interface ExpectedShape {
  verdict: 'request_changes' | 'comment' | 'approve';
  seededDefect?: SeededDefect;
  intentMismatchHint?: IntentMismatchHint;
}

export interface Fixture {
  id: string;
  prTitle: string;
  prBody: string;
  diffUnified: string;
  labeledIntent: 'bug-fix' | 'refactor' | 'feature' | 'chore' | 'other';
  expected: ExpectedShape;
  blind: boolean;
  rubricCitation: string;
}
