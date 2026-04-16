import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '../logger.js';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to stderr (not stdout) on logger.info', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logger.info('hi');

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect((stderrSpy.mock.calls[0][0] as string)).toContain('hi');
  });

  it('writes error with stack trace to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const err = new Error('boom');
    logger.error('oops', err);

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('oops');
    // Stack traces contain "Error:" prefix
    expect(output).toContain('Error: boom');
  });

  it('does not write to stdout on logger.warn', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logger.warn('warning message');

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
