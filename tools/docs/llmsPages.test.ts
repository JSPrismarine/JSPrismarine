import { describe, expect, it } from 'vitest';

import { type ChangelogRelease, SHOWN_RELEASES } from './changelog.mts';
import type { TrackerCase } from '../../packages/parity/src/dashboard/tracker.ts';
import type { TrackerSummary, TrackerSummaryFamily } from '../../packages/parity/src/dashboard/trackerSummary.ts';
import { METRICS } from '../server-benchmark/src/summary.mts';
import {
    addonMarkdown,
    benchmarksMarkdown,
    marketMarkdown,
    packagesMarkdown,
    parityMarkdown,
    releasesMarkdown
} from './llmsPages.mts';
import { loadProject } from './project.mts';
import { pageTitle } from './sections.mts';
import { readBenchmarkPage } from './site/benchmarks.data.mts';
import { installCommand, type MarketAddon, type MarketAddonPage } from './site/.vitepress/theme/addonMarket.ts';
import { packageAreas } from './site/.vitepress/theme/packageAreas.ts';

describe('packagesMarkdown', () => {
    const project = loadProject();
    const markdown = packagesMarkdown(project);

    it('lists every published package once, at its API reference and npm page', () => {
        expect(pageTitle(markdown, '')).toBe('Packages');
        for (const { name, version, reference } of project.packages) {
            const lines = markdown.split('\n').filter((line) => line.startsWith(`- [\`${name}\`]`));
            expect(lines).toHaveLength(1);
            expect(lines[0]).toContain(`(${reference}) ${version}: `);
            expect(lines[0]).toContain(`(https://www.npmjs.com/package/${name})`);
        }
    });

    it('groups the packages under their areas, in the package directory order', () => {
        const headings = markdown.split('\n').filter((line) => line.startsWith('## '));
        expect(headings).toEqual(packageAreas.map(({ title }) => `## ${title}`));
    });
});

describe('releasesMarkdown', () => {
    const release = (version: string, changes: ChangelogRelease['changes'] = []): ChangelogRelease => ({
        version,
        changes,
        dependencyUpdates: 0
    });
    const releases = [
        {
            ...release('0.9.0', [
                { kind: 'patch', description: 'Fix the console.' },
                {
                    kind: 'minor',
                    description: 'Add worlds.\n\nEach world has its own seed.',
                    pullRequest: { number: 12, url: 'https://example.test/pull/12' }
                }
            ]),
            dependencyUpdates: 2
        },
        ...Array.from({ length: SHOWN_RELEASES + 2 }, (_, index) => release(`0.${8 - index}.0`))
    ];
    const markdown = releasesMarkdown(releases, {
        dateOf: (version) => (version === '0.9.0' ? '2026-11-20' : undefined),
        changelogUrl: 'https://example.test/CHANGELOG.md'
    });

    it('shows the newest releases and links the changelog for the rest', () => {
        const versions = markdown.split('\n').filter((line) => line.startsWith('## '));
        expect(versions).toEqual(releases.slice(0, SHOWN_RELEASES).map(({ version }) => `## ${version}`));
        expect(markdown).toContain(`The newest ${SHOWN_RELEASES} of ${releases.length} releases`);
        expect(markdown).toContain('[full changelog](https://example.test/CHANGELOG.md)');
    });

    it("lists a release's changes by level, keeping a long change inside its item", () => {
        const newest = markdown.slice(markdown.indexOf('## 0.9.0'), markdown.indexOf('## 0.8.0'));
        expect(newest).toBe(
            [
                '## 0.9.0',
                'Released 2026-11-20.',
                '### Minor changes\n\n- Add worlds.\n\n  Each world has its own seed. ([#12](https://example.test/pull/12))',
                '### Patch changes\n\n- Fix the console.',
                '2 dependency updates.',
                ''
            ].join('\n\n')
        );
    });
});

describe('addonMarkdown', () => {
    const addon: MarketAddonPage = {
        id: 'acme/addons/warps',
        name: 'warps',
        repository: 'acme/addons',
        firstParty: false,
        path: '/addons/acme/addons/warps',
        title: 'Warps',
        description: 'Named places players teleport to.',
        version: '1.2.0',
        minServer: '0.23.0',
        needsNewerServer: false,
        license: 'MIT',
        tags: ['gameplay'],
        authors: ['Ada'],
        sha256: 'ab'.repeat(32),
        versions: [{ version: '1.2.0', published: '2026-11-20' }],
        sourceUrl: 'https://github.com/acme/addons',
        issuesUrl: 'https://github.com/acme/addons/issues',
        screenshots: [],
        readmeHtml: '<p>Use it.</p>'
    };

    it('gives the install command, the facts and the README, saying whose README it is', () => {
        const markdown = addonMarkdown(addon, 'Use it.\n');
        expect(pageTitle(markdown, '')).toBe('Warps');
        expect(markdown).toContain(`\`${installCommand(addon.id)}\``);
        expect(markdown).toContain('- Runs on: JSPrismarine 0.23.0 or newer');
        expect(markdown).toContain('- Published by: acme/addons');
        expect(markdown).toContain('JSPrismarine lists it without reviewing it');
        expect(markdown.endsWith("## README\n\nFrom the addon's README.md, version 1.2.0.\n\nUse it.\n")).toBe(true);
    });

    it("leaves a first-party addon's page without the review note, and a README that could not be read out", () => {
        const markdown = addonMarkdown({ ...addon, firstParty: true }, undefined);
        expect(markdown).toContain('- Published by: JSPrismarine');
        expect(markdown).not.toContain('without reviewing');
        expect(markdown).not.toContain('## README');
    });

    it('opens a deprecated addon with why, and how to install its replacement', () => {
        const markdown = addonMarkdown(
            { ...addon, deprecated: { by: 'author', reason: 'Moved.', replacedBy: 'acme/addons/portals' } },
            undefined
        );
        expect(markdown).toContain(
            `**Deprecated.** Moved. \`${installCommand('acme/addons/portals')}\` installs its replacement.`
        );
    });
});

describe('marketMarkdown', () => {
    it("lists JSPrismarine's addons, then the community's under the review note, each with its install command", () => {
        const card = (id: string, firstParty: boolean): MarketAddon => ({
            id,
            name: id,
            repository: firstParty ? 'JSPrismarine/JSPrismarine' : 'acme/addons',
            firstParty,
            path: `/addons/${id}`,
            title: id,
            description: `The ${id} addon.`,
            version: '1.0.0',
            minServer: '0.23.0',
            needsNewerServer: false,
            license: 'MIT',
            tags: [],
            authors: [],
            sha256: '00',
            versions: [],
            sourceUrl: '',
            issuesUrl: ''
        });
        const markdown = marketMarkdown(
            { addons: [card('tps-bar', true), card('acme/addons/warps', false)], tags: [], repositories: 2 },
            'Behavior packs.'
        );
        const sections = markdown.split('\n## ');
        expect(sections[0]).toContain('Behavior packs. The marketplace lists 2 addons from 2 repositories.');
        expect(sections[1]).toContain(
            `- [tps-bar](/addons/tps-bar) 1.0.0: The tps-bar addon. \`${installCommand('tps-bar')}\``
        );
        expect(sections[2]).toMatch(/^Community addons\n\nListed, not reviewed/);
        expect(sections[2]).toContain('[acme/addons/warps](/addons/acme/addons/warps)');
    });
});

describe('parityMarkdown', () => {
    const family = (id: string, counts: Partial<TrackerSummaryFamily> = {}): TrackerSummaryFamily => ({
        id,
        group: 'Gameplay',
        checks: 10,
        passed: 8,
        failed: 2,
        notMeasured: 0,
        intentional: 0,
        deferred: 0,
        defects: 0,
        caseCount: 10,
        openGaps: [],
        ...counts
    });
    const gap: TrackerCase = {
        id: 'data:gameplay.food/apple',
        family: 'gameplay.food',
        title: 'apple',
        context: '',
        kind: 'check',
        status: 'failed',
        sourceFile: 'packages/parity/src/food.test.ts',
        details: 'Restores\n  the wrong amount.'
    };
    const summary: TrackerSummary = {
        generatedAt: '2026-11-21T12:00:00.000Z',
        sourceCommit: '0123456789abcdef',
        checks: 1010,
        passed: 1008,
        failed: 2,
        notMeasured: 0,
        intentional: 3,
        deferred: 0,
        defects: 0,
        caseCount: 1013,
        families: [
            family('gameplay.food', { openGaps: [gap] }),
            family('tags.blocks', { group: 'Data', checks: 1000, passed: 1000, failed: 0, intentional: 3 })
        ]
    };
    const markdown = parityMarkdown(summary, { description: 'How much matches.' });

    it('gives the behavior score apart from the data tables, as the tracker does', () => {
        expect(markdown).toContain(
            '- Behavior: 80% of the comparisons of what the server does in play pass (8 of 10).'
        );
        expect(markdown).toContain('- Every comparison: 99.8% (1008 of 1010), data tables included.');
    });

    it('lists every family with its counts, and the open gaps of the families that have them', () => {
        expect(markdown).toContain('| `gameplay.food` | Gameplay | 80% (8 of 10) | 2 | 0 | 0 | 0 | 0 |');
        expect(markdown).toContain('| `tags.blocks` | Data | 100% (1000 of 1000) | 0 | 0 | 0 | 0 | 3 |');
        expect(markdown).toContain('### `gameplay.food`\n\n- `apple` (failed): Restores the wrong amount.');
        expect(markdown).not.toContain('### `tags.blocks`');
    });
});

describe('benchmarksMarkdown', () => {
    const page = readBenchmarkPage();
    if (page === null) throw new Error('The repository holds no benchmark results to build the copy from.');
    const markdown = benchmarksMarkdown(page, {
        description: 'Three servers.',
        repositoryUrl: 'https://example.test/repo'
    });

    it('gives every figure for every server in every scenario, marking wall clock figures indicative', () => {
        for (const scenario of page.results.scenarios) {
            const section = markdown.slice(markdown.indexOf(`## \`${scenario.id}\``)).split('\n## ')[0] ?? '';
            const servers = page.summary.cells.filter((cell) => cell.scenario === scenario.id).length;
            for (const { id, kind } of METRICS) {
                const row = section.split('\n').find((line) => line.startsWith(`| \`${id}\` |`));
                expect(row?.split(' | ')).toHaveLength(3 + servers);
                expect(row?.includes('indicative')).toBe(kind === 'wall');
            }
        }
    });

    it('says whether the run was quiet and links its raw data', () => {
        expect(markdown).toContain(`so the run is ${page.summary.quiet ? 'quiet' : 'indicative'}`);
        expect(markdown).toContain(`(https://example.test/repo/blob/master/${page.file})`);
    });
});
