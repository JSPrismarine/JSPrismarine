import { describe, expect, it, vi } from 'vitest';

import { Logger } from './logger';

/** A logger whose output is captured instead of printed. */
const makeLogger = (level: Parameters<typeof Logger.prototype.constructor>[0] = 'info') => {
    const written: string[] = [];
    const logger = new Logger(level as any);
    logger.setConsole({ write: (line: string) => written.push(line) });
    return { logger, written };
};

describe('level guard', () => {
    it('does not reach the transport for a suppressed level', () => {
        const { logger, written } = makeLogger('info');
        logger.debug('should not appear');
        logger.verbose('should not appear either');
        logger.silly('nor this');
        expect(written).toEqual([]);
    });

    it('still reaches the transport for an enabled level', () => {
        const { logger, written } = makeLogger('info');
        logger.info('hello');
        logger.warn('careful');
        expect(written.length).toBe(2);
        expect(written[0]).toContain('hello');
        expect(written[1]).toContain('careful');
    });

    it('emits everything once the level is lowered', () => {
        const { logger, written } = makeLogger('silly');
        logger.debug('debugging');
        logger.silly('sillying');
        expect(written.length).toBe(2);
    });

    it('never resolves the namespace for a suppressed message', () => {
        const { logger } = makeLogger('info');
        // getNamespace is what captures the stack, and it is the whole cost being avoided.
        const getNamespace = vi.fn(() => '');
        (logger as any).getNamespace = getNamespace;

        logger.debug('suppressed');
        logger.verbose('suppressed');
        logger.silly('suppressed');
        expect(getNamespace).not.toHaveBeenCalled();

        logger.info('emitted');
        expect(getNamespace).toHaveBeenCalledTimes(1);
    });
});

describe('namespace resolution', () => {
    // getNamespace() picks frame 3 of the stack to name the caller. The level guard has to
    // stay inline in every log method for that to hold: wrapping the log call in a shared
    // helper would insert a frame and every log line would report the wrong file. Asserting
    // on the rendered namespace cannot catch this (the path parsing yields '' under the
    // test runner's transformed paths), so the frame layout itself is what gets pinned.
    it('reaches getNamespace at the stack depth getNamespace assumes', () => {
        const { logger } = makeLogger('info');
        let frames: string[] = [];
        (logger as any).getNamespace = () => {
            frames = (new Error().stack as string).split('\n');
            return '';
        };

        logger.info('from the test');

        // [0] "Error", [1] this stand-in, [2] the log method, [3] its caller.
        expect(frames[2]).toMatch(/\binfo\b/);
        expect(frames[3]).toMatch(/logger\.test/);
    });
});
