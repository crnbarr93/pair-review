import { fixture as fixture01 } from './01-null-pointer-bug.fixture.js';
import { fixture as fixture04 } from './04-pure-rename-refactor.fixture.js';
import { fixture as fixture06 } from './06-intent-mismatch-trap.fixture.js';
import { fixture as fixture07 } from './07-nit-temptation.fixture.js';
import { fixture as fixture08 } from './08-anchor-trap.fixture.js';
import type { Fixture } from '../harness/fixture-type.js';

export const FIXTURES: readonly Fixture[] = [fixture01, fixture04, fixture06, fixture07, fixture08] as const;
