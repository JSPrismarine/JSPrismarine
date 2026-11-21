import { describe, expect, it } from 'vitest';

import { loadProject } from '../../project.mts';
import type { DescriptionContext } from './pageDescriptions.ts';
import { pageDescriptions } from './pageDescriptions.ts';

/** Describes the given pages, by source file, with one menu that links the decisions index. */
const describePages = (pages: Record<string, string>) => {
    const context: DescriptionContext = {
        project: loadProject(),
        menus: [
            {
                text: 'Project',
                description: 'Where the server stands.',
                sections: [
                    {
                        text: 'Direction',
                        items: [{ text: 'Decisions', description: 'Architecture decision records.', link: '/adr/' }]
                    }
                ]
            }
        ],
        source: (relativePath) => pages[relativePath] ?? ''
    };
    return pageDescriptions(Object.keys(pages), context);
};

describe('pageDescriptions', () => {
    it("describes a page without front matter by its opening sentence, never the site's", () => {
        const descriptions = describePages({
            'guide/joining.md': '# Joining\n\nPlayers add the server by address. More.\n'
        });
        expect(descriptions.get('guide/joining.md')).toBe('Players add the server by address.');
    });

    it('moves pages that open with the same sentence on to their next description', () => {
        const plan = (goal: string) =>
            `# Plan\n\nStarted 2026-11-21. This plan is a working document.\n\n## Goal\n\n${goal}\n`;
        const descriptions = describePages({
            'plans/permissions.md': plan('The server gets a permission system.'),
            'plans/tab-list.md': plan('Two addons and the module members they need.')
        });
        expect(descriptions.get('plans/permissions.md')).toBe('The server gets a permission system.');
        expect(descriptions.get('plans/tab-list.md')).toBe('Two addons and the module members they need.');
    });

    it('describes an index that opens with a list by its menu link', () => {
        const descriptions = describePages({ 'adr/index.md': '# Decisions\n\n- **[One](./0001-one)**\n' });
        expect(descriptions.get('adr/index.md')).toBe('Architecture decision records.');
    });

    it('describes a note whose summary is a list by the first item, wrapped lines joined', () => {
        const note =
            '# Prior art\n\nResearched 2026-10-24 against the source of 25 repositories at pinned commits and more.\n\n' +
            '## Summary\n\n1. Nobody loads both pack\n   formats. No project does.\n2. Second.\n';
        expect(describePages({ 'research/prior-art.md': note }).get('research/prior-art.md')).toBe(
            'Nobody loads both pack formats.'
        );
    });

    it('describes an API page with no comment of its own by what it documents', () => {
        const descriptions = describePages({
            'api/@jsprismarine/raknet/classes/ACK.md':
                '# Class: ACK\n\nThe base class for all packets.\n\n## Methods\n\n### clear()\n\n### contains()\n',
            'api/@jsprismarine/raknet/classes/NACK.md': '# Class: NACK\n\nThe base class for all packets.\n',
            'api/@jsprismarine/prismarine/inventory/slotLog/index.md':
                '# inventory/slotLog\n\n## Type Aliases\n\n### PlayerContainer\n\n### SlotObserver\n'
        });
        expect(descriptions.get('api/@jsprismarine/raknet/classes/ACK.md')).toBe(
            'The ACK class in @jsprismarine/raknet: clear(), contains().'
        );
        expect(descriptions.get('api/@jsprismarine/raknet/classes/NACK.md')).toBe(
            'The NACK class in @jsprismarine/raknet.'
        );
        expect(descriptions.get('api/@jsprismarine/prismarine/inventory/slotLog/index.md')).toBe(
            'The inventory/slotLog module of @jsprismarine/prismarine: PlayerContainer, SlotObserver.'
        );
    });
});
