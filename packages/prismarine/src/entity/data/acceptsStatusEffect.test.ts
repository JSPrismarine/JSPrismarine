import { EntityTypes } from '@jsprismarine/entities';
import type { EntityInstance } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { acceptsStatusEffect } from './EntityRuntime';

/** Spawns a bare entity type with the Java entity type tags a test gives it. */
const spawn = (
    identifier: string,
    tags: readonly string[] = [],
    components: Record<string, unknown> = {}
): EntityInstance => {
    const types = new EntityTypes({ tagLookup: () => tags });
    types.load([
        {
            data: {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier },
                    components: { 'minecraft:health': { value: 10 }, ...components }
                }
            },
            pack: 'test',
            path: `entities/${identifier}.json`
        }
    ]);
    return types.spawn(identifier);
};

describe('acceptsStatusEffect', () => {
    it("refuses an undead mob poison and regeneration, as Java's ignores_poison_and_regen tag does", () => {
        const zombie = spawn('minecraft:zombie', ['minecraft:undead', 'minecraft:ignores_poison_and_regen']);

        expect(acceptsStatusEffect(zombie, 'minecraft:poison')).toBe(false);
        expect(acceptsStatusEffect(zombie, 'regeneration')).toBe(false);
        expect(acceptsStatusEffect(zombie, 'minecraft:wither')).toBe(true);
    });

    it("refuses the effects a Java class's own canBeAffected names", () => {
        expect(acceptsStatusEffect(spawn('minecraft:cave_spider'), 'minecraft:poison')).toBe(false);
        expect(acceptsStatusEffect(spawn('minecraft:wither_skeleton'), 'minecraft:wither')).toBe(false);
        expect(acceptsStatusEffect(spawn('minecraft:parched'), 'minecraft:weakness')).toBe(false);
        expect(acceptsStatusEffect(spawn('minecraft:cow'), 'minecraft:poison')).toBe(true);
    });

    it('still reads minecraft:mob_effect_immunity', () => {
        const slime = spawn('test:slime', [], { 'minecraft:mob_effect_immunity': { mob_effects: ['oozing'] } });

        expect(acceptsStatusEffect(slime, 'minecraft:oozing')).toBe(false);
        expect(acceptsStatusEffect(slime, 'minecraft:speed')).toBe(true);
    });
});
