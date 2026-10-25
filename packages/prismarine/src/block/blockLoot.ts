/**
 * What a block yields when it breaks, rolled out of Java's loot tables.
 *
 * Bedrock ships no block loot tables at all: a Bedrock Dedicated Server
 * carries tables for chests, entities, equipment and gameplay and none for
 * blocks, because the engine holds them in code. Java publishes all 1447 as
 * data, so this is where the Java half of the pack stack pays for itself -
 * gravel's one-in-ten flint, the fortune curves, the silk touch branches and
 * the shears rules are read rather than written.
 *
 * The one thing that has to be bridged is the name. A loot table is keyed by
 * the Java block id and the server's blocks are Bedrock ones, so the index
 * below is built the only way the mapping package allows: forward, from every
 * `minecraft:blocks/...` table the stack registered, through
 * `javaBlockStateToBedrock`, back to the Bedrock identifier it lands on.
 */
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import type { ItemStack as PredicateItemStack, RandomSource } from '@jsprismarine/predicates';

import type { ContentBlock, ContentItemDrop } from '../content/world/adapter';
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
    /** Replaces the table's own sequenced stream, for a test that wants a scripted draw. */
    readonly random?: RandomSource;
}

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
            tool: context.tool ?? BARE_HAND
        },
        random: context.random
    });

    return rolled.map((stack) => ({ identifier: stack.id, count: stack.count }));
};
