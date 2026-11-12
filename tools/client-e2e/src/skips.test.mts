import { describe, expect, it } from 'vitest';

import { readManifest } from './cinnabar.mts';
import type { PinnedVersion } from './cinnabar.mts';
import { pinSkips } from './pin-skips.mts';
import { applySkips, assertSkipsValid, MIN_REASON_WORDS, skipProblems } from './skips.mts';
import type { ScenarioSkip } from './skips.mts';
import { suites } from './suites.mts';

const oldBuild = '485c24673e9df7ba31a6788e24797cbc4a18c2a5';
const newBuild = 'ae1c2073fc3bda1be7ce4a014acc080c6e31ecd5';
const fix = 'dd7d7dd53a52c40491e0eb49b5bc700a4974191e';
const versions: PinnedVersion[] = [
    { protocol: 2193, commit: oldBuild, transports: ['raknet'] },
    { protocol: 2225, commit: newBuild, transports: ['raknet', 'nethernet'] }
];
const scenarios = ['liquid-containers', 'glass-bottle-filling', 'chat'];

const skip = (overrides: Partial<ScenarioSkip> = {}): ScenarioSkip => ({
    scenario: 'glass-bottle-filling',
    commit: oldBuild,
    reason: {
        client: 'The client aims a glass bottle with the plain block pick, so a click on water sends a USE with no block.',
        server: 'A bottle used on nothing does nothing, and the newer build that has the fix passes the same scenario.'
    },
    references: ['https://github.com/JSPrismarine/JSPrismarine/issues/3025'],
    fixedIn: fix,
    ...overrides
});

const problems = (entry: ScenarioSkip, contains?: (commit: string, ancestor: string) => boolean | undefined) =>
    skipProblems([entry], { scenarios, versions, ...(contains === undefined ? {} : { contains }) });

describe('skipProblems', () => {
    it('accepts a skip that explains itself and names a pinned build', () => {
        expect(problems(skip())).toEqual([]);
    });

    it('holds the declared skips to the same rules', () => {
        const context = {
            scenarios: suites.flatMap((suite) => suite.scenarios.map((scenario) => scenario.name)),
            versions: readManifest().versions
        };

        expect(() => assertSkipsValid(pinSkips, context)).not.toThrow();
    });

    it('stops applying a skip once its pin moves, and says to re-check it', () => {
        // Written for the 2225 build before the pin moved to one with the bottle fix.
        const stale = skip({ commit: '069a83fb674ce6e84c67f0e48d67b92411b135aa' });

        expect(problems(stale)).toEqual([
            'skip 1 (glass-bottle-filling on cinnabar 069a83fb674c): cinnabar.json no longer pins this commit ' +
                '(it pins 2193 at 485c24673e9d, 2225 at ae1c2073fc3b), so the skip no longer applies. Run the ' +
                'scenario on the new build with --run-skipped: delete the skip if it passes, or set commit to ' +
                'the new build once you have checked the reason still holds for it'
        ]);
        const suite = [{ name: 'gameplay', scenarios: [{ name: 'glass-bottle-filling' }] }];
        expect(applySkips(suite, [stale], newBuild, false)).toEqual({ suites: suite, skipped: [] });
    });

    it('rejects a scenario no suite runs', () => {
        expect(problems(skip({ scenario: 'bottle' }))).toEqual([
            "skip 1 (bottle on cinnabar 485c24673e9d): no suite in src/suites.mts runs a scenario named 'bottle'"
        ]);
    });

    it('rejects a commit that is not a full one', () => {
        expect(problems(skip({ commit: '485c24673e' }))).toEqual([
            'skip 1 (glass-bottle-filling on cinnabar 485c24673e): commit must be the full 40-character cinnabar ' +
                'commit of the build that fails'
        ]);
    });

    it('rejects a thin reason and says what each half must say', () => {
        expect(problems(skip({ reason: { client: 'bottle broken', server: 'not us' } }))).toEqual([
            'skip 1 (glass-bottle-filling on cinnabar 485c24673e9d): reason.client has 2 words; give what the ' +
                'pinned client does wrong, such as the input it mishandles or the packet it sends or leaves out, ' +
                `in at least ${MIN_REASON_WORDS} words`,
            'skip 1 (glass-bottle-filling on cinnabar 485c24673e9d): reason.server has 2 words; give why the ' +
                'server is not at fault, with the evidence: a packet log, a unit test, another client that ' +
                `passes, in at least ${MIN_REASON_WORDS} words`
        ]);
    });

    it('rejects a placeholder however long the reason is', () => {
        const padded = 'TODO explain this later once somebody has looked at the packet log from the client run';

        expect(problems(skip({ reason: { ...skip().reason, server: padded } }))).toEqual([
            'skip 1 (glass-bottle-filling on cinnabar 485c24673e9d): reason.server still holds a placeholder; ' +
                'replace it with why the server is not at fault, with the evidence: a packet log, a unit test, ' +
                'another client that passes'
        ]);
    });

    it('rejects a skip without references, or with one that is not a link', () => {
        expect(problems(skip({ references: [] }))).toEqual([
            'skip 1 (glass-bottle-filling on cinnabar 485c24673e9d): add at least one reference: the JSPrismarine ' +
                'issue that tracks the skip, the client commit or pull request that fixes it, or an upstream report'
        ]);
        expect(problems(skip({ references: ['#3025'] }))).toEqual([
            "skip 1 (glass-bottle-filling on cinnabar 485c24673e9d): reference '#3025' must be an https:// link"
        ]);
    });

    it('rejects the same scenario skipped twice on one build', () => {
        expect(skipProblems([skip(), skip()], { scenarios, versions })).toEqual([
            'skip 2 (glass-bottle-filling on cinnabar 485c24673e9d): skips the same scenario on the same build ' +
                'as an earlier entry; keep one'
        ]);
    });

    it('rejects a skip whose build is its fix or already contains it', () => {
        const stale =
            'skip 1 (glass-bottle-filling on cinnabar 485c24673e9d): the build already contains the fix ' +
            `${fix.slice(0, 12)} (fixedIn), so the skip is stale: confirm with --run-skipped that the scenario ` +
            'passes, then delete the skip';

        expect(problems(skip(), () => true)).toEqual([stale]);
        expect(problems(skip({ fixedIn: oldBuild }))[0]).toContain('the build already contains the fix 485c24673e9d');
        // A history that cannot tell, or that does not contain the fix, keeps the skip.
        expect(problems(skip(), () => undefined)).toEqual([]);
        expect(problems(skip(), () => false)).toEqual([]);
    });

    it('accepts a stale skip for the --run-skipped run that confirms its fix, and nothing malformed', () => {
        const context = { scenarios, versions, contains: () => true, allowStale: true };

        expect(skipProblems([skip()], context)).toEqual([]);
        expect(skipProblems([skip({ fixedIn: oldBuild })], context)).toEqual([]);
        expect(skipProblems([skip({ fixedIn: 'not-a-commit' })], context)[0]).toContain('fixedIn must be the full');
    });
});

describe('applySkips', () => {
    const gameplay = {
        name: 'gameplay',
        scenarios: [{ name: 'liquid-containers' }, { name: 'glass-bottle-filling' }, { name: 'chat' }]
    };
    const bottleOnly = { name: 'bottles', scenarios: [{ name: 'glass-bottle-filling' }] };

    it('leaves a skipped scenario out on the build it names, and keeps the rest of its suite', () => {
        expect(applySkips([gameplay], [skip()], oldBuild, false)).toEqual({
            suites: [{ name: 'gameplay', scenarios: [{ name: 'liquid-containers' }, { name: 'chat' }] }],
            skipped: [skip()]
        });
    });

    it('runs the scenario on every other build', () => {
        expect(applySkips([gameplay], [skip()], newBuild, false)).toEqual({ suites: [gameplay], skipped: [] });
    });

    it('drops a suite with nothing left to run', () => {
        expect(applySkips([bottleOnly, gameplay], [skip()], oldBuild, false).suites.map((suite) => suite.name)).toEqual(
            ['gameplay']
        );
    });

    it('reports nothing for a skipped scenario the run did not select', () => {
        const chatOnly = { name: 'gameplay', scenarios: [{ name: 'chat' }] };

        expect(applySkips([chatOnly], [skip()], oldBuild, false)).toEqual({ suites: [chatOnly], skipped: [] });
    });

    it('runs a skipped scenario anyway when asked, and still names its skip', () => {
        expect(applySkips([gameplay], [skip()], oldBuild, true)).toEqual({ suites: [gameplay], skipped: [skip()] });
    });
});
