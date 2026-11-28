import { describe, expect, it } from 'vitest';

import { bdsSourceProblems, isCheckedSource } from './check-bds-sources.mts';

const captured = (scenario: string): boolean => scenario === 'open-chest';

describe('check-bds-sources', () => {
    it('refuses a BDS version in prose, by either name', () => {
        const problems = bdsSourceProblems(
            'a.ts',
            ['// as a Bedrock Dedicated Server 1.26.52 sent it', ' * BDS 1.26.60.6 writes it'].join('\n'),
            captured
        );

        expect(problems.map(({ line }) => line)).toEqual([1, 2]);
    });

    it('refuses a version that a comment wraps onto its next line', () => {
        const problems = bdsSourceProblems(
            'a.ts',
            [
                '/**',
                ' * as the Bedrock Dedicated',
                ' * Server 1.26.52 sent it, and BDS',
                ' * 1.26.60.6 too',
                ' */'
            ].join('\n'),
            captured
        );

        expect(problems.map(({ line }) => line)).toEqual([2, 3]);
    });

    it('takes a pin named by its protocol, and an unpinned server', () => {
        const text = ["// protocol 2225's pinned Bedrock Dedicated Server sends it", '// an unpinned BDS did'].join(
            '\n'
        );

        expect(bdsSourceProblems('a.ts', text, captured)).toEqual([]);
    });

    it('resolves a @bdsSee tag against the primary protocol captures', () => {
        const problems = bdsSourceProblems('a.ts', '// @bdsSee open-chest\n// @bdsSee open-barrel', captured);

        expect(problems).toHaveLength(1);
        expect(problems[0]?.line).toBe(2);
        expect(problems[0]?.message).toContain('open-barrel');
    });

    it('reads package source and leaves tests, test helpers and generated output', () => {
        expect(isCheckedSource('packages/prismarine/src/player/PlayerSession.ts')).toBe(true);
        expect(isCheckedSource('packages/prismarine/src/player/PlayerSession.test.ts')).toBe(false);
        expect(isCheckedSource('packages/client/src/testing/loopbackServer.test-utils.ts')).toBe(false);
        expect(isCheckedSource('packages/bedrock-data/src/generated/items.ts')).toBe(false);
        expect(isCheckedSource('scripts/check-bds-sources.mts')).toBe(false);
    });
});
