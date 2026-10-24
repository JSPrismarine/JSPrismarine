import { describe, expect, it } from 'vitest';

import { compareVersions, parseVersion, selectSchemaVersion } from './formatVersion';

describe('parseVersion', () => {
    it('parses dotted strings, padding missing parts with zero', () => {
        expect(parseVersion('1.26.50')).toEqual([1, 26, 50]);
        expect(parseVersion('1.10')).toEqual([1, 10, 0]);
    });

    it('parses arrays and bare numbers', () => {
        expect(parseVersion([1, 26, 50])).toEqual([1, 26, 50]);
        expect(parseVersion(2)).toEqual([2, 0, 0]);
    });

    it('rejects non-version shapes', () => {
        expect(parseVersion('1.a')).toBeUndefined();
        expect(parseVersion('1.2.3.4')).toBeUndefined();
        expect(parseVersion([1, '2'])).toBeUndefined();
        expect(parseVersion({})).toBeUndefined();
        expect(parseVersion(undefined)).toBeUndefined();
    });
});

describe('compareVersions', () => {
    it('orders part by part', () => {
        expect(compareVersions([1, 10, 0], [1, 26, 50])).toBeLessThan(0);
        expect(compareVersions([1, 26, 50], [1, 26, 50])).toBe(0);
        expect(compareVersions([2, 0, 0], [1, 26, 50])).toBeGreaterThan(0);
    });
});

describe('selectSchemaVersion', () => {
    const known = ['1.10', '1.16.100', '1.26.50'] as const;

    it('chooses the newest schema at or below the file version', () => {
        expect(selectSchemaVersion(known, [1, 20, 0])).toBe('1.16.100');
        expect(selectSchemaVersion(known, [1, 26, 50])).toBe('1.26.50');
        expect(selectSchemaVersion(known, [1, 30, 0])).toBe('1.26.50');
    });

    it('falls back to the oldest schema for files older than all of them', () => {
        expect(selectSchemaVersion(known, [1, 8, 0])).toBe('1.10');
    });
});
