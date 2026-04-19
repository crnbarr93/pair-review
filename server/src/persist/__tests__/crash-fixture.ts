// Long-lived child process for store.crash.test.ts. Imports the production
// writeState and hammers it in an infinite loop until the parent test SIGKILLs
// it. This fixture is NOT a vitest test (no .test.ts suffix) and is not picked
// up by the default test-include pattern.
//
// IMPORTANT: stdout is piped to the parent and any noise here can distort
// timing when the parent is waiting for the child to stabilize — so this
// fixture writes nothing to stdout and only sends errors to stderr via
// process.stderr.write (no logger calls, no print statements).
import { writeState } from '../store.js';

const prKey = process.env.CRASH_PR_KEY;
if (!prKey) {
  process.stderr.write('CRASH_PR_KEY env var required\n');
  process.exit(1);
}

let n = 1;
(async () => {
  // Intentional infinite loop — parent kills us with SIGKILL. Uses the
  // production two-arg writeState so the crash-path behavior under the
  // production-tight retry budget is what this test actually proves.
  while (true) {
    await writeState(prKey, {
      lastEventId: n++,
      hammer: 'x'.repeat(1024), // ~1KB payload; truncation would be visually obvious
    });
  }
})().catch((e) => {
  process.stderr.write(`fixture error: ${String(e)}\n`);
  process.exit(2);
});
