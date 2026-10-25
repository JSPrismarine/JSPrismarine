import { describe, expect, expectTypeOf, it } from 'vitest';

import type { LogLevel } from './levels';
import { isAtLeastLevel, isLogLevel, LOG_LEVELS } from './levels';

describe('LOG_LEVELS', () => {
    it('lists the six levels from most to least severe', () => {
        expect(LOG_LEVELS).toEqual(['error', 'warn', 'info', 'verbose', 'debug', 'silly']);
        expectTypeOf<LogLevel>().toEqualTypeOf<'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly'>();
    });
});

describe('isLogLevel', () => {
    it('accepts each declared level', () => {
        for (const level of LOG_LEVELS) expect(isLogLevel(level), level).toBe(true);
    });

    it('rejects other strings and non-strings', () => {
        expect(isLogLevel('bogus')).toBe(false);
        expect(isLogLevel('INFO')).toBe(false);
        expect(isLogLevel('')).toBe(false);
        expect(isLogLevel(2)).toBe(false);
        expect(isLogLevel(undefined)).toBe(false);
        expect(isLogLevel(null)).toBe(false);
        expect(isLogLevel(['info'])).toBe(false);
    });
});

describe('isAtLeastLevel', () => {
    it('lets a level through its own threshold', () => {
        for (const level of LOG_LEVELS) expect(isAtLeastLevel(level, level), level).toBe(true);
    });

    it('lets more severe levels through a threshold', () => {
        expect(isAtLeastLevel('error', 'info')).toBe(true);
        expect(isAtLeastLevel('warn', 'info')).toBe(true);
        expect(isAtLeastLevel('error', 'silly')).toBe(true);
    });

    it('stops less severe levels at a threshold', () => {
        expect(isAtLeastLevel('verbose', 'info')).toBe(false);
        expect(isAtLeastLevel('silly', 'debug')).toBe(false);
        expect(isAtLeastLevel('warn', 'error')).toBe(false);
    });
});
