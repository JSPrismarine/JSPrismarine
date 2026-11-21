import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { markdownPages, pageMarkdown, writeMarkdownPages } from './llms.mts';

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
