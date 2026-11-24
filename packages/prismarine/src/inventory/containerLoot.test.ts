/**
 * A generated chest, filled the first time it is opened.
 *
 * The block entity under test is built by `javaGeneratedContent.createBlockEntity`, which is
 * the function a structure's chest actually goes through, so the tag and the seed this reads
 * are the tag and the seed generation writes rather than a copy of them kept here. The tables
 * are Java's own, loaded through `@jsprismarine/packs` the way the server loads them.
 */
import { load as loadPacks } from '@jsprismarine/packs';
import type { Definitions } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import type { BlockEntity } from '../blockentity/BlockEntity';
import { blockEntityRecord } from '../blockentity/contentRecord';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import { resolvePackStack } from '../content/packStack';
import { fixtureContentOptions, fixtureDefinitions } from '../content/testing';
import type { ContentItemDrop, ContentPosition } from '../content/world/adapter';
import { createBlockEntity } from '../world/generators/datadriven/javaGeneratedContent';
import type { ContainerLootWorld } from './containerLoot';
import { fillContainerLoot } from './containerLoot';

/** Where the chest stands, which is also what its seed is mixed from. */
const CHEST: ContentPosition = { x: 20, y: 36, z: -12 };

/** The table a dungeon chest names, which is one of the ones a structure writes. */
const DUNGEON = 'minecraft:chests/simple_dungeon';

/** The shipwreck's map chest, whose map pool runs `exploration_map` and drops a map that found nothing. */
const SHIPWRECK_MAP = 'minecraft:chests/shipwreck_map';

/**
 * The real Java 26.3 tables, loaded the way the server loads them. They need the datapack
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches, so this is skipped
 * where that is not on disk.
 */
const javaDatapack = (): Definitions | undefined => {
    const { stack } = resolvePackStack({ vanilla: false, overlay: false });
    const source = stack.find((member) => member.kind === 'datapack');
    return source && loadPacks([source], {}).definitions;
};

const java = javaDatapack();

/** One content over the Java tables, with a world seed of its own. */
const contentWith = (seed: bigint): ServerContent =>
    buildServerContent(
        fixtureContentOptions({
            seed,
            load: () => ({
                definitions: {
                    ...fixtureDefinitions(),
                    lootTablesJava: java!.lootTablesJava,
                    recipesJava: java!.recipesJava,
                    tags: new Map([...fixtureDefinitions().tags, ...java!.tags])
                },
                diagnostics: []
            })
        })
    );

/** A world of one chunk, holding whatever block entities are filed in it. */
const worldHolding = (
    entities: readonly BlockEntity[],
    level: Pick<ContainerLootWorld, 'locateStructure' | 'nextMapId'> = {}
): ContainerLootWorld => {
    const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
    const held = new Map(entities.map((entity) => [key(...positionOf(entity)), entity]));

    const chunk = {
        getBlockEntity: (x: number, y: number, z: number) => held.get(key(x, y, z)) ?? null,
        setBlockEntity: (entity: BlockEntity) => {
            held.set(key(...positionOf(entity)), entity);
        }
    };
    return {
        getLoadedChunk: () => chunk,
        blockEntityChanged: () => {},
        getTicks: () => 0,
        getDimension: () => ({ name: 'minecraft:overworld' }),
        ...level
    };
};

const positionOf = (entity: BlockEntity): [number, number, number] => {
    const at = entity.getPosition();
    return [at.getX(), at.getY(), at.getZ()];
};

/** The chest a structure writes: the Bedrock table path and the seed, and nothing in it yet. */
const generatedChest = (seed: bigint, at: ContentPosition = CHEST, lootTable = DUNGEON): BlockEntity => {
    const entity = createBlockEntity({ request: { id: 'minecraft:chest', lootTable }, ...at }, seed);
    expect(entity).toBeDefined();
    return entity!;
};

/** What one chest holds after it has been opened, by slot. */
const openedChest = (worldSeed: bigint, chestSeed = worldSeed): readonly (ContentItemDrop | undefined)[] => {
    const chest = generatedChest(chestSeed);
    const world = worldHolding([chest]);

    expect(fillContainerLoot(contentWith(worldSeed), world, CHEST, 'minecraft:chest')).toBe(true);

    const filled = world.getLoadedChunk(0, 0)!.getBlockEntity(CHEST.x, CHEST.y, CHEST.z)!;
    return recordOf(filled);
};

const recordOf = (entity: { toNBT(): ReturnType<BlockEntity['toNBT']> }): readonly (ContentItemDrop | undefined)[] => {
    const nbt = entity.toNBT();
    expect(nbt.has('LootTable')).toBe(false);
    expect(nbt.has('LootTableSeed')).toBe(false);
    return blockEntityItems(nbt);
};

const blockEntityItems = (nbt: ReturnType<BlockEntity['toNBT']>): readonly (ContentItemDrop | undefined)[] =>
    // Read back out of Bedrock's own `Items` list, which is what the client is sent and what
    // the next load reads, rather than out of anything this module kept.
    blockEntityRecord(nbt).items ?? [];

describe.skipIf(!java)('a generated container filling on its first open', { tags: ['real-data'] }, () => {
    it('puts what the dungeon table rolled into the chest', () => {
        const items = openedChest(1234n).filter((item) => item !== undefined);

        // Java's `minecraft:chests/simple_dungeon` has three pools, so a chest always holds
        // something, and everything it holds is on the table.
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) expect(SIMPLE_DUNGEON_ITEMS).toContain(item.identifier);
        for (const item of items) expect(item.count).toBeGreaterThan(0);
    });

    it('gives the same chest the same contents in the same slots twice', () => {
        expect(openedChest(1234n)).toEqual(openedChest(1234n));
    });

    it('gives another seed another chest', () => {
        expect(openedChest(1234n)).not.toEqual(openedChest(1234n, 4321n));
    });

    it('spreads the roll over the slots rather than stacking it at the front', () => {
        // Java shuffles the free slots and splits the stacks of more than one over them, so a
        // dungeon chest is sprinkled rather than packed into slots nought upwards.
        const filled = openedChest(1234n)
            .map((item, slot) => (item === undefined ? -1 : slot))
            .filter((slot) => slot >= 0);

        expect(filled.length).toBeGreaterThan(1);
        expect(Math.max(...filled)).toBeGreaterThan(filled.length - 1);
    });

    it('rolls once: a second open leaves the chest as the first one left it', () => {
        const world = worldHolding([generatedChest(1234n)]);
        const content = contentWith(1234n);

        expect(fillContainerLoot(content, world, CHEST, 'minecraft:chest')).toBe(true);
        const afterFirst = recordOf(world.getLoadedChunk(0, 0)!.getBlockEntity(CHEST.x, CHEST.y, CHEST.z)!);

        expect(fillContainerLoot(content, world, CHEST, 'minecraft:chest')).toBe(false);
        expect(recordOf(world.getLoadedChunk(0, 0)!.getBlockEntity(CHEST.x, CHEST.y, CHEST.z)!)).toEqual(afterFirst);
    });

    it('names what it rolled the way Bedrock names it', () => {
        // Every id written into `Items` has to be one the Bedrock registry resolves, which is
        // what `bedrockItemDrops` is for: a Java-only name would reach the client as nothing.
        for (const item of openedChest(99n).filter((held) => held !== undefined)) {
            expect(item.identifier.startsWith('minecraft:')).toBe(true);
            expect(JAVA_ONLY_NAMES).not.toContain(item.identifier);
        }
    });

    it('leaves a container with no table alone', () => {
        const plain = createBlockEntity({ request: { id: 'minecraft:chest' }, ...CHEST }, 1234n)!;
        const world = worldHolding([plain]);

        expect(fillContainerLoot(contentWith(1234n), world, CHEST, 'minecraft:chest')).toBe(false);
    });

    it("points a shipwreck's map at the structure the world finds from the chest", () => {
        const searches: unknown[] = [];
        let lastMapId = -1;
        const world = worldHolding([generatedChest(1234n, CHEST, SHIPWRECK_MAP)], {
            locateStructure: (name, origin, radius, options) => {
                searches.push({ name, origin: { x: origin.x, z: origin.z }, radius, ...options });
                return { x: 400, y: 50, z: -800 };
            },
            nextMapId: () => ++lastMapId
        });
        const bare = worldHolding([generatedChest(1234n, CHEST, SHIPWRECK_MAP)]);

        fillContainerLoot(contentWith(1234n), world, CHEST, 'minecraft:chest');
        fillContainerLoot(contentWith(1234n), bare, CHEST, 'minecraft:chest');

        // The table's own destination and Java's default radius, searched from the chest.
        expect(searches).toEqual([
            // The table sets `skip_existing_chunks` to false, so the search does not skip.
            {
                name: '#minecraft:on_treasure_maps',
                origin: { x: CHEST.x, z: CHEST.z },
                radius: 50,
                skipKnownStructures: false
            }
        ]);
        expect(lastMapId).toBe(0);

        // The map pool keeps a map only once it has a `map_id`, so the chest whose world found
        // the structure holds one item more than the chest whose world could not search.
        const held = (chest: ContainerLootWorld) =>
            recordOf(chest.getLoadedChunk(0, 0)!.getBlockEntity(CHEST.x, CHEST.y, CHEST.z)!)
                .filter((item) => item !== undefined)
                .map((item) => item.identifier);
        const found = held(world);
        const missing = held(bare);
        expect(found.length).toBe(missing.length + 1);
        for (const identifier of missing) expect(found).toContain(identifier);
    });

    it('leaves a block with no slots alone', () => {
        const world = worldHolding([generatedChest(1234n)]);

        expect(fillContainerLoot(contentWith(1234n), world, CHEST, 'minecraft:crafting_table')).toBe(false);
    });
});

/**
 * Every item Java's `minecraft:chests/simple_dungeon` can produce, written out from the 26.3
 * table rather than read back out of it, so a change to the evaluator that drops a pool fails
 * here.
 */
const SIMPLE_DUNGEON_ITEMS = [
    'minecraft:beetroot_seeds',
    'minecraft:bone',
    'minecraft:bread',
    'minecraft:bucket',
    'minecraft:coal',
    'minecraft:copper_horse_armor',
    'minecraft:diamond_horse_armor',
    // The table's book entry runs enchant_randomly, which turns a book into an enchanted book as
    // Java's ItemStack.enchant does, so a plain book never comes out.
    'minecraft:enchanted_book',
    'minecraft:enchanted_golden_apple',
    'minecraft:gold_ingot',
    'minecraft:golden_apple',
    'minecraft:golden_horse_armor',
    'minecraft:gunpowder',
    'minecraft:iron_horse_armor',
    'minecraft:iron_ingot',
    'minecraft:leather',
    'minecraft:melon_seeds',
    'minecraft:music_disc_13',
    'minecraft:music_disc_cat',
    'minecraft:music_disc_otherside',
    'minecraft:name_tag',
    'minecraft:pumpkin_seeds',
    'minecraft:redstone',
    'minecraft:rotten_flesh',
    'minecraft:string',
    'minecraft:wheat'
];

/** The two names a Java table can roll that the Bedrock registry has no item for. */
const JAVA_ONLY_NAMES = ['minecraft:spectral_arrow', 'minecraft:furnace_minecart'];
