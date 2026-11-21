import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { type IndexSource, llmsIndex, llmsText, markdownPages, pageMarkdown, writeMarkdownPages } from './llms.mts';
import { loadProject } from './project.mts';
import type { DocSection } from './sections.mts';

const siteUrl = 'https://docs.example/';
const options = (page: string, pages = ['guide/index.md', 'guide/running.md', 'errors/index.md']) => ({
    page,
    siteUrl,
    markdownPages: new Set(pages)
});

describe('pageMarkdown', () => {
    it('drops the front matter, keeping its title and description when the page lacks them', () => {
        const markdown = pageMarkdown(
            "---\ntitle: Guides\ndescription: 'Where to start.'\naside: false\n---\n\n## Play\n\nProse.\n",
            options('guide/index.md')
        );
        expect(markdown).toBe('# Guides\n\nWhere to start.\n\n## Play\n\nProse.\n');
    });

    it("keeps the page's own title and opening paragraph over the front matter's", () => {
        const markdown = pageMarkdown(
            '---\ntitle: Short\ndescription: Elsewhere.\n---\n# Running JSPrismarine\n\nDownload it.\n',
            options('guide/running.md')
        );
        expect(markdown).toBe('# Running JSPrismarine\n\nDownload it.\n');
    });

    it("puts the description under the page's heading, not under a heading inside a code block", () => {
        const markdown = pageMarkdown(
            '---\ndescription: Commands.\n---\n```sh\n# not a title\n```\n\n# Commands\n\n## List\n',
            options('guide/running.md')
        );
        expect(markdown).toBe('```sh\n# not a title\n```\n\n# Commands\n\nCommands.\n\n## List\n');
    });

    it("points links at a page's Markdown copy when it has one, and at the page otherwise", () => {
        const markdown = pageMarkdown(
            '[Run](/guide/running#worlds) [Guides](/guide/) [Packages](/packages) [Logo](/repo/logo.svg)',
            options('errors/index.md')
        );
        expect(markdown).toBe(
            '[Run](https://docs.example/guide/running.md#worlds) [Guides](https://docs.example/guide/index.md) ' +
                '[Packages](https://docs.example/packages) [Logo](https://docs.example/repo/logo.svg)'
        );
    });

    it('resolves a relative link from the page, such as a generated section index has', () => {
        expect(pageMarkdown('[Running](./running)', options('guide/index.md'))).toBe(
            '[Running](https://docs.example/guide/running.md)'
        );
    });

    it('finds a folder linked without its slash', () => {
        expect(pageMarkdown('[Errors](/errors)', options('guide/index.md'))).toBe(
            '[Errors](https://docs.example/errors/index.md)'
        );
    });

    it('leaves links to the same page and URLs with a scheme as written', () => {
        const links = '[Worlds](#worlds) [GitHub](https://github.com/x/y/blob/master/a.ts) [Mail](mailto:a@b.c)';
        expect(pageMarkdown(links, options('guide/running.md'))).toBe(links);
    });

    it("keeps a site's base path", () => {
        const page = {
            page: 'guide/index.md',
            siteUrl: 'https://example.org/docs/',
            markdownPages: new Set(['guide/running.md'])
        };
        expect(pageMarkdown('[Run](/guide/running) [Up](../packages)', page)).toBe(
            '[Run](https://example.org/docs/guide/running.md) [Up](https://example.org/docs/packages)'
        );
    });
});

describe('markdownPages', () => {
    it('takes the pages staged from the repository, not those written for the site or by TypeDoc', () => {
        const pages = markdownPages(['guide/running.md', 'contributing.md', 'packages.md', 'api/index.md', 'index.md']);
        expect([...pages]).toEqual(['guide/running.md', 'contributing.md']);
    });
});

describe('writeMarkdownPages', () => {
    let root: string | undefined;
    afterEach(() => {
        if (root) rmSync(root, { recursive: true, force: true });
    });

    it('writes a copy beside each staged page, whose site links all name a page or a copy that exists', () => {
        root = mkdtempSync(path.join(tmpdir(), 'llms-'));
        const srcDir = path.join(root, 'src');
        const outDir = path.join(root, 'out');
        const pages = {
            'guide/index.md': '# Guides\n\n- [Running](./running): start a server.\n- [Errors](/errors/)\n',
            'guide/running.md': '# Running\n\nSee the [guides](/guide/) and [packages](/packages).\n',
            'errors/index.md': '# Errors\n\n[Running](/guide/running#start)\n',
            'packages.md': '<PackageDirectory />\n'
        };
        for (const [page, markdown] of Object.entries(pages)) {
            mkdirSync(path.dirname(path.join(srcDir, page)), { recursive: true });
            writeFileSync(path.join(srcDir, page), markdown);
        }

        expect(writeMarkdownPages({ srcDir, outDir, pages: Object.keys(pages), siteUrl })).toBe(3);
        expect(existsSync(path.join(outDir, 'packages.md'))).toBe(false);
        for (const page of ['guide/index.md', 'guide/running.md', 'errors/index.md']) {
            const markdown = readFileSync(path.join(outDir, page), 'utf8');
            for (const [, href] of markdown.matchAll(/\]\(([^)]+)\)/g)) {
                expect(href.startsWith(siteUrl)).toBe(true);
                const file = new URL(href).pathname.slice(1);
                if (file.endsWith('.md')) expect(existsSync(path.join(outDir, file))).toBe(true);
                else expect(Object.keys(pages)).toContain(`${file}.md`);
            }
        }
    });
});

describe('llmsText', () => {
    it('writes the name, the summary, the details and each section with links in the order given', () => {
        const text = llmsText(
            {
                name: 'Server',
                summary: 'A server.',
                details: ['Version 1.'],
                sections: [
                    { title: 'Guides', links: [{ title: 'Running', link: '/guide/running#start', note: 'Start it.' }] },
                    { title: 'Empty', links: [] },
                    { title: 'Optional', links: [{ title: 'Packages', link: '/packages', note: '' }] }
                ]
            },
            { siteUrl, markdownPages: new Set(['guide/running.md']) }
        );
        expect(text).toBe(
            [
                '# Server',
                '> A server.',
                '- Version 1.',
                '## Guides\n\n- [Running](https://docs.example/guide/running.md#start): Start it.',
                '## Optional\n\n- [Packages](https://docs.example/packages)'
            ].join('\n\n') + '\n'
        );
    });
});

describe('llmsIndex', () => {
    let root: string | undefined;
    afterEach(() => {
        if (root) rmSync(root, { recursive: true, force: true });
    });

    const pages = {
        'index.md': '---\nlayout: home\n---\n',
        'guide/index.md': '# Guides\n\nStart from what you are here to do.\n',
        'guide/running.md': '# Running JSPrismarine\n\nDownload the server.\n',
        'data-driven/index.md': '# Data-driven engine\n\nHow vanilla behavior comes from data.\n',
        'data-driven/molang.md': '# Molang\n\nExpressions in packs.\n',
        'adr/0001-stats.md':
            '# Stats live on the entity\n\nStatus: accepted, 2026-11-15\n\nEach entity owns its stats.\n',
        'plans/dated.md': '# Faster CI\n\nWritten 2026-11-01 on `ci`. Shorten the wait for checks.\n',
        'plans/undated.md': '# Worldgen\n\nThe decision is elsewhere.\n',
        'packages.md': '---\ntitle: Packages\ndescription: Every package on npm.\n---\n\n<PackageDirectory />\n',
        'contributing.md': '# Contributing\n\nHow to send a change.\n',
        'api/index.md': '# API reference\n\nGenerated from the packages.\n',
        'api/@jsprismarine/nbt/index.md': '# nbt\n'
    };
    const sections: DocSection[] = [
        { dir: 'guide', title: 'Guides' },
        { dir: 'data-driven', title: 'Data-driven engine' },
        { dir: 'adr', title: 'Decisions', optional: true, dated: true },
        { dir: 'plans', title: 'Plans', optional: true, dated: true }
    ];

    function source(): IndexSource {
        root = mkdtempSync(path.join(tmpdir(), 'llms-index-'));
        const srcDir = root;
        for (const [page, markdown] of Object.entries(pages)) {
            mkdirSync(path.dirname(path.join(srcDir, page)), { recursive: true });
            writeFileSync(path.join(srcDir, page), markdown);
        }
        const files = Object.keys(pages);
        return {
            srcDir,
            pages: files,
            siteUrl,
            summary: 'A Bedrock server.',
            project: loadProject(),
            sections,
            sectionLinks: ({ dir }) =>
                files
                    .filter((page) => page.startsWith(`${dir}/`))
                    .map((page) => `/${page.replace(/(index)?\.md$/, '')}`),
            overviewGroups: ({ dir }) =>
                dir === 'guide'
                    ? [
                          {
                              text: 'Host a server',
                              items: [
                                  { text: 'Run it', link: '/guide/running#start', description: 'Download and start.' },
                                  { text: 'Molang', link: '/data-driven/molang', description: '' }
                              ]
                          }
                      ]
                    : undefined,
            updatedAt: () => Date.UTC(2026, 10, 2)
        };
    }

    it("lists every page once, outside the landing page and the API reference's own pages", () => {
        const index = llmsIndex(source());
        const links = index.sections.flatMap(({ links }) => links.map(({ link }) => link.replace(/#.*$/, '')));
        expect(links.filter((link) => !link.startsWith('/api/@'))).toEqual([
            '/guide/running',
            '/data-driven/molang',
            '/data-driven/',
            '/api/',
            '/adr/0001-stats',
            '/plans/dated',
            '/plans/undated',
            '/guide/',
            '/packages',
            '/contributing'
        ]);
        expect(new Set(links).size).toBe(links.length);
    });

    it("groups a card page's links as its sections, then the other sections, the packages and Optional", () => {
        const index = llmsIndex(source());
        expect(index.sections.map(({ title }) => title)).toEqual([
            'Host a server',
            'Data-driven engine',
            'Packages',
            'Optional'
        ]);
        const [host] = index.sections;
        expect(host?.links).toEqual([
            { title: 'Run it', link: '/guide/running#start', note: 'Download and start.' },
            { title: 'Molang', link: '/data-driven/molang', note: 'Expressions in packs.' }
        ]);
    });

    it('lists each published package at its API reference', () => {
        const project = loadProject();
        const packages = llmsIndex(source()).sections.find(({ title }) => title === 'Packages');
        expect(packages?.links).toHaveLength(project.packages.length);
        for (const pkg of project.packages) {
            expect(packages?.links).toContainEqual({
                title: pkg.name,
                link: `/api/${pkg.name}/`,
                note: pkg.description
            });
        }
    });

    it('labels a dated page with the date it gives, its status, or else its last change', () => {
        const optional = llmsIndex(source()).sections.at(-1);
        const note = (link: string) => optional?.links.find((entry) => entry.link === link)?.note;
        expect(note('/plans/dated')).toBe('Written 2026-11-01. Shorten the wait for checks.');
        expect(note('/adr/0001-stats')).toBe('Status: accepted, 2026-11-15. Each entity owns its stats.');
        expect(note('/plans/undated')).toBe('Updated 2026-11-02. The decision is elsewhere.');
        expect(note('/packages')).toBe('Every package on npm.');
    });
});
