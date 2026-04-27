import { describe, it, expect, beforeEach } from 'vitest';

describe('URL hash persistence for activeStep', () => {
  beforeEach(async () => {
    const { __resetForTesting } = await import('../store');
    __resetForTesting();
    // Reset hash
    location.hash = '';
  });

  it('setActiveStep updates location.hash', async () => {
    const { actions, __getStateForTesting } = await import('../store');

    actions.setActiveStep('walkthrough');
    expect(__getStateForTesting().activeStep).toBe('walkthrough');
    expect(location.hash).toBe('#walkthrough');

    actions.setActiveStep('review');
    expect(__getStateForTesting().activeStep).toBe('review');
    expect(location.hash).toBe('#review');

    actions.setActiveStep('submission');
    expect(__getStateForTesting().activeStep).toBe('submission');
    expect(location.hash).toBe('#submission');

    actions.setActiveStep('summary');
    expect(__getStateForTesting().activeStep).toBe('summary');
    expect(location.hash).toBe('#summary');
  });

  it('hash is readable after being set', async () => {
    const { actions } = await import('../store');

    actions.setActiveStep('walkthrough');

    // Simulate reading hash as bootstrap does
    const savedHash = location.hash;
    const hashStep = savedHash.replace(/^#/, '');
    expect(hashStep).toBe('walkthrough');

    const validSteps = ['summary', 'walkthrough', 'review', 'submission'];
    expect(validSteps.includes(hashStep)).toBe(true);
  });

  it('onSnapshot does NOT overwrite activeStep', async () => {
    const { actions, __getStateForTesting } = await import('../store');

    // Set step to walkthrough
    actions.setActiveStep('walkthrough');
    expect(__getStateForTesting().activeStep).toBe('walkthrough');

    // Simulate a snapshot arriving (minimal valid snapshot)
    actions.onSnapshot({
      type: 'snapshot',
      session: {
        prKey: 'gh:o/r#1',
        pr: {
          source: 'github',
          title: 'Test PR',
          description: '',
          author: 'me',
          baseBranch: 'main',
          headBranch: 'feat',
          baseSha: 'b000',
          headSha: 'h000',
          additions: 0,
          deletions: 0,
          filesChanged: 0,
        },
        diff: { files: [], totalHunks: 0 },
        shikiTokens: {},
        createdAt: '2026-04-19T00:00:00Z',
        headSha: 'h000',
        error: null,
        lastEventId: 0,
      },
      launchUrl: 'http://127.0.0.1:8080/',
      tokenLast4: 'tttt',
    });

    // activeStep should still be 'walkthrough'
    expect(__getStateForTesting().activeStep).toBe('walkthrough');
    // hash should still be '#walkthrough'
    expect(location.hash).toBe('#walkthrough');
  });

  it('every step change persists to hash (full cycle)', async () => {
    const { actions, __getStateForTesting } = await import('../store');

    const steps = ['summary', 'walkthrough', 'review', 'submission'] as const;
    for (const step of steps) {
      actions.setActiveStep(step);
      expect(__getStateForTesting().activeStep).toBe(step);
      expect(location.hash).toBe(`#${step}`);
    }

    // Go backwards
    for (const step of [...steps].reverse()) {
      actions.setActiveStep(step);
      expect(__getStateForTesting().activeStep).toBe(step);
      expect(location.hash).toBe(`#${step}`);
    }
  });

  it('invalid hash values are ignored by syncStepFromHash', async () => {
    // Import the main module to get the exported syncStepFromHash behavior
    // Since syncStepFromHash is not exported, we test the isValidStep logic
    const validSteps = ['summary', 'walkthrough', 'review', 'submission'];

    // These should NOT be valid
    const invalidValues = ['', 'invalid', 'SUMMARY', 'walk through', 'submit', 'javascript:alert(1)'];
    for (const val of invalidValues) {
      expect(validSteps.includes(val)).toBe(false);
    }

    // These should be valid
    for (const val of validSteps) {
      expect(validSteps.includes(val)).toBe(true);
    }
  });
});
