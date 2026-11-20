import { describe, expect, it } from 'vitest';

import { loadProject } from '../../../project.mts';
import { minecraftRange } from '../theme/landing.ts';
import type { MegaMenu } from '../theme/types.ts';
import {
    adrStatus,
    type CardContext,
    cardTitle,
    describeCard,
    headlineText,
    menuTones,
    pageEyebrow,
    pageFigure,
    pageSection,
    splitApiTitle
} from './cardContent.ts';

/** A site menu shaped like the real one: each section links pages, some a whole folder. */
const menus: MegaMenu[] = [
    {
        text: 'Guides',
        description: '',
        sections: [{ text: 'Run a server', items: [{ text: 'Joining', link: '/guide/joining' }] }]
    },
    {
        text: 'Build',
        description: '',
        featured: { text: 'Packages', description: '', link: '/packages' },
        sections: [{ text: 'Reference', items: [{ text: 'API reference', link: '/api/' }] }]
    },
    {
        text: 'Project',
        description: '',
        sections: [
            { text: 'Status', items: [{ text: 'Releases', link: '/releases' }] },
            { text: 'Direction', items: [{ text: 'Decisions', link: '/adr/' }] }
        ]
    }
];

const project = loadProject();
const pages: Record<string, string> = {
    'adr/0025-window.md':
        '# Older protocols are a window\n\nStatus: accepted, 2026-11-18\n\nA server accepts the newest release.\n',
    'api/@jsprismarine/nbt/classes/NBT.md':
        '[API reference](../../index.md) / NBT\n\n# Abstract Class: NBT\n\nDefined in: NBT.ts:3\n\nReads and writes **named** tags. More text.\n',
    'api/@jsprismarine/nbt/index.md': '# @jsprismarine/nbt\n\n[![npm](https://img.shields.io/npm)](https://npm)\n',
    'api/@jsprismarine/protocol/enumerations/PacketId.md': '# Enumeration: PacketId\n\nEvery packet id.\n',
    'api/index.md': '# API reference\n',
    'guide/joining.md': '# Joining a server\n\nHow players add a server.\n',
    'guide/index.md': '# Guides\n',
    'research/molang.md': '# Molang\n\nResearched 2026-10-24. Scope: the subset the vanilla pack uses.\n',
    'index.md': '# Home\n'
};
const context: CardContext = {
    project,
    menus,
    errorCounts: new Map([
        ['commands', 2_000],
        ['auth', 1]
    ]),
    pages: [
        ...Object.keys(pages),
        'api/@jsprismarine/nbt/classes/NBTReader.md',
        'api/@jsprismarine/nbt/namespaces/Types/classes/ByteVal.md',
        'api/@jsprismarine/nbt/namespaces/Types/index.md',
        'guide/running.md'
    ],
    parity: { passed: 7_889, tracked: 10_114 },
    contributors: 22,
    source: (relativePath) => pages[relativePath] ?? ''
};

describe('pageSection', () => {
    it('colors a page by the menu that links it, or links its folder', () => {
        expect(pageSection('guide/joining.md', menus)).toEqual({ section: 'Guides', tone: menuTones.Guides });
        expect(pageSection('releases.md', menus)).toEqual({ section: 'Project', tone: menuTones.Project });
        expect(pageSection('adr/0025-window.md', menus)).toEqual({ section: 'Decisions', tone: menuTones.Project });
        expect(pageSection('api/@jsprismarine/nbt/index.md', menus)).toEqual({
            section: 'API reference',
            tone: menuTones.Build
        });
    });

    it('gives the error reference the signal tile, whatever menu links it', () => {
        expect(pageSection('errors/commands.md', menus).tone).toBe('signal');
    });

    it('fails the build when a menu has no tile color', () => {
        const unknown = menus.map((menu) => ({ ...menu, text: 'Elsewhere' }));
        expect(() => pageSection('guide/joining.md', unknown)).toThrow();
    });
});

describe('figures', () => {
    it('reads an ADR status with its date, and without trailing detail', () => {
        expect(adrStatus('# X\n\nStatus: accepted, 2026-11-18, with the changes\n')).toBe('Accepted 2026-11-18');
        expect(adrStatus('# X\n\nStatus: accepted. Supersedes the rejection\n')).toBe('Accepted');
        expect(adrStatus('# X\n\nNo status line.\n')).toBeUndefined();
    });

    it('shows an ADR number and status', () => {
        expect(pageFigure('adr/0025-window.md', context)).toEqual({ value: '0025', label: 'Accepted 2026-11-18' });
    });

    it('counts errors per package and in all, grouped by thousands', () => {
        expect(pageFigure('errors/commands.md', context)).toEqual({ value: '2,000', label: 'errors' });
        expect(pageFigure('errors/auth.md', context)).toEqual({ value: '1', label: 'error' });
        expect(pageFigure('errors/index.md', context)).toEqual({ value: '2,001', label: 'errors' });
        expect(pageFigure('errors/unknown.md', context)).toBeUndefined();
    });

    it('shows an API page its symbol kind, as the keyword TypeScript uses, and its package', () => {
        expect(pageFigure('api/@jsprismarine/nbt/classes/NBT.md', context)).toEqual({
            value: 'Abstract class',
            label: '@jsprismarine/nbt',
            identifier: true
        });
        expect(pageFigure('api/@jsprismarine/protocol/enumerations/PacketId.md', context)?.value).toBe('Enum');
        expect(splitApiTitle('api/@jsprismarine/x/type-aliases/Id.md', 'Type Alias: Id').kind).toBe('Type');
    });

    it("counts a package's classes, nested namespaces included", () => {
        expect(pageFigure('api/@jsprismarine/nbt/index.md', context)).toEqual({ value: '3', label: 'classes' });
    });

    it('shows the root pages the facts they are about', () => {
        expect(pageFigure('releases.md', context)?.value).toBe(`v${project.version}`);
        expect(pageFigure('packages.md', context)?.value).toBe(String(project.packages.length));
        expect(pageFigure('parity.md', context)).toEqual({ value: '78%', label: 'behavior parity' });
        expect(pageFigure('contributors.md', context)).toEqual({ value: '22', label: 'contributors' });
        expect(pageFigure('parity.md', { ...context, parity: undefined })).toBeUndefined();
        expect(pageFigure('guide/joining.md', context)).toBeUndefined();
    });

    it('counts the pages in a section overview', () => {
        expect(pageFigure('guide/index.md', context)).toEqual({ value: '2', label: 'guides' });
    });

    it("shows a research note's date", () => {
        expect(pageFigure('research/molang.md', context)).toEqual({ value: '2026-10-24', label: 'Researched' });
    });
});

describe('pageEyebrow', () => {
    it('names the menu group that links a page, or the menu when that would repeat the title', () => {
        expect(pageEyebrow('releases.md', 'Releases', menus)).toBe('Status');
        expect(pageEyebrow('api/index.md', 'API reference', menus)).toBe('Reference');
        expect(pageEyebrow('guide/index.md', 'Guides', menus)).toBeUndefined();
    });
});

describe('describeCard', () => {
    it('drops the symbol kind from an API title and reads the description from the page', () => {
        expect(splitApiTitle('api/@jsprismarine/nbt/classes/NBT.md', 'Abstract Class: NBT')).toEqual({
            name: 'NBT',
            kind: 'Abstract class'
        });
        expect(splitApiTitle('guide/faq.md', 'Question: why?').name).toBe('Question: why?');
        const card = describeCard(
            { relativePath: 'api/@jsprismarine/nbt/classes/NBT.md', style: 'bento', title: 'Abstract Class: NBT' },
            context
        );
        expect(card).toMatchObject({ title: 'NBT', identifier: true, description: 'Reads and writes named tags.' });
    });

    it('gives an ADR no description, since its tile shows the number and status', () => {
        const card = describeCard(
            { relativePath: 'adr/0025-window.md', style: 'bento', title: 'Older protocols are a window' },
            context
        );
        expect(card.description).toBeUndefined();
        expect(card.figure?.value).toBe('0025');
    });

    it("keeps a description the request carries, and gives a package its manifest's", () => {
        const card = describeCard(
            { relativePath: 'guide/joining.md', style: 'bento', title: 'Joining', description: 'Own words.' },
            context
        );
        expect(card).toMatchObject({ description: 'Own words.', identifier: false, figure: undefined });
        const nbt = describeCard(
            { relativePath: 'api/@jsprismarine/nbt/index.md', style: 'bento', title: '@jsprismarine/nbt' },
            context
        );
        expect(nbt.description).toBe(project.packages.find(({ name }) => name === '@jsprismarine/nbt')?.description);
    });

    it('sets identifiers in mono, but not the API reference itself', () => {
        const title = (relativePath: string, text: string) =>
            describeCard({ relativePath, style: 'bento', title: text }, context).identifier;
        expect(title('api/@jsprismarine/nbt/index.md', '@jsprismarine/nbt')).toBe(true);
        expect(title('api/index.md', 'API reference')).toBe(false);
    });

    it("titles a package's error reference by the package", () => {
        expect(cardTitle('errors/commands.md', '@jsprismarine/commands errors')).toBe('@jsprismarine/commands');
        expect(cardTitle('errors/common.md', 'Shared errors')).toBe('Shared errors');
    });

    it('summarizes a dated research note by its scope, and shows the date in the figure', () => {
        const card = describeCard({ relativePath: 'research/molang.md', style: 'bento', title: 'Molang' }, context);
        expect(card.description).toBe('The subset the vanilla pack uses.');
        expect(card.figure?.label).toBe('Researched');
    });

    it('sets the landing page headline and the facts its hero shows', () => {
        const card = describeCard(
            { relativePath: 'index.md', style: 'hero', title: 'Home', description: 'D' },
            context
        );
        expect(card.title).toBe(headlineText);
        expect(card.headline).toBeDefined();
        expect(card.eyebrow.flat().map(({ text }) => text)).toEqual([
            `v${project.version}`,
            `Minecraft ${minecraftRange(project)}`
        ]);
        expect(card.eyebrow[0]?.[0]?.asIs).toBe(true);
    });

    it('labels a hero with its menu group, and sets its figure apart', () => {
        const card = describeCard({ relativePath: 'releases.md', style: 'hero', title: 'Releases' }, context);
        expect(card.eyebrow).toEqual([[{ text: 'Status' }]]);
        expect(card.figure).toEqual({ value: `v${project.version}`, label: 'latest release' });
    });
});
