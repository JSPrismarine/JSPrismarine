import { describe, expect, it } from 'vitest';

import { type ChangelogRelease, SHOWN_RELEASES } from './changelog.mts';
import { packagesMarkdown, releasesMarkdown } from './llmsPages.mts';
import { loadProject } from './project.mts';
import { pageTitle } from './sections.mts';
import { packageAreas } from './site/.vitepress/theme/packageAreas.ts';

describe('packagesMarkdown', () => {
    const project = loadProject();
    const markdown = packagesMarkdown(project);

    it('lists every published package once, at its API reference and npm page', () => {
        expect(pageTitle(markdown, '')).toBe('Packages');
        for (const { name, version } of project.packages) {
            const lines = markdown.split('\n').filter((line) => line.startsWith(`- [\`${name}\`]`));
            expect(lines).toHaveLength(1);
            expect(lines[0]).toContain(`(/api/${name}/) ${version}: `);
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
