import { describe, expect, it, vi } from 'vitest';

import type { LogLevel } from './levels';
import { Logger } from './logger';

/** A logger whose output is captured instead of printed. */
const makeLogger = (level: LogLevel = 'info') => {
    const written: string[] = [];
    const logger = new Logger(level);
    logger.setConsole({ write: (line: string) => written.push(line) });
    return { logger, written };
};

describe('level guard', () => {
    it('reports whether a level is enabled', () => {
        const { logger } = makeLogger('info');

        expect(logger.isEnabled('error')).toBe(true);
        expect(logger.isEnabled('info')).toBe(true);
        expect(logger.isEnabled('verbose')).toBe(false);
        expect(logger.isEnabled('silly')).toBe(false);
    });

    it('reports every level disabled after shutdown', async () => {
        const { logger } = makeLogger('silly');
        await logger.disable();

        expect(logger.isEnabled('error')).toBe(false);
        expect(logger.isEnabled('silly')).toBe(false);
    });

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
        logger['getNamespace'] = getNamespace;

        logger.debug('suppressed');
        logger.verbose('suppressed');
        logger.silly('suppressed');
        expect(getNamespace).not.toHaveBeenCalled();

        logger.info('emitted');
        expect(getNamespace).toHaveBeenCalledTimes(1);
    });
});

describe('message punctuation', () => {
    it.each([
        ['plain text', 'plain text.'],
        ['already ended.', 'already ended.'],
        ['already ended!', 'already ended!'],
        ['already ended?', 'already ended?'],
        ['', '']
    ])('formats %j as %j', (input, expected) => {
        const { logger } = makeLogger();
        const messages: string[] = [];
        logger.onLine((message) => messages.push(message));

        logger.info(input);

        expect(messages).toEqual([expected]);
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
        logger['getNamespace'] = () => {
            frames = new Error().stack?.split('\n') ?? [];
            return '';
        };

        logger.info('from the test');

        // [0] "Error", [1] this stand-in, [2] the log method, [3] its caller.
        expect(frames[2]).toMatch(/\binfo\b/);
        expect(frames[3]).toMatch(/logger\.test/);
    });

    it.each([
        ['source files', 'file:///repo/packages/prismarine/src/Server.ts:42:5', 'Server'],
        ['built files', 'file:///repo/packages/prismarine/dist/Server.js:42:5', 'Server'],
        ['bundled files', 'file:///app/server.bundle.js:42:5', 'server.bundle']
    ])('derives a module name from %s without source maps', (_description, location, expected) => {
        const { logger } = makeLogger();
        const stack = [
            'Error',
            '    at Logger.getNamespace (file:///repo/packages/logger/dist/logger.js:1:1)',
            '    at Logger.info (file:///repo/packages/logger/dist/logger.js:2:2)',
            `    at invoke (${location})`
        ].join('\n');

        expect(logger['getNamespace'](stack)).toBe(expected);
    });

    it('parses native stack frames without parentheses', () => {
        const { logger } = makeLogger();
        const stack = [
            'Error',
            '    at Logger.getNamespace (file:///repo/packages/logger/dist/logger.js:1:1)',
            '    at Logger.info (file:///repo/packages/logger/dist/logger.js:2:2)',
            '    at file:///repo/packages/prismarine/src/Worker.ts:42:5'
        ].join('\n');

        expect(logger['getNamespace'](stack)).toBe('Worker');
    });

    it('rejects long malformed frame locations without regex backtracking', () => {
        const { logger } = makeLogger();
        const malformedPath = 'part:1'.repeat(5_000);
        const stack = [
            'Error',
            '    at Logger.getNamespace (file:///repo/packages/logger/dist/logger.js:1:1)',
            '    at Logger.info (file:///repo/packages/logger/dist/logger.js:2:2)',
            `    at invoke (${malformedPath}:not-a-line)`
        ].join('\n');

        expect(logger['getNamespace'](stack)).toBe('');
    });

    it('resolves namespaces from built dist frames', () => {
        const { logger, written } = makeLogger();
        const stack = [
            'Error',
            '    at getNamespace (file:///repo/packages/logger/dist/logger.js:1:1)',
            '    at Logger.info (file:///repo/packages/logger/dist/logger.js:2:2)',
            '    at Server.start (file:///repo/packages/server/dist/Server.js:123:4)'
        ].join('\n');
        const NativeError = globalThis.Error;

        vi.stubGlobal(
            'Error',
            class extends NativeError {
                public override stack = stack;
            }
        );

        try {
            logger.info('built server');
        } finally {
            vi.unstubAllGlobals();
        }

        expect(written[0]).toContain('Server');
        expect(written[0]).toContain('built server');
    });
});

describe('untrusted text in a message', () => {
    it('strips escape sequences and carriage returns before any transport sees them', () => {
        const { logger, written } = makeLogger();
        const records: string[] = [];
        const lines: string[] = [];
        const capturing = new Logger('info', [{ log: (record) => void records.push(record.message) }]);
        capturing.onLine((line) => lines.push(line));

        const name = 'Steve\u001B[2J\u001B]0;owned\u0007\rAdmin';
        logger.warn(`${name} failed to log in`);
        capturing.warn(`${name} failed to log in`);

        expect(written[0]).not.toContain('\u001B[2J');
        expect(written[0]).not.toContain('owned');
        expect(written[0]).not.toContain('\r');
        expect(records).toEqual(['SteveAdmin failed to log in.']);
        expect(lines).toEqual(['SteveAdmin failed to log in.']);
    });

    it('indents every further console line so it cannot pass for a record', () => {
        const { logger, written } = makeLogger();

        logger.info('signed "x"\n[12:00:00 INFO]: Steve was made an operator');

        const [first, second] = written[0]!.split('\n');
        expect(first).toContain('signed "x"');
        expect(second?.startsWith('    [12:00:00 INFO]: Steve was made an operator')).toBe(true);
    });
});
