import { describe, expect, it } from 'vitest';

import { compare, countCauses, slackFor } from './check-aot-explain.mts';

const cause = (fields: Record<string, unknown>): string =>
    JSON.stringify({ rank: 1, reason: 'unknown-object', inDependency: false, ...fields });

describe('countCauses', () => {
    it('counts each workspace package cause by reason and skips the rest of the output', () => {
        const report = [
            '  [1.23s]  bundle  2,530 modules',
            JSON.stringify({ accesses: { byName: 1 }, causes: 4 }),
            cause({ file: 'packages/protocol/src/wire/WireLayout.ts' }),
            cause({ file: 'packages/protocol/src/define.ts', reason: 'unknown-callee' }),
            cause({ file: 'node_modules/.pnpm/yargs@18.2.0/node_modules/yargs/index.mjs', inDependency: true }),
            cause({ file: 'node_modules/.pnpm/@opentui+core@0.9.7/node_modules/@opentui/core/index.js' }),
            ''
        ].join('\n');

        expect(countCauses(report)).toEqual({
            'packages/protocol': { 'unknown-object': 1, 'unknown-callee': 1 }
        });
    });

    it('names a reason it does not count', () => {
        expect(() => countCauses(cause({ file: 'packages/raknet/src/a.ts', reason: 'new-reason' }))).toThrow(
            /new-reason/
        );
    });
});

describe('compare', () => {
    const baseline = { 'packages/raknet': { 'unknown-object': 1000 } };

    it('allows run-to-run variation within the slack', () => {
        const found = { 'packages/raknet': { 'unknown-object': 1000 + slackFor(1000) } };

        expect(compare(found, baseline).added).toEqual([]);
    });

    it('fails a count past its entry and slack', () => {
        const found = { 'packages/raknet': { 'unknown-object': 1001 + slackFor(1000) } };

        expect(compare(found, baseline).added).toEqual([
            {
                file: 'packages/raknet',
                rule: 'unknown-object',
                allowed: 1000 + slackFor(1000),
                found: 1001 + slackFor(1000)
            }
        ]);
    });

    it('fails a new package past an empty entry slack', () => {
        const found = { 'packages/new': { 'lost-track': slackFor(0) + 1 } };

        expect(compare(found, baseline).added.map(({ file }) => file)).toEqual(['packages/new']);
    });

    it('lists a count below its entry for --update to lower', () => {
        const found = { 'packages/raknet': { 'unknown-object': 990 } };

        expect(compare(found, baseline).removed).toEqual([
            { file: 'packages/raknet', rule: 'unknown-object', allowed: 1000, found: 990 }
        ]);
    });
});
