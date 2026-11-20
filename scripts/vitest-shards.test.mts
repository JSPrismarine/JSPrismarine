import { describe, expect, it } from 'vitest';

import { assignShards, parseJunitDurations } from './vitest-shards.mts';

const total = (files: readonly string[], durations: ReadonlyMap<string, number>): number =>
    files.reduce((sum, file) => sum + (durations.get(file) ?? 0), 0);

describe('parseJunitDurations', () => {
    it('reads each test file and its time', () => {
        const xml = `<?xml version="1.0"?>
<testsuites name="vitest tests" tests="3" time="1.5">
    <testsuite name="packages/a/src/a.test.ts" timestamp="2026-11-20T22:33:08.365Z" tests="2" time="1.25">
        <testcase classname="packages/a/src/a.test.ts" name="works" time="1.2"></testcase>
    </testsuite>
    <testsuite name="packages/b/src/b.test.ts" tests="1" time="0.25"></testsuite>
</testsuites>`;
        expect(parseJunitDurations(xml)).toEqual(
            new Map([
                ['packages/a/src/a.test.ts', 1.25],
                ['packages/b/src/b.test.ts', 0.25]
            ])
        );
    });
});

describe('assignShards', () => {
    const durations = new Map([
        ['slow.test.ts', 300],
        ['a.test.ts', 120],
        ['b.test.ts', 100],
        ['c.test.ts', 90],
        ['d.test.ts', 20],
        ['e.test.ts', 10]
    ]);
    const files = [...durations.keys()];

    it('runs every file once', () => {
        const shards = assignShards(files, durations, 3);
        expect(shards.flat().sort()).toEqual([...files].sort());
    });

    it('keeps the shards within the longest file of each other', () => {
        const totals = assignShards(files, durations, 3).map((shard) => total(shard, durations));
        expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(300);
        // Counting files alone would have put the 300-second file beside another.
        expect(Math.max(...totals)).toBe(300);
    });

    it('weighs a file with no recorded time as the median', () => {
        // The median of 100 and 120 is 120, so the new file ties with `a` and goes first by input order.
        const shards = assignShards(['new.test.ts', 'a.test.ts', 'b.test.ts'], durations, 2);
        expect(shards).toEqual([['new.test.ts', 'b.test.ts'], ['a.test.ts']]);
    });

    it('spreads files that weigh nothing by count', () => {
        const zero = new Map([
            ['a.test.ts', 0],
            ['b.test.ts', 0]
        ]);
        expect(assignShards(['a.test.ts', 'b.test.ts', 'new.test.ts'], zero, 2)).toEqual([
            ['a.test.ts', 'new.test.ts'],
            ['b.test.ts']
        ]);
    });

    it('leaves no shard empty while there are files enough', () => {
        expect(assignShards(['x.test.ts', 'y.test.ts'], new Map(), 2).every((shard) => shard.length > 0)).toBe(true);
    });
});
