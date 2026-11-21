import { describe, expect, it } from 'vitest';

import { parseShard, shardSuites, weightByTimes } from './shard.mts';
import { suites } from './suites.mts';

const suite = (name: string, size: number) => ({ name, scenarios: Array.from({ length: size }, (_, i) => i) });

describe('parseShard', () => {
    it('reads an index and a total', () => {
        expect(parseShard('2/4')).toEqual({ index: 2, total: 4 });
    });

    it.each(['0/4', '5/4', '1/0', '2', 'a/b'])('refuses %s', (value) => {
        expect(typeof parseShard(value)).toBe('string');
    });
});

describe('shardSuites', () => {
    it('gives every suite to exactly one shard, in its original order', () => {
        const run = [suite('a', 3), suite('b', 5), suite('c', 1), suite('d', 2)];
        const shards = [1, 2, 3].map((index) => shardSuites(run, { index, total: 3 }));

        expect(
            shards
                .flat()
                .map((s) => s.name)
                .sort()
        ).toEqual(['a', 'b', 'c', 'd']);
        for (const shard of shards) {
            const positions = shard.map((s) => run.indexOf(s));
            expect(positions).toEqual([...positions].sort((x, y) => x - y));
        }
    });

    it('leaves a shard empty when there are fewer suites than shards', () => {
        expect(shardSuites([suite('a', 2)], { index: 2, total: 2 })).toEqual([]);
    });

    it('keeps the shards of the real suites within one largest suite of each other', () => {
        const total = 4;
        const counts = Array.from({ length: total }, (_, i) =>
            shardSuites(suites, { index: i + 1, total }).reduce((sum, s) => sum + s.scenarios.length, 0)
        );
        const largest = Math.max(...suites.map((s) => s.scenarios.length));

        expect(counts.reduce((a, b) => a + b, 0)).toBe(suites.flatMap((s) => s.scenarios).length);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(largest);
    });
});

describe('weightByTimes', () => {
    const full = [suite('a', 10), suite('b', 10), suite('c', 2), suite('d', 1)];

    it('weighs a suite by its recorded time', () => {
        const weight = weightByTimes(
            new Map([
                ['a', 300],
                ['b', 100]
            ]),
            full
        );
        expect(weight(suite('a', 10))).toBe(300);
        expect(weight(suite('b', 10))).toBe(100);
    });

    it('scales a suite that plays some of its scenarios by its rate', () => {
        const weight = weightByTimes(new Map([['a', 300]]), full);
        expect(weight(suite('a', 2))).toBe(60);
    });

    it('gives a suite with no recorded time the median rate', () => {
        // Rates 30, 10 and 5 a scenario: the median is 10.
        const weight = weightByTimes(
            new Map([
                ['a', 300],
                ['b', 100],
                ['c', 10]
            ]),
            full
        );
        expect(weight(suite('d', 1))).toBe(10);
    });

    it('falls back to scenario counts with no times', () => {
        const weight = weightByTimes(new Map(), full);
        expect(full.map(weight)).toEqual([10, 10, 2, 1]);
    });

    it('splits by time, so a long small suite does not share a shard with another long one', () => {
        const run = [suite('long-a', 1), suite('long-b', 1), suite('many', 12)];
        const weight = weightByTimes(
            new Map([
                ['long-a', 600],
                ['long-b', 600],
                ['many', 120]
            ]),
            run
        );
        const shards = [1, 2].map((index) => shardSuites(run, { index, total: 2 }, weight).map((s) => s.name));
        expect(shards).toEqual([['long-a', 'many'], ['long-b']]);
    });
});
