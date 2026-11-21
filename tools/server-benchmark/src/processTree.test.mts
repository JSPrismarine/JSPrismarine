import { describe, expect, it } from 'vitest';

import { parsePsTime, sumTree } from './processTree.mts';

describe('sumTree', () => {
    it('sums the root and its descendants and nothing else', () => {
        const processes = [
            { pid: 1, ppid: 0, cpuMs: 1_000, rssBytes: 10 },
            { pid: 10, ppid: 1, cpuMs: 500, rssBytes: 100 },
            { pid: 11, ppid: 10, cpuMs: 250, rssBytes: 1_000 },
            { pid: 12, ppid: 10, cpuMs: 125, rssBytes: 10_000 },
            { pid: 20, ppid: 1, cpuMs: 9_999, rssBytes: 99_999 }
        ];
        expect(sumTree(10, processes)).toEqual({ cpuMs: 875, rssBytes: 11_100, processes: 3 });
    });

    it('reads a tree that is gone as empty', () => {
        expect(sumTree(42, [])).toEqual({ cpuMs: 0, rssBytes: 0, processes: 0 });
    });
});

describe('parsePsTime', () => {
    it('reads the formats macOS and procps print', () => {
        expect(parsePsTime('0:01.50')).toBe(1_500);
        expect(parsePsTime('12:03.25')).toBe(723_250);
        expect(parsePsTime('01:00:00')).toBe(3_600_000);
        expect(parsePsTime('1-00:00:01')).toBe(86_401_000);
    });
});
