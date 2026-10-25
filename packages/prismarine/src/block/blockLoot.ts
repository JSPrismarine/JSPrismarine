/**
 * What a block yields when it breaks, rolled out of Java's loot tables.
 *
 * Bedrock publishes almost none of them. A Bedrock Dedicated Server 1.26.51.1
 * carries 99 block tables in `vanilla_1.26.50`, against Java's 1201, because
 * the engine holds the rest in code. Of the 99, 96 are the 16 dye colors times
 * the concrete and wool slabs, double slabs and stairs; the other three are
 * the red shrub and the two growth stages of the shelf mushroom. Java 26.3
 * publishes a table for every block among them, so none of the 99 is read
 * here. Reading them would be a second answer to a question the Java half
 * already answers, and the two would part company the first time one edition
 * changed a drop.
 *
 * So the drops are Java's: gravel's one-in-ten flint, the fortune curves, the
 * silk touch branches and the shears rules are read rather than written.
 *
 * The one thing that has to be bridged is the name. A loot table is keyed by
 * the Java block id and the server's blocks are Bedrock ones, so the index
 * below is built the only way the mapping package allows: forward, from every
 * `minecraft:blocks/...` table the stack registered, through
 * `javaBlockStateToBedrock`, back to the Bedrock identifier it lands on.
 */
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import type {
    BlockEntityView,
    ItemStack as PredicateItemStack,
    LevelView,
    RandomSource
} from '@jsprismarine/predicates';

import type { BlockEntityData, ContentBlock, ContentItemDrop } from '../content/world/adapter';
import { bedrockItemDrops } from '../item/bedrockDrops';
import { containerComponentOf, dropOfRolledStack } from '../item/lootStack';
import type { ServerContent } from '../content/ServerContent';

/** The prefix every Java block loot table id carries. */
const BLOCK_TABLE_PREFIX = 'minecraft:blocks/';

/**
 * Bedrock identifier to Java block loot table id, one index per content
 * build.
 *
 * Keyed weakly on the content so a reload drops it with the registries it
 * describes, and built on first use because a server that never breaks a
 * block never pays the 1400 lookups.
 */
const indexes = new WeakMap<ServerContent, ReadonlyMap<string, string>>();

/** Walks every registered block table once and records which Bedrock block each one drops. */
const buildIndex = (content: ServerContent): ReadonlyMap<string, string> => {
    const index = new Map<string, string>();
    for (const id of content.loot.ids) {
        if (!id.startsWith(BLOCK_TABLE_PREFIX)) continue;

        const mapped = javaBlockStateToBedrock(`minecraft:${id.slice(BLOCK_TABLE_PREFIX.length)}`);
        if (mapped.kind === 'unknown') continue;

        // Several Java blocks can collapse onto one Bedrock identifier - the
        // merges `@jsprismarine/mapping` lists - and the first table wins,
        // which is load order. A later one would be no more right.
        if (!index.has(mapped.bedrock.name)) index.set(mapped.bedrock.name, id);
    }
    return index;
};

/**
 * The Java loot table a Bedrock block drops through.
 *
 * @returns The table id, or undefined for a block the stack registered no
 *   table for, which is a Bedrock-only block or a stack with no Java half.
 */
export const blockLootTableOf = (content: ServerContent, identifier: string): string | undefined => {
    let index = indexes.get(content);
    if (index === undefined) {
        index = buildIndex(content);
        indexes.set(content, index);
    }
    return index.get(identifier);
};

/** What a break knows about itself, beyond the block that broke. */
export interface BlockDropContext {
    /** Where the block stood, which `origin` and the position predicates read. */
    readonly position?: { readonly x: number; readonly y: number; readonly z: number };
    /** What broke it, which decides silk touch, fortune and the shears branches. */
    readonly tool?: PredicateItemStack;
    /** The world the clock and location conditions read. */
    readonly level?: LevelView;
    /**
     * The radius of the blast that broke it, for a block an explosion took out.
     *
     * Java's `LootContextParams.EXPLOSION_RADIUS`, which every vanilla block
     * table reads through its `minecraft:explosion_decay` function: each item
     * in a rolled stack survives with a chance of `1 / radius`, so a stone
     * blown up by TNT yields cobblestone three times in four and nothing the
     * fourth. Left out for an ordinary break, which keeps every item.
     */
    readonly explosionRadius?: number;
    /** Replaces the table's own sequenced stream, for a test that wants a scripted draw. */
    readonly random?: RandomSource;
    /**
     * What the block was holding, read before the break took it.
     *
     * Java's `LootContextParams.BLOCK_ENTITY`, which the shulker box table's
     * `copy_components` reads: its `minecraft:container` is what the dropped box carries away.
     * Left out for a block that holds nothing, which is every block whose table never looks.
     */
    readonly blockEntity?: BlockEntityData;
}

/**
 * The block entity a table's `copy_components` reads, out of the record the block kept.
 *
 * @returns Undefined when the block held nothing worth copying, which leaves the parameter
 *   out rather than offering the table an empty container.
 */
const blockEntityView = (block: ContentBlock, data: BlockEntityData | undefined): BlockEntityView | undefined => {
    const contents = containerComponentOf(data?.items ?? []);
    if (contents.length === 0) return undefined;

    return { id: block.identifier, components: new Map([['minecraft:container', contents]]) };
};

/** The empty hand, which is a `tool` the `block` context key set requires even so. */
const BARE_HAND: PredicateItemStack = { id: 'minecraft:air', count: 1, components: new Map() };

/** The origin a break with no position reported rolls against. */
const NOWHERE = { x: 0, y: 0, z: 0 } as const;

/**
 * Rolls what one block drops.
 *
 * @returns The stacks that fell, empty for a block with no table - which is
 *   also the right answer for bedrock, air and the other blocks Java gives an
 *   empty table.
 */
export const rollBlockDrops = (
    content: ServerContent,
    block: ContentBlock,
    context: BlockDropContext = {}
): readonly ContentItemDrop[] => {
    const table = blockLootTableOf(content, block.identifier);
    if (table === undefined) return [];

    const rolled = content.loot.roll(table, {
        parameterSet: 'block',
        parameters: {
            origin: context.position ?? NOWHERE,
            // The predicates read Java block names, and the table id is the
            // Java name, so the state goes in under that rather than under
            // the Bedrock identifier the server holds.
            block_state: { name: `minecraft:${table.slice(BLOCK_TABLE_PREFIX.length)}` },
            tool: context.tool ?? BARE_HAND,
            explosion_radius: context.explosionRadius,
            block_entity: blockEntityView(block, context.blockEntity)
        },
        level: context.level,
        random: context.random
    });

    // A stack whose count a modifier took to nothing is not a drop. Java's
    // `LootTable.getRandomItems` filters the empty stacks out the same way,
    // and `minecraft:explosion_decay` is the modifier that produces them.
    //
    // The ids are Java's, because the table is; `bedrockItemDrops` is what makes them names
    // the client resolves.
    return bedrockItemDrops(rolled.filter((stack) => stack.count > 0).map(dropOfRolledStack));
};
