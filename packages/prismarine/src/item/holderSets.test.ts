import { describe, expect, it } from 'vitest';

import { holderSetIncludes } from './holderSets';

describe('holderSetIncludes', () => {
    it('matches an entry set against the Bedrock identity of a Java block', () => {
        const cobweb = { kind: 'entries', entries: ['minecraft:cobweb'] } as const;

        expect(holderSetIncludes(undefined, cobweb, 'minecraft:web')).toBe(true);
        expect(holderSetIncludes(undefined, cobweb, 'minecraft:cobweb')).toBe(true);
        expect(holderSetIncludes(undefined, cobweb, 'minecraft:stone')).toBe(false);
    });

    it('matches an entry set against the Bedrock identity of a Java item or entity type', () => {
        expect(
            holderSetIncludes(
                undefined,
                { kind: 'entries', entries: ['minecraft:ender_pearl'] },
                'minecraft:ender_pearl'
            )
        ).toBe(true);
        expect(
            holderSetIncludes(
                undefined,
                { kind: 'entries', entries: ['minecraft:chest_minecart'] },
                'minecraft:chest_minecart'
            )
        ).toBe(true);
    });

    it('matches a Java-keyed tag against the Bedrock identity of a renamed block', () => {
        const tags = {
            includes: (registry: string, tag: string, member: string) =>
                registry === 'block' && tag === 'minecraft:mineable/axe' && member === 'minecraft:note_block'
        };

        expect(holderSetIncludes(tags, { kind: 'tag', tag: 'minecraft:mineable/axe' }, 'minecraft:noteblock')).toBe(
            true
        );
        expect(holderSetIncludes(tags, { kind: 'tag', tag: 'minecraft:mineable/axe' }, 'minecraft:stone')).toBe(false);
    });

    it('leaves a tag set to the tag lookup', () => {
        const tags = {
            includes: (_registry: string, tag: string, member: string) =>
                tag === 'minecraft:logs' && member === 'minecraft:oak_log'
        };
        const logs = { kind: 'tag', tag: 'minecraft:logs' } as const;

        expect(holderSetIncludes(tags, logs, 'minecraft:oak_log')).toBe(true);
        expect(holderSetIncludes(undefined, logs, 'minecraft:oak_log')).toBe(false);
    });
});
