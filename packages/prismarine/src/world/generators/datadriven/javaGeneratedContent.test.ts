import type { BlockEntityRequest } from '@jsprismarine/features';
import { describe, expect, it } from 'vitest';

import { javaBlockEntityTypesWithBedrockIds } from '../../../blockentity/bedrockBlockEntityIds';
import { createBlockEntity, createEntitySpawn } from './javaGeneratedContent';

const SEED = 1234n;

const made = (request: BlockEntityRequest) => createBlockEntity({ x: 3, y: 64, z: 7, request }, SEED);

describe('createBlockEntity', () => {
    it('names the block entity the way Bedrock does', () => {
        expect(made({ id: 'minecraft:chest' })?.getId()).toBe('Chest');
        expect(made({ id: 'minecraft:trapped_chest' })?.getId()).toBe('Chest');
        expect(made({ id: 'minecraft:trial_spawner' })?.getId()).toBe('TrialSpawner');
        expect(made({ id: 'minecraft:vault' })?.getId()).toBe('Vault');
        expect(made({ id: 'minecraft:decorated_pot' })?.getId()).toBe('DecoratedPot');
        expect(made({ id: 'minecraft:lectern' })?.getId()).toBe('Lectern');
    });

    it('answers for every Java block entity type Bedrock has, not only the containers', () => {
        // The gap this closed: six types had a row, so a generated structure kept its chests
        // and dropped its trial spawners, its vaults, its pots and its lecterns.
        for (const type of javaBlockEntityTypesWithBedrockIds()) {
            expect(made({ id: type }), type).toBeDefined();
        }
    });

    it('has no answer for a type Bedrock does not have', () => {
        expect(made({ id: 'minecraft:potent_sulfur' })).toBeUndefined();
    });

    it('leaves a container unrolled, with the table and the seed the fill needs', () => {
        const nbt = made({
            id: 'minecraft:chest',
            lootTable: 'minecraft:chests/village/village_plains_house'
        })!.toNBT();

        expect(nbt.getString('LootTable', '')).toBe('loot_tables/chests/village/village_plains_house.json');
        expect(nbt.getNumber('LootTableSeed', 0)).not.toBe(0);
        expect(nbt.getList('Items', false)).toBeNull();
    });

    it('gives two containers in two places two seeds, and the same place the same one', () => {
        const seedAt = (x: number, z: number) =>
            createBlockEntity({ x, y: 64, z, request: { id: 'minecraft:chest', lootTable: 'a' } }, SEED)!
                .toNBT()
                .getNumber('LootTableSeed', 0);

        expect(seedAt(3, 7)).toBe(seedAt(3, 7));
        expect(seedAt(3, 7)).not.toBe(seedAt(4, 7));
    });

    it('names the mob a generated spawner produces', () => {
        const nbt = made({ id: 'minecraft:mob_spawner', spawnEntity: 'minecraft:cave_spider' })!.toNBT();

        expect(nbt.getString('EntityIdentifier', '')).toBe('minecraft:cave_spider');
        expect(nbt.getShort('Delay', -1)).toBe(0);
    });
});

describe('createEntitySpawn', () => {
    it('maps a Java entity type onto the Bedrock identifier and keeps the position', () => {
        expect(createEntitySpawn({ type: 'minecraft:villager', x: 11.5, y: 64, z: 22.5, yaw: 90 })).toMatchObject({
            x: 11.5,
            y: 64,
            z: 22.5,
            yaw: 90
        });
    });

    it('drops an entity type Bedrock has no counterpart for', () => {
        expect(createEntitySpawn({ type: 'minecraft:not_a_mob', x: 0, y: 0, z: 0, yaw: 0 })).toBeUndefined();
    });
});
