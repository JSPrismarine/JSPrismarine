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
 * the Java block id and the server's blocks are Bedrock ones, so every roll
 * runs `bedrockBlockStateToJava` first and asks the stack for the table of
 * whatever Java block came back.
 *
 * Reading the state and not just the identifier is what makes that work.
 * Bedrock splits blocks Java keeps whole, and the split is in the name: Java's
 * `black_concrete_slab` at `type=double` is a block of its own in Bedrock, and
 * so are the lit furnace, the powered repeater and the hundred-odd others
 * `bedrockBlockToJava` reunites with their parent. Resolving the identifier
 * alone reaches none of them, and they dropped nothing at all.
 *
 * The same state then goes into the roll as `block_state`, which is what Java
 * tables that branch on it need: the double slab's own table is the one that
 * says a `type=double` slab yields two, and a `shelf_mushroom` at `age=1`
 * yields two mushrooms.
 */
import { bedrockBlockStateToJava, bedrockBlockToJava } from '@jsprismarine/mapping';
import type {
    BlockEntityView,
    BlockState,
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
 * The block table ids one content build registered, kept weakly so a reload
 * drops the set with the registries it describes.
 */
const registered = new WeakMap<ServerContent, ReadonlySet<string>>();

/** The table id of one Java block, or undefined when the stack registered none. */
const tableOf = (content: ServerContent, javaBlock: string): string | undefined => {
    let ids = registered.get(content);
    if (ids === undefined) {
        ids = new Set(content.loot.ids.filter((id) => id.startsWith(BLOCK_TABLE_PREFIX)));
        registered.set(content, ids);
    }

    const id = `${BLOCK_TABLE_PREFIX}${javaBlock.slice('minecraft:'.length)}`;
    return ids.has(id) ? id : undefined;
};

/** A block's table and the Java state the table's own conditions read. */
interface BlockLootSource {
    /** The namespaced Java loot table id. */
    readonly table: string;
    /** The Java block state the Bedrock block stands for, as the `block_state` parameter. */
    readonly state: BlockState;
}

/**
 * The table a Bedrock block rolls, and the Java state it rolls as.
 *
 * The block's own state answers first, which is the only answer that can carry
 * the properties a table branches on. Where that Java block has no table the
 * search widens to every Java block the identifier stands for, so a Bedrock
 * torch on a wall still drops a torch even though Java publishes no table for
 * `wall_torch`.
 */
const sourceOf = (
    content: ServerContent,
    identifier: string,
    states: Readonly<Record<string, string | number | boolean>> | undefined
): BlockLootSource | undefined => {
    const exact = bedrockBlockStateToJava(identifier, states);
    if (exact.kind === 'mapped') {
        const table = tableOf(content, exact.java.name);
        if (table !== undefined) {
            return { table, state: { name: exact.java.name, properties: exact.java.properties } };
        }
    }

    for (const javaBlock of bedrockBlockToJava(identifier)) {
        const table = tableOf(content, javaBlock);
        if (table !== undefined) return { table, state: { name: javaBlock } };
    }
    return undefined;
};

/**
 * The Java loot table a Bedrock block drops through.
 *
 * @param content - The content build whose stack registered the tables.
 * @param identifier - The namespaced Bedrock block identifier.
 * @param states - The block's state values, which decide the answer wherever
 *   Bedrock splits one Java block across several identifiers. Without them the
 *   answer is the first Java block the identifier stands for that has a table,
 *   which is enough to tell a block that drops something from one that does not.
 * @returns The table id, or undefined for a block the stack registered no
 *   table for, which is a Bedrock-only block or a stack with no Java half.
 */
export const blockLootTableOf = (
    content: ServerContent,
    identifier: string,
    states?: Readonly<Record<string, string | number | boolean>>
): string | undefined => sourceOf(content, identifier, states)?.table;

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
    const source = sourceOf(content, block.identifier, block.states);
    if (source === undefined) return [];

    const rolled = content.loot.roll(source.table, {
        parameterSet: 'block',
        parameters: {
            origin: context.position ?? NOWHERE,
            // The predicates read Java block names and Java property values,
            // so what goes in is the Java state the Bedrock block stands for
            // rather than the Bedrock identifier the server holds.
            block_state: source.state,
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
