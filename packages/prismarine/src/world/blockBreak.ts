/**
 * A block break, run through the content hooks.
 *
 * `World.breakBlock` is the path this server has always had: it writes air over the block and
 * drops what the block says it yields. It raises no hook, so with the content on a chest broken
 * by a player kept its contents, a double chest left its other half paired to a position holding
 * air, and the drops were rolled without the position or the dimension the break happened in.
 *
 * This module is the content path for the same break. The block's behavior family gets
 * `onBreak` before the block goes, which is what spills a container and unpairs a double chest,
 * and Java's loot table for the block decides what falls, with the breaking player's tool in the
 * roll so silk touch and fortune apply.
 *
 * Both halves drop items, so the two have to be told apart. The rule is that the table owns what
 * the block itself yields and the block entity owns the rest: a family with no Java table behind
 * it drops the block's yield on its own - `dropSelf`, the ore substitutes, the crop's seeds - and
 * a drop the family made that the block entity was not holding is that stand-in, which the roll
 * replaces. What is left is the container's contents, and whether those spill at all stays the
 * family's decision, which is how a shulker box keeps what it holds.
 *
 * It reports what to put on the ground, or undefined to send the caller back to the drop it has
 * always made - which is also what happens with `content-packs` off, so a server without content
 * breaks blocks exactly as before.
 */
import type { HookActor, HookBlock, HookItem } from '@jsprismarine/blocks';
import { Gametype } from '@jsprismarine/minecraft';
import { ItemStack } from '@jsprismarine/items';
import type { ItemDrop } from '@jsprismarine/block-behaviors';

import { blockLootTableOf, rollBlockDrops } from '../block/blockLoot';
import type { Block } from '../block/Block';
import type { ContentPosition } from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';
import { itemOfDrop } from '../inventory/persistence';
import { Item } from '../item/Item';
import { lootLevelOf } from './lootLevel';
import type { SystemBlock } from './WorldSystems';

/**
 * `minecraft:enchantments` as a block behavior reads it.
 *
 * A flat record of level by enchantment id, which is what
 * `@jsprismarine/block-behaviors`'s `enchantmentLevel` indexes. The loot grammar reads the same
 * component in Java's own `{ levels: { ... } }` shape, so the two are built separately below
 * rather than shared.
 */
const ENCHANTMENTS_COMPONENT = 'minecraft:enchantments';

/** The world one break happens in, which is every part of a `World` this module reads. */
export interface BreakWorld {
    /** The block at a position, or undefined when its chunk is not in memory. */
    loadedBlockAt(x: number, y: number, z: number): SystemBlock | undefined;
    /** The dimension, whose name the hooks and the loot conditions carry. */
    getDimension(): { readonly name: string };
    /** Ticks since the world started, which a table's `time_check` is applied to. */
    getTicks(): number;
    /** The server, for its content and its log. */
    getServer(): {
        getContent(): ServerContent | undefined;
        getLogger(): { error(error: unknown): void };
    };
}

/**
 * Who broke a block, which is the three things a break reads off a player.
 *
 * Named structurally rather than as `Player` so this module depends on the hand and the
 * position rather than on the class; a `Player` satisfies it.
 */
export interface Breaker {
    /** The mode they are in, because creative takes a block away and leaves nothing behind. */
    readonly gamemode: number;
    getInventory(): { getItemInHand(): Item };
    getPosition(): { getX(): number; getY(): number; getZ(): number };
}

/** What {@link breakBlockWithContent} is given about one break. */
export interface BlockBreak {
    readonly world: BreakWorld;
    /** The block being broken. */
    readonly position: ContentPosition;
    /** Who broke it, absent for a break the world itself performed. */
    readonly player?: Breaker;
    /**
     * The radius of the blast that broke it, for a block an explosion took out.
     *
     * Java's `LootContextParams.EXPLOSION_RADIUS`. Every vanilla block table reads it through
     * `minecraft:explosion_decay`, which keeps each item of a rolled stack with a chance of
     * `1 / radius`, so stone blown up by TNT yields cobblestone three times in four. Absent
     * for a break nothing exploded, which keeps every item.
     */
    readonly explosionRadius?: number;
    /**
     * Whether the block's own yield is rolled at all, true unless the caller says otherwise.
     *
     * False is Java's `Level.removeBlock(pos, false)`, which fire and a replaced block take:
     * the hook still runs, so a burning chest spills what it held, and the block itself
     * leaves nothing. The two are separable because the loot table owns the block's yield and
     * the block entity owns the rest.
     */
    readonly dropsBlock?: boolean;
}

/**
 * The break collecting what its block's family drops, while one is running.
 *
 * `onBreak` runs inside one synchronous dispatch, and a behavior drops through the same
 * `World.dropContents` as everything else, so the break records itself here for the length of
 * that dispatch and takes what falls. Scoped the way `ServerItemActorPort.duringInteraction`
 * records an interaction's target: set for the dispatch and cleared in a `finally`.
 */
let collecting: { readonly world: BreakWorld; readonly drops: Array<Block | Item> } | undefined;

/**
 * Offers one world's drops to the break collecting them.
 *
 * @returns True when a break took them, so the caller must not put them on the ground.
 */
export const collectBreakDrops = (world: BreakWorld, contents: ReadonlyArray<Block | Item | null>): boolean => {
    if (collecting === undefined || collecting.world !== world) return false;

    for (const drop of contents) {
        if (drop !== null) collecting.drops.push(drop);
    }
    return true;
};

/** Runs one dispatch with its drops collected rather than dropped. */
const whileCollecting = (world: BreakWorld, dispatch: () => void): Array<Block | Item> => {
    const drops: Array<Block | Item> = [];
    const outer = collecting;

    collecting = { world, drops };
    try {
        dispatch();
    } finally {
        collecting = outer;
    }

    return drops;
};

/** The namespaced identifier of one drop, whichever of the two kinds it is. */
const nameOf = (drop: Block | Item): string => drop.getName();

/** How many a drop is, which a `Block` is always one of. */
const countOf = (drop: Block | Item): number => (drop instanceof Item ? drop.getAmount() : 1);

/**
 * The item in hand as a block hook reads one, or undefined for a bare hand.
 *
 * The stack's own enchantments come first and the item type answers the rest, so a pickaxe's
 * silk touch is the one this player's pickaxe carries rather than the component the type
 * declares for every pickaxe on the server.
 */
const brokenWith = (content: ServerContent, item: Item | null): HookItem | undefined => {
    if (item === null || item.getName() === 'minecraft:air') return undefined;

    const identifier = item.getName();
    const type = content.items.registry.has(identifier)
        ? new ItemStack(content.items.registry.holder(identifier), item.getAmount())
        : undefined;
    const levels = item.getEnchantments();
    const enchantments = Object.fromEntries(levels);

    return {
        identifier,
        get: (component) =>
            component === ENCHANTMENTS_COMPONENT && levels.size > 0 ? enchantments : type?.get(component)
    };
};

/** The breaking player as a block hook sees one, or undefined for a break nobody made. */
const brokenBy = (player: Breaker | undefined): HookActor | undefined => {
    if (player === undefined) return undefined;

    const position = player.getPosition();
    return {
        identifier: 'minecraft:player',
        position: { x: position.getX(), y: position.getY(), z: position.getZ() }
    };
};

/**
 * The container contents among the drops a family made.
 *
 * Every drop the block entity was holding is kept, counted down slot by slot so a chest holding
 * a chest spills the one it held. Everything else is the family standing in for the loot table,
 * and the roll replaces it.
 */
const spilledContents = (
    captured: readonly (Block | Item)[],
    contents: readonly (ItemDrop | undefined)[]
): Array<Block | Item> => {
    const held = new Map<string, number>();
    for (const slot of contents) {
        if (slot === undefined) continue;
        held.set(slot.identifier, (held.get(slot.identifier) ?? 0) + slot.count);
    }

    const spilled: Array<Block | Item> = [];
    for (const drop of captured) {
        const identifier = nameOf(drop);
        const count = countOf(drop);
        const remaining = held.get(identifier) ?? 0;
        if (remaining < count) continue;

        held.set(identifier, remaining - count);
        spilled.push(drop);
    }

    return spilled;
};

/**
 * Runs the content hooks for one block break and answers what it yields.
 *
 * The hook runs before the caller writes air, because a family reads the block entity it is
 * about to lose: a chest spills what it holds and a double chest unpairs its other half. A
 * behavior that throws is logged and costs the player nothing, because the break then falls back
 * to the drop the server has always made.
 *
 * @returns What to put on the ground, empty for a break that yields nothing, or undefined when
 *   the content declined the break and {@link import('./World').World.breakBlock} should drop
 *   what the block itself says it does.
 */
export const breakBlockWithContent = (breaking: BlockBreak): Array<Block | Item> | undefined => {
    const { world, position, player } = breaking;
    const server = world.getServer();
    const content = server.getContent();
    if (content === undefined) return undefined;

    try {
        const standing = world.loadedBlockAt(position.x, position.y, position.z);
        if (standing === undefined) return undefined;

        const type = content.blocks.types.get(standing.name);
        if (type === undefined) return undefined;

        const dimension = world.getDimension().name;
        const broken: HookBlock = {
            identifier: standing.name,
            position,
            dimension,
            states: standing.states
        };

        const held = player?.getInventory().getItemInHand() ?? null;
        const blocks = content.world.blockWorld.at(dimension);

        // Read before the hook runs, because what spills a container is the hook itself.
        const contents = blocks.getBlockData(position)?.items ?? [];

        const captured = whileCollecting(world, () => {
            type.state(standing.states).content.hooks.dispatch('onBreak', {
                block: broken,
                brokenBlock: broken,
                brokenBy: brokenBy(player),
                itemStack: brokenWith(content, held)
            });
        });

        // Creative takes a block away and leaves nothing behind, so the hook has run and its
        // drops go no further. The side effects it had - the unpaired chest, the block entity
        // it rewrote - stand either way.
        if (player?.gamemode === Gametype.CREATIVE) return [];

        // A block that yields nothing of itself still spills what it was holding, which is
        // the chest a fire burns through or a stream of water washes away.
        if (breaking.dropsBlock === false) return spilledContents(captured, contents);

        // A block the stack has no table for is one the families are the only drop rule for,
        // which is every Bedrock-only block and the whole of a stack with no Java half.
        if (blockLootTableOf(content, standing.name) === undefined) return [...captured];

        const rolled = rollBlockDrops(
            content,
            { identifier: standing.name, states: standing.states },
            {
                position,
                tool: held?.asPredicateStack(),
                level: lootLevelOf(world),
                explosionRadius: breaking.explosionRadius,
                // What the block was holding before the hook ran, for the tables that copy
                // it onto what falls: a shulker box leaves with its contents this way.
                blockEntity: { items: contents }
            }
        );

        return [...rolled.flatMap((drop) => itemOfDrop(drop, content) ?? []), ...spilledContents(captured, contents)];
    } catch (error: unknown) {
        // A behavior that throws must not cost the player the block, and it must not go
        // unreported either. The drop the server has always made stands in, and the throw
        // reaches the log.
        server.getLogger().error(error);
        return undefined;
    }
};
