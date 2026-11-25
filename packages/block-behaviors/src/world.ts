/**
 * The world interface every behavior family is written against.
 *
 * A block behavior reads and writes blocks, drops items, moves entities,
 * plays sounds, schedules ticks and asks about redstone power. Those are the
 * only ways a block touches the world, so they are the whole of this
 * interface. The server implements it over its own chunk storage and entity
 * manager; the tests implement it over a map of positions. Neither side is
 * visible from the other, which is how this package stays free of the
 * server's classes.
 */
import type {
    BlockFace,
    BlockPlacementContext,
    BlockPosition,
    BlockStateValue,
    HookActor,
    HookBlock,
    LiquidReaction
} from '@jsprismarine/blocks';
import { blockProperties } from '@jsprismarine/blocks';
import { BlockBehaviorsErrors } from '@jsprismarine/errors/block-behaviors';

/** The state values a behavior writes when it places or rewrites a block. */
export type BlockStates = Readonly<Record<string, BlockStateValue>>;

/** Java tick priorities used when one block's scheduled change must precede another's. */
export type BlockTickPriority = 'extremely_high' | 'very_high' | 'high' | 'normal';

/**
 * An item stack leaving a block, as a drop, an ejection or a container's contents.
 *
 * Everything past the identifier and the count is per-stack state rather than a fact about the
 * item type, and every field is optional because most stacks carry none of it. They are here
 * because this is also the shape a container's slots are in: an identifier and a count alone
 * meant a player who put an enchanted pickaxe in a chest got a plain one back.
 */
export interface ItemDrop {
    /** The namespaced item identifier, such as `minecraft:wheat_seeds`. */
    readonly identifier: string;
    readonly count: number;
    /** The aux value, which is Bedrock's top-level `Damage` and a potion's variant. */
    readonly meta?: number;
    /**
     * Durability spent, which is Java's `minecraft:damage` and Bedrock's `tag.Damage`.
     *
     * Spent rather than remaining, so a stack of an item whose maximum durability changed
     * between versions comes back damaged by the same amount rather than by a different
     * fraction of a different total.
     */
    readonly damage?: number;
    /** The name an anvil gave the stack, which replaces the item's own. */
    readonly customName?: string;
    readonly lore?: readonly string[];
    /** Namespaced Java enchantment id to level, which is `minecraft:enchantments`. */
    readonly enchantments?: Readonly<Record<string, number>>;
    /**
     * What a container item holds, one entry per slot and `undefined` for an empty one.
     *
     * Java's `minecraft:container`, which is what a shulker box carries its inventory in
     * between being broken and being placed again.
     */
    readonly contents?: readonly (ItemDrop | undefined)[];
    /** The Bedrock block identifiers the stack may be placed on in adventure mode. */
    readonly canPlaceOn?: readonly string[];
    /** The Bedrock block identifiers the stack may break in adventure mode. */
    readonly canDestroy?: readonly string[];
    /** Whether the stack stays with its owner when they die, Bedrock's `minecraft:keep_on_death`. */
    readonly keepOnDeath?: boolean;
    /** Where the stack is locked, Bedrock's `minecraft:item_lock`: in its slot or in the inventory. */
    readonly lockMode?: 'slot' | 'inventory';
    /** The script dynamic properties set on the stack, by pack UUID and then by property id. */
    readonly dynamicProperties?: ItemDynamicProperties;
    /** Which saved map a filled map shows: Java's `minecraft:map_id` and Bedrock's `map_uuid`. */
    readonly mapId?: number;
}

/** A script dynamic property's value: a number, a boolean, a string or a vector. */
export type ItemDynamicPropertyValue =
    number | boolean | string | { readonly x: number; readonly y: number; readonly z: number };

/** A stack's script dynamic properties, by pack UUID and then by property id, in the order they were set. */
export type ItemDynamicProperties = Readonly<Record<string, Readonly<Record<string, ItemDynamicPropertyValue>>>>;

/**
 * What a block entity stores.
 *
 * Bedrock block entities have no shared schema, so the fields the behaviors
 * agree on are named here and anything else travels under the index
 * signature. A container's `items` is sparse on purpose: an empty slot is
 * `undefined`, which is what the comparator fill-level formula counts.
 */
export interface BlockEntityData {
    /** One entry per slot, `undefined` for an empty one. */
    readonly items?: readonly (ItemDrop | undefined)[];
    /** How many slots the container has, which the comparator divides by. */
    readonly capacity?: number;
    /** A sign's lines, a lectern's book title, a jukebox's record. */
    readonly text?: readonly string[];
    /** True once wax or a similar seal makes the block entity read-only. */
    readonly sealed?: boolean;
    /** Bedrock's piston-arm state, stored as native `PistonArm` block-entity tags. */
    readonly pistonArm?: {
        /** Current extension progress, 0 when retracted and 1 when extended. */
        readonly progress: number;
        /** Previous extension progress, 0 when retracted and 1 when extended. */
        readonly lastProgress: number;
        /** Bedrock piston state used to draw the arm. */
        readonly state: number;
        /** Bedrock piston state the arm is moving toward. */
        readonly newState: number;
        /** Whether the piston is sticky. */
        readonly sticky: boolean;
    };
    readonly [field: string]: unknown;
}

/**
 * An entity a behavior found in the world.
 *
 * {@link HookActor} is what a hook event carries and has no identity, so this
 * adds the id {@link WorldActions.removeEntity} takes.
 */
export interface WorldEntity extends HookActor {
    readonly id: number;
}

/**
 * The per-state facts the overlay's `jsprismarine:block_properties`
 * component carries, derived from the component factory that declares them so
 * the field names and the `push_reaction` domain have one source.
 */
export type BlockProperties = Parameters<typeof blockProperties.create>[0];

/** The chance modifiers a resolved `minecraft:flammable` component carries. */
export interface BlockFlammability {
    /** Fire's odds of catching the block alight. */
    readonly igniteOdds: number;
    /** Fire's odds of consuming the block after it catches. */
    readonly burnOdds: number;
}

/** Whether the sky and weather report rain, thunder or clear. */
export type WorldWeather = 'clear' | 'rain' | 'thunder';

/** The four vanilla difficulty levels in increasing order, which is also Java's difficulty id order. */
export const WORLD_DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;

/** One of {@link WORLD_DIFFICULTIES}. */
export type WorldDifficulty = (typeof WORLD_DIFFICULTIES)[number];

/** Java's numeric id for a difficulty, 0 for peaceful through 3 for hard. */
export const difficultyIdOf = (difficulty: WorldDifficulty): number => WORLD_DIFFICULTIES.indexOf(difficulty);

/** Options for removing a block without asking the family to guess its drops. */
export interface BlockDestroyOptions {
    /** Whether to roll the block's own loot, defaulting to true. */
    readonly drops?: boolean;
}

/** One of the four values `jsprismarine:block_properties.push_reaction` takes. */
export type PushReaction = BlockProperties['pushReaction'];

/** The values a block with no `jsprismarine:block_properties` component reads as. */
export const DEFAULT_BLOCK_PROPERTIES: BlockProperties = (() => {
    const parsed = blockProperties.schema({});
    if (!parsed.ok) throw new BlockBehaviorsErrors.BlockPropertiesDefaultsRejected({ message: parsed.message });
    return parsed.value;
})();

/**
 * A redstone component acting, as a host's scripts hear it: a piston moving, a lever flipped, a
 * button pressed, and a pressure plate's signal changing. `source` is the runtime id of the
 * entity that did it, when one did.
 */
export type RedstoneActivation =
    | { readonly kind: 'piston'; readonly position: BlockPosition; readonly extending: boolean }
    | { readonly kind: 'lever'; readonly position: BlockPosition; readonly powered: boolean; readonly source?: string }
    | { readonly kind: 'button'; readonly position: BlockPosition; readonly source?: string }
    | {
          readonly kind: 'pressurePlate';
          readonly position: BlockPosition;
          readonly power: number;
          readonly previousPower: number;
          readonly source?: string;
      };

/** What one command a command block ran reported back. */
export interface CommandRun {
    /** Java's success count: how many times the command succeeded, 0 when it failed or did nothing. */
    readonly successCount: number;
    /** The last line the command answered with, which the block keeps as its last output. */
    readonly output: string;
}

/**
 * Everything a block does to the world, for one dimension.
 *
 * Every position is in world coordinates and in this instance's dimension.
 * A behavior never crosses dimensions through one instance; it asks
 * {@link BlockWorld.at} for the other one.
 */
export interface WorldActions {
    /**
     * Tells the host a redstone component acted, after the change is written. A host without it
     * hears nothing.
     */
    redstoneActivated?(activation: RedstoneActivation): void;
    /** The block at a position, or undefined when the position is not loaded. */
    getBlock(position: BlockPosition): HookBlock | undefined;
    /**
     * The liquid a position holds besides its block, which is how Bedrock keeps a waterlogged
     * block's water: in the position's second storage layer. Undefined when there is none, or when
     * the host keeps one layer only.
     */
    getLiquid?(position: BlockPosition): HookBlock | undefined;
    /**
     * Puts a liquid in a position's second storage layer, beside its block, or takes it away for
     * `minecraft:air`. Neighbors are not notified; the caller does that.
     */
    setLiquid?(position: BlockPosition, identifier: string, states?: BlockStates): void;
    /**
     * Whether a block holds water beside itself rather than giving way to it, Java's
     * `LiquidBlockContainer`: a block with a `waterlogged` property, kelp or seagrass. A water
     * source that spreads into one waterlogs it. A host without it, or without
     * {@link setLiquid}, has fluids treat every block by its liquid reaction alone.
     */
    holdsWater?(block: HookBlock): boolean;
    /**
     * Replaces the block at a position.
     *
     * @param states - The whole state record, not a patch. Absent means the
     *   block's default state.
     * @param notifyNeighbors - Whether to run block behavior and engine neighbor updates.
     * @param placement - Player and hit details for a placement that raises `onPlace`.
     */
    setBlock(
        position: BlockPosition,
        identifier: string,
        states?: BlockStates,
        notifyNeighbors?: boolean,
        placement?: BlockPlacementContext
    ): void;
    /** Moves a block and its block entity without running placement hooks. */
    moveBlock?(from: BlockPosition, to: BlockPosition): void;
    /** The `jsprismarine:block_properties` of a block type, defaults included. */
    propertiesOf(identifier: string): BlockProperties;
    /** The block state's vanilla `minecraft:light_dampening` value, when the host can report it. */
    lightDampeningOf?(block: HookBlock): number;
    /** The resolved block state's `minecraft:flammable` odds, when content exposes them. */
    flammabilityOf?(block: HookBlock): BlockFlammability | undefined;
    /**
     * Whether the block belongs to a Java block tag such as `minecraft:infiniburn_overworld`.
     *
     * @returns Undefined when the loaded stack declares no such tag, which is not the same
     *   answer as `false`: a rule whose tag nobody loaded has to fall back to its own names
     *   rather than read every block as being outside it.
     */
    hasBlockTag?(block: HookBlock, tag: string): boolean | undefined;
    /**
     * What flowing water or lava does to the block: dams against it, washes it away with its drop,
     * destroys it outright, or shares its cell. A host answers by the rule its server is set to
     * follow; without one, Bedrock's own `liquidReactionOnTouch` data decides.
     *
     * @returns Undefined when the host cannot say, which falls back to the Bedrock data as well.
     */
    liquidReactionOf?(block: HookBlock): LiquidReaction | undefined;
    /** Whether this block has a sturdy top face, when the host can report its collision shape. */
    hasSturdyTopFace?(block: HookBlock): boolean;
    /** Whether this block fills its cell with a full cube collision shape. */
    isFullCube?(block: HookBlock): boolean;
    /**
     * Whether two neighboring blocks' collision shapes together close the face between them, Java's
     * `Shapes.mergedFaceOccludes`, which decides where a fluid may pass. `face` is the side of
     * `block` that `neighbor` is on. A host without it lets a fluid pass any pair of blocks
     * neither of which is a full cube.
     */
    faceOccludes?(block: HookBlock, neighbor: HookBlock, face: BlockFace): boolean;
    /** Whether infinite sources form for a fluid kind; defaults to vanilla game-rule values. */
    fluidSourceConversion?(kind: 'water' | 'lava'): boolean;
    /** Drops an item stack as an entity at a position. */
    dropItem(position: BlockPosition, drop: ItemDrop): void;
    /**
     * Takes a block out of the world the way the world itself does: its own `onBreak` runs
     * and Java's loot table decides what falls.
     *
     * A family calls this rather than dropping one of the block, because one of the block
     * is a guess. Deepslate yields cobbled deepslate, a lapis block yields lapis, and a
     * block the table gives nothing for yields nothing.
     *
     * The write is still the caller's, and it has to come afterwards: a family reads the
     * block entity it is about to lose, which is what spills a chest a piston popped.
     *
     * Left out by a world with no loot behind it, such as the test voxel world, which
     * sends the caller back to the drop it would have made on its own.
     *
     * @param position - The block to destroy.
     * @param options - Whether the block's own loot is rolled. Defaults to true.
     * @returns True when the world took the drops, so the caller owes nothing more for them.
     */
    destroyBlock?(position: BlockPosition, options?: BlockDestroyOptions): boolean;
    /**
     * Spawns an entity.
     *
     * @param data - The entity's own data, such as the block a falling block
     *   entity carries.
     * @returns The id {@link WorldActions.removeEntity} takes.
     */
    spawnEntity(position: BlockPosition, identifier: string, data?: BlockEntityData): number;
    /** Removes an entity by the id {@link WorldActions.spawnEntity} returned. */
    removeEntity(entity: number): void;
    /** Every entity whose position is inside the block at a position. */
    entitiesAt(position: BlockPosition): readonly WorldEntity[];
    /**
     * Moves an entity by an offset, as a piston carries one in front of the blocks it pushes.
     * Absent on a world that cannot move its entities, where a push leaves them standing.
     */
    moveEntity?(entity: number, by: BlockPosition): void;
    /** Plays a sound event, such as `block.door.open`. */
    playSound(position: BlockPosition, sound: string): void;
    /**
     * Tells the living entities around a bell that it rang, Java's `BellBlockEntity.onHit`.
     *
     * @javaSee BellBlockEntity.onHit
     */
    ringBell?(position: BlockPosition): void;
    /** Emits a particle effect, such as `minecraft:crop_growth_emitter`. */
    spawnParticle(position: BlockPosition, particle: string): void;
    /**
     * Asks for `onTick` at a position after a delay.
     *
     * @param delay - Game ticks from now, at least 1.
     * @param kind - Whether the tick belongs to the block or fluid list; defaults to `block`.
     * @param priority - The scheduled tick's ordering priority; defaults to `normal`.
     */
    scheduleTick(position: BlockPosition, delay: number, kind?: 'block' | 'fluid', priority?: BlockTickPriority): void;
    /** Whether this block's scheduled tick is due in the batch currently running. */
    willTickThisTick?(position: BlockPosition): boolean;
    /** A random integer in `[0, bound)`, using the host's world random when available. */
    randomInt?(bound: number): number;
    /** A random float in `[0, 1)`, using the host's world random when available. */
    randomFloat?(): number;
    /** The current world difficulty, which controls fire spread odds. */
    difficulty?(): WorldDifficulty;
    /** The current weather. */
    weather?(): WorldWeather;
    /** Whether rain reaches this position. */
    isRainingAt?(position: BlockPosition): boolean;
    /** Whether fire may spread around this position under the current world rule. */
    canFireSpreadAround?(position: BlockPosition): boolean;
    /** Whether this position has the humid biome attribute that increases fire burnout. */
    increasedFireBurnout?(position: BlockPosition): boolean;
    /** A block entity's data, or undefined when the position has none. */
    getBlockData(position: BlockPosition): BlockEntityData | undefined;
    /** Replaces a block entity's data whole. */
    setBlockData(position: BlockPosition, data: BlockEntityData): void;
    /**
     * Runs a command as a command block at a position does, Java's `BaseCommandBlock.performCommand`:
     * from the middle of the block, as the block's name, and with operator permission.
     *
     * @javaSee BaseCommandBlock.performCommand
     * @param name - Who the command runs as in its feedback, the block's custom name or `@`.
     * @returns What it reported, or undefined where command blocks do not run, such as a world
     *   whose host has no command layer or a level that turned them off.
     */
    runCommand?(position: BlockPosition, command: string, name: string): CommandRun | undefined;
    /** Tells the six neighbors of a position that it changed. */
    notifyNeighbors(position: BlockPosition): void;
    /** The redstone power reaching a position, 0 to 15. */
    redstonePower(position: BlockPosition): number;
    /** The signal from a block, where direction points from the receiver to this source. */
    redstoneSignal?(position: BlockPosition, directionToSource: BlockFace): number;
    /** The strong signal from a block, where direction points from the receiver to this source. */
    redstoneDirectSignal?(position: BlockPosition, directionToSource: BlockFace): number;
    /** Whether a block carries redstone power through its direct signal. */
    redstoneConductor?(position: BlockPosition): boolean;
    /** The light level at a position, 0 to 15, as the growth and melt rules read it. */
    lightLevel(position: BlockPosition): number;
    /**
     * A number in [0, 1).
     *
     * Chance lives on the interface rather than in the families so a test can
     * drive a probabilistic rule to either outcome without patching globals.
     */
    random(): number;
}

/**
 * The dimensions a behavior can reach.
 *
 * A behavior resolves the event block's dimension once per event, so a
 * portal can look at the other side without every other family paying for a
 * dimension argument.
 */
export interface BlockWorld {
    /**
     * The actions for one world.
     *
     * @param dimension - The namespaced dimension, such as `minecraft:overworld`.
     * @param level - The level's name, from the event's block; left out for the default level.
     */
    at(dimension: string, level?: string): WorldActions;
}

/** Presents one {@link WorldActions} as a {@link BlockWorld} with a single dimension. */
export const singleDimensionWorld = (actions: WorldActions): BlockWorld => ({ at: () => actions });
