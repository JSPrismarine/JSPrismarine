import { describe, expect, it } from 'vitest';

import { javaLootIdOf } from '../entity/data/facts';
import { bedrockLootPathOf } from './lootTablePaths';

describe('loot table paths', () => {
    it('writes the path a behavior pack writes', () => {
        expect(bedrockLootPathOf('minecraft:chests/simple_dungeon')).toBe('loot_tables/chests/simple_dungeon.json');
    });

    it('leaves another namespace in the path, since a pack has nowhere else to put it', () => {
        expect(bedrockLootPathOf('example:chests/crate')).toBe('loot_tables/example:chests/crate.json');
    });

    it('round-trips every vanilla table shape back to the id the registry is keyed by', () => {
        for (const id of [
            'minecraft:chests/simple_dungeon',
            'minecraft:chests/spawn_bonus_chest',
            'minecraft:entities/cow',
            'minecraft:blocks/stone'
        ]) {
            expect(javaLootIdOf(bedrockLootPathOf(id))).toBe(id);
        }
    });
});
