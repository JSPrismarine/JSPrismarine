import { item_id_map as BlockIdMap } from '@jsprismarine/bedrock-data';
import { blockProperties, replaceable } from '@jsprismarine/blocks';
import { isFullCube } from '@jsprismarine/engine-systems';
import type { BlockStateValue, BlockType } from '@jsprismarine/blocks';
import { bedrockBlockPropertiesOf, bedrockBlockStateToJava, bedrockBlockToJava } from '@jsprismarine/mapping';

import type { ServerContent } from '../content/ServerContent';
import { Item } from '../item/Item';
import type { LootLevelWorld } from '../world/lootLevel';
import { lootLevelOf } from '../world/lootLevel';
import { rollBlockDrops } from './blockLoot';
import { BlockStateSchemas } from './state/BlockStateSchema';

/**
 * Everything the server reads off one block state.
 *
 * Resolved once, by whoever built the block, rather than looked up per call.
 * {@link blockFromContent} fills it from `ServerContent`'s flattened per-state
 * table when the server built its content from packs; a block built without
 * one falls back to `@jsprismarine/mapping`'s Java-sourced table, which is
 * the same data the overlay pack is generated from.
 */
export interface BlockFacts {
    /** Java destroy time in seconds; `-1` marks the unbreakable. */
    readonly hardness: number;
    /** Java explosion resistance; obsidian is 1200 where its hardness alone would say 250. */
    readonly blastResistance: number;
    /** Emitted light, 0 to 15. */
    readonly lightEmission: number;
    /** How much light the block swallows, 0 to 15. */
    readonly lightFilter: number;
    /** Ground friction: 0.6 for almost everything, 0.989 for blue ice. */
    readonly friction: number;
    /** Fire's odds of consuming the block once lit, Java's burn odds. */
    readonly burnOdds: number;
    /** Whether breaking without the right tool yields nothing. */
    readonly requiresCorrectTool: boolean;
    /** Whether anything can stand on the block. */
    readonly solid: boolean;
}

/** What a {@link Block} is built from. */
export interface BlockProps {
    /** The namespaced Bedrock block identifier, such as `minecraft:oak_stairs`. */
    name: string;
    /** The state values the block carries, empty for its default state. */
    states?: Readonly<Record<string, BlockStateValue>>;
    /**
     * The vanilla block state this block is placed as, when that differs from {@link name}.
     *
     * Bedrock does not always have one block per thing the server models: all
     * sixteen colored beds are `minecraft:bed` on the wire, with the color in
     * the block entity.
     */
    stateName?: string;
    /** The resolved facts, when the caller read them out of a content build. */
    facts?: BlockFacts;
    /** The content the block's drops are rolled against, when the server built one. */
    content?: ServerContent;
}

/** Java's block tag for what a placement overwrites; see {@link Block.canBeReplaced}. */
const REPLACEABLE_TAG = 'minecraft:replaceable';

/** The facts of a block the Java property table does not know, which is a Bedrock-only block. */
const UNKNOWN_FACTS = {
    hardness: 0,
    blastResistance: 0,
    lightEmission: 0,
    lightFilter: 15,
    friction: 0.6,
    burnOdds: 0,
    requiresCorrectTool: false
} as const;

/**
 * The Java-sourced facts of one block state.
 *
 * Solidity is not in that table, because no Mojang report publishes a
 * per-block collision column, so it comes from
 * `@jsprismarine/engine-systems`'s own rule - the same one the fluid, piston
 * and spawn code already uses.
 */
export const javaBlockFactsOf = (name: string, states: Readonly<Record<string, BlockStateValue>> = {}): BlockFacts => {
    const row = bedrockBlockPropertiesOf(name, states);
    const solid = isFullCube({ name, states });
    if (row === undefined) return { ...UNKNOWN_FACTS, solid };

    return {
        hardness: row.hardness,
        blastResistance: row.blastResistance,
        lightEmission: row.lightEmission,
        lightFilter: row.lightDampening,
        friction: row.friction,
        burnOdds: row.burnOdds,
        requiresCorrectTool: row.requiresCorrectTool,
        solid
    };
};

/**
 * One block state, as the rest of the server holds one.
 *
 * A data record rather than a base class: there are no subclasses any more,
 * because the 1477 blocks and their 22079 states come out of the pack stack
 * and their behavior out of `@jsprismarine/block-behaviors`'s 49 families.
 * What a block yields comes out of Java's loot tables rather than out of a
 * method an author overrode, which is why the 260 classes this replaced were
 * able to go.
 */
export class Block {
    /** The namespaced Bedrock block identifier. */
    public readonly name: string;
    /** The state values the block carries. */
    public readonly states: Readonly<Record<string, BlockStateValue>>;

    private readonly placedStateName: string | undefined;
    private readonly facts: BlockFacts;
    private readonly content: ServerContent | undefined;
    private readonly networkId: number | undefined;

    public constructor({ name, states = {}, stateName, facts, content }: BlockProps) {
        this.name = name;
        this.states = states;
        this.placedStateName = stateName;
        this.content = content;
        this.facts = facts ?? javaBlockFactsOf(stateName ?? name, states);
        this.networkId = BlockIdMap[name];
    }

    public get [Symbol.toStringTag]() {
        return `Block(${this.toString()})`;
    }
    public toString() {
        return this.name;
    }

    /** The block's namespaced identifier. */
    public getName(): string {
        return this.name;
    }

    /** The vanilla block state to place, which is {@link name} unless overridden. */
    public getStateName(): string {
        return this.placedStateName ?? this.name;
    }

    /**
     * The block's numeric id.
     *
     * @deprecated Blocks have no numeric id any more. Zero is what every
     *   block answers; use {@link Block.getName}.
     */
    public getId(): number {
        return 0;
    }

    /**
     * The block's meta value.
     *
     * @deprecated Block state lives in {@link Block.states} now. Zero is what
     *   every block answers.
     */
    public getMeta(): number {
        return 0;
    }

    /** The id the client resolves the block's item form by. */
    public getNetworkId(): number {
        return this.networkId ?? 0;
    }

    /** The Bedrock tags attached to this block state, or an empty list when it has no type. */
    public getTags(): readonly string[] {
        return this.content?.blocks.types.get(this.name)?.state(this.states).tags ?? [];
    }

    /** Whether this block state carries one of its Bedrock tags. */
    public hasTag(tag: string): boolean {
        return this.content?.blocks.types.get(this.name)?.state(this.states).hasTag(tag) ?? false;
    }

    /** Java's destroy time in seconds; `-1` marks the unbreakable blocks. */
    public getHardness(): number {
        return this.facts.hardness;
    }

    /**
     * How long, in seconds, the block takes to break.
     *
     * Hardness on its own is not that time. Vanilla scales it by whether the
     * tool in hand can actually harvest the block - 1.5x when it can, 5x when
     * it cannot, which is why dirt takes 0.75s by hand and stone 7.5s - and
     * then divides by how fast the tool mines. Those two factors are Java's
     * `destroyProgress` written the other way up: `speed / hardness / 30` for
     * a correct tool and `/ 100` for anything else, in progress per tick.
     *
     * The divisor is what Efficiency moves: the enchantment is an `add_value`
     * on `minecraft:mining_efficiency`, which Java adds to the tool's speed.
     *
     * @param item - What is in hand, or null for a bare fist.
     */
    public getBreakTime(item: Item | null, _server?: unknown): number {
        const hardness = this.getHardness();
        // Negative hardness is Java's marker for the unbreakable blocks:
        // bedrock, barriers, portals. They never give way.
        if (hardness < 0) return Number.POSITIVE_INFINITY;

        const scale = this.isCompatibleWithTool(item) ? 1.5 : 5;
        const speed = Math.max(1, item?.getMiningSpeed(this.getName()) ?? 1);

        return (hardness * scale) / speed;
    }

    /** Java's explosion resistance. */
    public getBlastResistance(): number {
        return this.facts.blastResistance;
    }

    /** The light the block emits, 0 to 15. */
    public getLightLevel(): number {
        return this.facts.lightEmission;
    }

    /** How much light the block swallows, 0 to 15. */
    public getLightFilter(): number {
        return this.facts.lightFilter;
    }

    /** Fire's odds of consuming the block once lit. */
    public getFlammability(): number {
        return this.facts.burnOdds;
    }

    /** Ground friction, which decides how far a player slides across the block. */
    public getFriction(): number {
        return this.facts.friction;
    }

    /** Whether anything can stand on the block. */
    public isSolid(): boolean {
        return this.facts.solid;
    }

    /**
     * Whether the block gives way to a placement rather than blocking it.
     *
     * The resolved state's `minecraft:replaceable` component or tag answers for short grass, leaf
     * litter, water, and other blocks a placement goes into instead of on top of. The client makes
     * the same call when it predicts a placement, so a server that answered no for leaf litter put
     * the block above it while the client showed it in the litter's place.
     *
     * The tag names Java blocks, so the state goes through `@jsprismarine/mapping` first: Bedrock's
     * `snow_layer` is Java's `snow` and its `deadbush` is Java's `dead_bush`. A block built without
     * content has no tags to read, and only air gives way.
     *
     * Snow is in the tag at every depth, but Java's snow layer block overrides it: only a single
     * layer gives way to a placed block. Not yet measured against BDS.
     */
    public canBeReplaced(): boolean {
        if (this.name === 'minecraft:air') return true;

        const content = this.content;
        if (content === undefined) return false;
        const { tags } = content;

        const exact = bedrockBlockStateToJava(this.getStateName(), this.states);
        if (exact.kind === 'mapped' && exact.java.name === 'minecraft:snow')
            return exact.java.properties.layers === '1';

        const state = content.blocks.types.get(this.name)?.state(this.states);
        if (state?.content.params(replaceable) !== undefined) return true;
        if (tags.includes('block', 'minecraft:replaceable', this.name)) return true;

        const javaBlocks = exact.kind === 'mapped' ? [exact.java.name] : bedrockBlockToJava(this.getStateName());
        return javaBlocks.some((javaBlock) => tags.includes('block', REPLACEABLE_TAG, javaBlock));
    }

    /** Whether the block can be placed at all. */
    public canBePlaced(): boolean {
        return this.name !== 'minecraft:air';
    }

    /** Whether mining ever removes the block. */
    public isBreakable(): boolean {
        return this.facts.hardness >= 0;
    }

    /**
     * Whether what is in hand harvests the block rather than destroying it
     * for nothing.
     *
     * Java's rule in one line: a block without `requires_correct_tool` yields
     * to anything, including a bare fist, and one with it yields only to a
     * tool whose `minecraft:tool` rules say the block is correct for drops.
     *
     * A server with no content build answers yes either way. Those rules name
     * their blocks by tag - `#minecraft:mineable/pickaxe`,
     * `#minecraft:incorrect_for_stone_tool` - and the merged tag set only
     * exists once a pack stack is loaded, so without one no tool could ever
     * read as the right one and nothing needing a tool would drop at all.
     *
     * @param item - What is in hand, or null for a bare fist.
     */
    public isCompatibleWithTool(item: Item | null): boolean {
        if (!this.facts.requiresCorrectTool) return true;
        if (!this.content) return true;
        return item?.harvests(this.getStateName()) ?? false;
    }

    /**
     * What the block yields when it breaks, from Java's loot table for it.
     *
     * Silk touch, fortune, the shears branches and gravel's one-in-ten flint
     * are all in the table rather than here, so this is a roll rather than a
     * decision tree. A server with no content build has no tables to roll and
     * yields the block itself, which is what it did before the tables landed.
     *
     * @param item - What broke it, which the table's predicates read.
     * @param server - The server, for its content and its source of chance.
     */
    public getDrops(item: Item | null, server?: BlockDropServer): Array<Block | Item | null> {
        const content = this.content ?? server?.getContent?.();
        if (!content) return this.isCompatibleWithTool(item) ? [this] : [];

        const world = server?.getWorldManager?.().getDefaultWorld();
        const rolled = rollBlockDrops(
            content,
            { identifier: this.getStateName(), states: this.states },
            { tool: item?.asPredicateStack(), level: world && lootLevelOf(world) }
        );

        return rolled.map((drop) => new Item({ name: drop.identifier, count: drop.count, content }));
    }

    /** Whether the creative menu shows the block. */
    public isPartOfCreativeInventory(): boolean {
        return this.canBePlaced();
    }
}

/** Resolves a block from loaded content, falling back to the shipped schema when no type was loaded. */
export const blockFromContent = (
    name: string,
    content: ServerContent | undefined,
    states: Readonly<Record<string, BlockStateValue>> = {}
): Block | null => {
    if (content === undefined) {
        return BlockStateSchemas.get(name) === null ? null : new Block({ name, states });
    }

    const type: BlockType | undefined = content.blocks.types.get(name);
    if (type === undefined) return null;

    const state = type.state(states);
    const id = state.runtimeId;
    const table = content.blocks.table;
    const facts: BlockFacts = {
        ...javaBlockFactsOf(type.identifier, states),
        hardness: table.hardness[id]!,
        blastResistance: table.blastResistance[id]!,
        lightEmission: table.lightEmission[id]!,
        lightFilter: table.lightFilter[id]!,
        friction: table.friction[id]!,
        solid: table.solid[id] === 1,
        requiresCorrectTool: state.content.params(blockProperties)?.requiresCorrectTool ?? false
    };

    return new Block({ name, states, facts, content });
};

/** What {@link Block.getDrops} reads off the server: its content and its worlds. */
export interface BlockDropServer {
    getContent?(): ServerContent | undefined;
    /**
     * The worlds, for the level view the loot conditions read.
     *
     * The default one, because a `Block` carries no dimension of its own.
     * The clock is the only member of that view two dimensions could
     * disagree about, and Bedrock keeps one time for all of them, so the
     * answer is the right one until a break can say where it happened.
     */
    getWorldManager?(): { getDefaultWorld(): LootLevelWorld | undefined };
}
