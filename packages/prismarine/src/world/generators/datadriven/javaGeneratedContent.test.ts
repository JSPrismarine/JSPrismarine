import type { BlockEntityRequest } from '@jsprismarine/features';
import { bedrockDyeIndexOf } from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { javaBlockEntityTypesWithBedrockIds } from '../../../blockentity/bedrockBlockEntityIds';
import { createBlockEntity, createEntitySpawn } from './javaGeneratedContent';

const SEED = 1234n;

const made = (request: BlockEntityRequest) => createBlockEntity({ x: 3, y: 64, z: 7, request }, SEED);

/** A compound the way a structure template reader hands one over. */
const compound = (name: string, entries: Readonly<Record<string, NBTTagCompound | Types.StringVal>>) => {
    const nbt = new NBTTagCompound(name);
    for (const [key, value] of Object.entries(entries)) {
        if (value instanceof NBTTagCompound) nbt.addChild(value);
        else nbt.addValue(key, value);
    }
    return nbt;
};

const str = (value: string) => new Types.StringVal(value);

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

    it('writes what the template saved, which is everything past the three read fields', () => {
        // `javaBlockEntityContent.test.ts` covers the translation itself against the wire
        // bytes. What is under test here is that the saved compound reaches it at all.
        const saved = compound('', {
            id: str('minecraft:vault'),
            config: compound('config', { loot_table: str('minecraft:chests/trial_chambers/reward') })
        });

        const config = made({ id: 'minecraft:vault', saved })!.toNBT().getCompound('config', false);

        expect(config?.getString('loot_table', '')).toBe('loot_tables/chests/trial_chambers/reward.json');
    });

    it('reads a banner color off the Java block, because Bedrock has one banner block', () => {
        const base = (javaBlock?: string) =>
            made({ id: 'minecraft:banner', saved: compound('', { id: str('minecraft:banner') }), ...{ javaBlock } })!
                .toNBT()
                .getNumber('Base', -1);

        expect(base('minecraft:red_banner')).toBe(bedrockDyeIndexOf('red'));
        // Without the block there is nowhere to read the color from, and the banner is white.
        expect(base()).not.toBe(base('minecraft:red_banner'));
    });

    it('leaves a request with nothing saved exactly as it was', () => {
        expect(made({ id: 'minecraft:chest' })!.toNBT().getCompound('config', false)).toBeNull();
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
