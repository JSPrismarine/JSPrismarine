/**
 * The loot a generated container fills with the first time it is opened.
 *
 * A chest a structure placed carries a `LootTable` tag and a `LootTableSeed` and no items.
 * `javaGeneratedContent.ts` writes both and stops there, which is what the game does too: the
 * contents are rolled on first open, not at generation, so a world's chests cost nothing until
 * somebody walks into one. Nothing rolled them. Every chest in a village, a shipwreck, a
 * mineshaft, a stronghold, a desert pyramid or a buried treasure opened empty.
 *
 * This is that roll. It is Java's `LootTable.fill`, step for step, because the steps are what
 * decide where the items land: the table is rolled from a `java.util.Random` seeded with the
 * stored seed, the empty slots are shuffled with the same stream, the stacks of more than one
 * are split to spread over the slots there are, and each stack is dealt into a slot off the
 * back of the shuffled list. Two players opening the same chest in two copies of one world see
 * the same items in the same slots.
 *
 * The tag goes once the items are written, which is what makes the roll happen once. A chest
 * already holding something is left alone for the same reason the game leaves one alone: the
 * tag being gone is how a filled chest is told from an unfilled one.
 */
import { pairedPosition } from '@jsprismarine/block-behaviors';
import { LegacyRandomSource } from '@jsprismarine/worldgen';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type { RandomSource } from '@jsprismarine/predicates';

import { BlockEntityRegistry } from '../blockentity/BlockEntityRegistry';
import type { BlockEntity } from '../blockentity/BlockEntity';
import { applyBlockEntityRecord, blockEntityRecord } from '../blockentity/contentRecord';
import { bedrockItemDrops } from '../item/bedrockDrops';
import { blockContainerOf } from './blockContainers';
import { dropOfRolledStack } from '../item/lootStack';
import { javaLootIdOf } from '../entity/data/facts';
import type { ContentItemDrop, ContentPosition } from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';

/** Bedrock's own two tags on an unfilled container, which are also Java's names for them. */
const LOOT_TABLE_TAG = 'LootTable';
const LOOT_SEED_TAG = 'LootTableSeed';

/** A chunk as the fill reads and writes one, which is the little of `Chunk` it touches. */
export interface ContainerLootChunk {
    getBlockEntity(x: number, y: number, z: number): { toNBT(): NBTTagCompound } | null;
    setBlockEntity(blockEntity: BlockEntity): void;
}

/** The little of a world the fill reads: the chunks, synchronously, as a right click can. */
export interface ContainerLootWorld {
    /** The chunk holding a column, or null when it is not in memory. */
    getLoadedChunk(x: number, z: number): ContainerLootChunk | null;
}

/** The predicate grammar's stream over `java.util.Random`, which is what a stored seed names. */
const seededRandom = (source: LegacyRandomSource): RandomSource => ({
    nextFloat: () => source.nextFloat(),
    nextInt: (bound) => (bound <= 0 ? 0 : source.nextIntBounded(bound))
});

/** Java's `Mth.nextInt(random, min, max)`, which is inclusive at both ends. */
const between = (source: LegacyRandomSource, min: number, max: number): number =>
    max <= min ? min : source.nextIntBounded(max - min + 1) + min;

/** Java's `Util.shuffle`: Fisher-Yates from the back, one `nextInt` per position. */
const shuffle = <T>(list: T[], source: LegacyRandomSource): void => {
    for (let index = list.length; index > 1; index -= 1) {
        const target = source.nextIntBounded(index);
        const held = list[index - 1]!;
        list[index - 1] = list[target]!;
        list[target] = held;
    }
};

/**
 * Java's `LootTable.shuffleAndSplitItems`: splits the stacks of more than one until there are
 * as many stacks as slots to put them in, then shuffles the lot.
 *
 * Without it a chest with three rolled stacks would show them in three slots however empty it
 * is, where the game spreads twelve gold ingots over several slots of a dungeon chest.
 */
const shuffleAndSplit = (
    rolled: readonly ContentItemDrop[],
    slots: number,
    source: LegacyRandomSource
): ContentItemDrop[] => {
    const single: ContentItemDrop[] = [];
    const splittable: ContentItemDrop[] = [];
    for (const drop of rolled) {
        if (drop.count <= 0) continue;
        if (drop.count > 1) splittable.push(drop);
        else single.push(drop);
    }

    while (slots - single.length - splittable.length > 0 && splittable.length > 0) {
        const taken = splittable.splice(between(source, 0, splittable.length - 1), 1)[0]!;
        const half = between(source, 1, Math.floor(taken.count / 2));
        const split = { ...taken, count: half };
        const rest = { ...taken, count: taken.count - half };

        if (split.count > 1 && source.nextBoolean()) splittable.push(split);
        else single.push(split);
        if (rest.count > 1 && source.nextBoolean()) splittable.push(rest);
        else single.push(rest);
    }

    single.push(...splittable);
    shuffle(single, source);
    return single;
};

/**
 * Deals what the table rolled into the slots a container has free.
 *
 * @param held - What is in the container now, one entry per slot, `undefined` for an empty one.
 * @returns The whole container, with the rolled stacks in the slots they fell into.
 */
const dealInto = (
    held: readonly (ContentItemDrop | undefined)[],
    rolled: readonly ContentItemDrop[],
    source: LegacyRandomSource
): (ContentItemDrop | undefined)[] => {
    const filled = [...held];
    const free: number[] = [];
    filled.forEach((slot, index) => {
        if (slot === undefined) free.push(index);
    });
    shuffle(free, source);

    // Java takes the slots off the back of the shuffled list and gives up once it runs out,
    // leaving the rest of the roll on the floor rather than overwriting what it already dealt.
    for (const drop of shuffleAndSplit(rolled, free.length, source)) {
        const slot = free.pop();
        if (slot === undefined) break;
        filled[slot] = drop;
    }

    return filled;
};

/** The seed a container stored, read whichever width the writer chose for it. */
const storedSeed = (nbt: NBTTagCompound): bigint =>
    nbt.has(LOOT_SEED_TAG) ? BigInt(nbt.getLong(LOOT_SEED_TAG, BigInt(nbt.getNumber(LOOT_SEED_TAG, 0)))) : 0n;

/** Fills one block entity, or leaves it alone when it carries no unrolled table. */
const fillOne = (content: ServerContent, world: ContainerLootWorld, at: ContentPosition, slots: number): boolean => {
    const chunk = world.getLoadedChunk(at.x >> 4, at.z >> 4);
    const standing = chunk?.getBlockEntity(at.x, at.y, at.z);
    if (chunk === null || chunk === undefined || standing === null || standing === undefined) return false;

    const nbt = standing.toNBT();
    const table = javaLootIdOf(nbt.getString(LOOT_TABLE_TAG, ''));
    if (table === undefined) return false;

    // One stream for the roll, the shuffle and the split, in that order, which is the order
    // Java draws them in. A seed of zero is a container the writer gave no seed, and the game
    // rolls that one off the level's own random; this server has no level random to reach from
    // a right click, so the position stands in and the chest is still the same twice.
    const source = new LegacyRandomSource(storedSeed(nbt) || BigInt(at.x * 31 + at.y * 17 + at.z));
    const rolled = content.loot.roll(table, {
        parameterSet: 'chest',
        parameters: { origin: { x: at.x, y: at.y, z: at.z } },
        random: seededRandom(source)
    });

    const record = blockEntityRecord(nbt);
    const existing = Array.from({ length: slots }, (_unused, slot) => record.items?.[slot]);
    const items = dealInto(
        existing,
        bedrockItemDrops(rolled.filter((stack) => stack.count > 0).map(dropOfRolledStack)),
        source
    );

    // The tags go before the write, so the next open reads a filled container rather than
    // rolling the table a second time.
    nbt.remove(LOOT_TABLE_TAG);
    nbt.remove(LOOT_SEED_TAG);
    applyBlockEntityRecord(nbt, { ...record, items, capacity: slots });
    chunk.setBlockEntity(BlockEntityRegistry.fromNBT(nbt));
    return true;
};

/**
 * Rolls what a generated container holds, the first time it is opened.
 *
 * Both halves of a double chest are filled, because each half is a block entity of its own and
 * carries its own table, and the screen the player is about to be shown spans the two.
 *
 * @param at - The block whose screen is opening.
 * @param identifier - The block standing there, which decides how many slots it has.
 * @returns Whether anything was rolled, so a caller that sends the contents knows they changed.
 */
export const fillContainerLoot = (
    content: ServerContent,
    world: ContainerLootWorld,
    at: ContentPosition,
    identifier: string
): boolean => {
    // The same answer the open itself uses, so a workstation whose slots live in the player's
    // own window - a crafting table, a grindstone - is not offered a chest's 27 to fill.
    const slots = blockContainerOf(identifier)?.slots ?? 0;
    if (slots === 0) return false;

    const filled = fillOne(content, world, at, slots);

    const chunk = world.getLoadedChunk(at.x >> 4, at.z >> 4);
    const standing = chunk?.getBlockEntity(at.x, at.y, at.z);
    const partner = standing ? pairedPosition(blockEntityRecord(standing.toNBT())) : undefined;

    return (partner === undefined ? false : fillOne(content, world, partner, slots)) || filled;
};
