import { describe, expect, it } from 'vitest';

import { isStagedPage, linkRoute, pageSummary } from './sections.mts';

const page = (...blocks: string[]) => ['# Title', ...blocks, '## Next'].join('\n\n');

describe('pageSummary', () => {
    it('takes the description from front matter first', () => {
        expect(pageSummary(`---\ndescription: 'Own words.'\n---\n\n${page('Prose.')}`)).toBe('Own words.');
    });

    it('reads the first sentence of the first paragraph after the title', () => {
        expect(pageSummary(page('First sentence. Second sentence.', 'Another paragraph.'))).toBe('First sentence.');
        expect(pageSummary('# Title\n\n## Straight into a section\n\nProse.\n')).toBe('');
    });

    it('skips code, whether fenced with a blank line inside it or indented', () => {
        const fenced = '```ts\nconst rules = files.map((file) => file.rules);\n\nrules.flat();\n```';
        expect(pageSummary(page(fenced, 'Spawning places mobs.'))).toBe('Spawning places mobs.');
        expect(pageSummary(page('~~~~\n```\n\nstill code\n~~~~', 'Prose.'))).toBe('Prose.');
        expect(pageSummary(page('    const indented = 1;\n\n    more();', 'Prose.'))).toBe('Prose.');
    });

    it("skips the rest of a list item, such as a generated index's summary under a link", () => {
        expect(pageSummary(page('- **[Chunk generation](./chunks)**', '  The decision is in ADR 0002.'))).toBe('');
    });

    it('skips metadata lines and badges, but not a sentence with a colon in it', () => {
        expect(pageSummary(page('Status: accepted, 2026-11-18', 'Older protocols are a window.'))).toBe(
            'Older protocols are a window.'
        );
        expect(pageSummary(page('Defined in: NBT.ts:3', 'Reads tags.'))).toBe('Reads tags.');
        expect(pageSummary(page('[![npm](https://img.shields.io/npm)](https://npm)', 'A package.'))).toBe('A package.');
        expect(pageSummary(page('Bedrock natural spawning: the rules that place mobs. More.'))).toBe(
            'Bedrock natural spawning: the rules that place mobs.'
        );
    });

    it('summarizes a dated note by what it covers, not by its date', () => {
        expect(pageSummary(page('Researched 2026-10-24. Scope: what the server accepts. Covers more.'))).toBe(
            'What the server accepts.'
        );
        expect(pageSummary(page('Research note, 2026-10-29. Question: what changed on the wire?'))).toBe(
            'What changed on the wire?'
        );
        expect(pageSummary(page('Started 2026-11-20.', 'Phases 0 to 4 are done.'))).toBe('Phases 0 to 4 are done.');
        expect(pageSummary(page('Scope: the parts an evaluator must match.'))).toBe(
            'The parts an evaluator must match.'
        );
    });

    it('gives a note no summary when its dated sentence lists sources and the next is about them too', () => {
        const lead =
            'Researched 2026-10-24 against the source of 25 repositories at pinned commits and the docs of each one.';
        expect(pageSummary(page(`${lead} Every claim names its source.`))).toBe('');
    });
});

describe('isStagedPage', () => {
    it('marks pages staged from docs/ and the repository root', () => {
        expect(isStagedPage('guide/running.md')).toBe(true);
        expect(isStagedPage('contributing.md')).toBe(true);
    });

    it('leaves out the marketplace pages the build writes, so their components render', () => {
        expect(isStagedPage('addons/index.md')).toBe(false);
        expect(isStagedPage('addons/tps-bar.md')).toBe(false);
        expect(isStagedPage('addons/owner/repo/name.md')).toBe(false);
    });
});

describe('linkRoute', () => {
    it("turns a page's file into its route, keeping the fragment", () => {
        expect(linkRoute('/guide/writing-addons.md')).toBe('/guide/writing-addons');
        expect(linkRoute('/guide/writing-addons.md#screenshots')).toBe('/guide/writing-addons#screenshots');
        expect(linkRoute('/addons/index.md')).toBe('/addons/');
        expect(linkRoute('./chunks.md')).toBe('./chunks');
    });

    it('keeps GitHub links and files that are not pages as written', () => {
        const github = 'https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/plans/addon-marketplace.md';
        expect(linkRoute(github)).toBe(github);
        expect(linkRoute('/repo/addons/tps-bar/media/bar.png')).toBe('/repo/addons/tps-bar/media/bar.png');
    });
});
