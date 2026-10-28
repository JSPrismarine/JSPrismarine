/**
 * The light engine, the tick scheduler and the engine systems, driven from one world tick.
 *
 * All three are published packages with no idea a chunk exists. This is the one place that
 * owns them: it builds the light view out of the world's blocks, dispatches scheduled ticks
 * through resolved content hooks before the engine fallback, hands the chunk sections a random
 * tick may land in to the engine, and keeps all three inside a budget so no single tick can stall
 * on a light flood or a backlog of fluid ticks.
 */
import type { BlockPosition, LightFlushResult } from '@jsprismarine/lighting';
import { LightEngine } from '@jsprismarine/lighting';
import type { BlockLightProperties, BlockLightView } from '@jsprismarine/lighting';
import type { Engine, EngineOptions, ScheduledTick, SectionOrigin, TickKind } from '@jsprismarine/engine-systems';
import type { WorldAccess } from '@jsprismarine/engine-systems';
import {
    DEFAULT_RANDOM_TICK_SPEED,
    SECTION_SIZE,
    TickScheduler,
    BlockRandomPositions,
    createEngine
} from '@jsprismarine/engine-systems';
import { bedrockBlockPropertiesOf } from '@jsprismarine/mapping';

import { maxY, minSubChunk, subChunkCount } from './Dimension';
import type { DimensionDefinition } from './Dimension';
import type { ContentRedstoneUpdateHandlers } from './redstoneUpdates';

/** A block as the systems read one: the identifier and its Bedrock state values. */
export interface SystemBlock {
    readonly name: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
}

/**
 * How many queue nodes one world tick may spend on light.
 *
 * A torch placed in the open queues a few hundred nodes and a chunk load queues tens of
 * thousands. 4096 keeps the worst case under a millisecond and lets the rest of the flood
 * finish on the ticks that follow; {@link WorldSystemsReport.light} says when it has.
 */
export const LIGHT_BUDGET_PER_TICK = 4096;

/**
 * How many scheduled ticks one world tick may run, per list.
 *
 * Java's limit is 65536 for each of the block and fluid lists. Bedrock's is 100 per chunk,
 * which this server does not implement; the Java number is the one the package defaults to and
 * the one the diode and fluid timings were transcribed against.
 */
export const SCHEDULED_TICK_BUDGET_PER_TICK = 65536;

/** What one world tick's systems pass did. */
export interface WorldSystemsReport {
    /** How many scheduled block and fluid ticks ran. */
    readonly scheduled: number;
    /** How many random tick positions landed on a block that takes them. */
    readonly randomTicked: number;
    /** What the light engine got through, and what it still owes. */
    readonly light: LightFlushResult;
}

/** One chunk a random tick visits, and the sub chunk indices worth drawing from. */
export interface RandomTickChunk {
    readonly x: number;
    readonly z: number;
    /** Sub chunk indices, as the dimension numbers them: the Overworld runs -4 to 19. */
    readonly sections: Iterable<number>;
}

/** What {@link WorldSystems} reads out of the world it serves. */
export interface WorldSystemsView {
    readonly dimension: DimensionDefinition;
    /** The block at a world position, or undefined when its chunk is not loaded. */
    blockAt(x: number, y: number, z: number): SystemBlock | undefined;
    /**
     * The runtime id at a world position, which names the same block {@link blockAt} answers
     * with and nothing else.
     *
     * The light pass reads two numbers per block and asks tens of millions of times while a
     * world preloads. With this it resolves a block's identifier and state values once per
     * distinct id and reads the rest out of a table; without it, it asks {@link blockAt} and
     * goes through the property table by name and state values for every single read. Left out
     * by every test double, which take the second path.
     */
    blockRuntimeIdAt?(x: number, y: number, z: number): number | undefined;
    /**
     * One past the highest y a column stores a block for, as
     * {@link import('@jsprismarine/lighting').BlockLightView.topOfColumn} defines it.
     *
     * Left out, a fresh chunk's light scan reads every block from the dimension ceiling down,
     * which in an Overworld is mostly open sky.
     */
    topOfColumn?(x: number, z: number): number;
    /** The chunk coordinates the world holds in memory, which is what the light pass crosses. */
    loadedChunks(): Iterable<{ readonly x: number; readonly z: number }>;
    /** `random_tick_speed`, which is draws per section rather than a rate. */
    randomTickSpeed?(): number;
    /**
     * Where this tick's random draws land: Java's "a player ticket holds this chunk, and this
     * section of it holds something". Left out, every section of every loaded chunk is drawn
     * for, which is what this did before the world could answer.
     */
    randomTickChunks?(): Iterable<RandomTickChunk>;
}

/**
 * The engine's world, minus the scheduling it does not own.
 *
 * `@jsprismarine/engine-systems` reads and writes everything through one `WorldAccess`,
 * scheduling included. The three scheduling members are left out here because
 * {@link WorldSystems} already holds the tick lists the world tick drains, so it fills them
 * from {@link WorldSystems.ticks} rather than asking the world for a second scheduler to
 * keep in step with the first.
 */
export type WorldSystemsAccess = Omit<WorldAccess, 'scheduleTick' | 'hasScheduledTick' | 'willTickThisTick'>;

/** What a world gives {@link WorldSystems} to run on. */
export interface WorldSystemsOptions extends Pick<EngineOptions, 'randomTickHandlers' | 'canSpreadFireAround'> {
    /** The reads the light pass and the random tick draw need, which a chunk answers. */
    readonly view: WorldSystemsView;
    /** Everything the engine fallback does to the world. */
    readonly world: WorldSystemsAccess;
    /** Resolved content handlers for scheduled block ticks; unhandled ticks fall back to the engine. */
    readonly blockTickHandlers?: Readonly<Record<string, (at: BlockPosition) => boolean>>;
    /** Content redstone hooks and their power cache lifecycle. */
    readonly redstoneUpdateHandlers?: ContentRedstoneUpdateHandlers;
}

/** The two numbers the light engine reads, for a block this server's mapping table knows. */
const lightPropertiesOf = (block: SystemBlock): BlockLightProperties | undefined => {
    const properties = bedrockBlockPropertiesOf(block.name, block.states);
    if (properties === undefined) return undefined;

    return { lightEmission: properties.lightEmission, lightDampening: properties.lightDampening };
};

/** Air, which is what an unmapped block looks like to light rather than an opaque wall. */
const TRANSPARENT: BlockLightProperties = { lightEmission: 0, lightDampening: 0 };

/**
 * The light engine, the scheduler and the engine systems for one dimension.
 *
 * A world builds one, reports its block changes and chunk loads to it, and calls
 * {@link WorldSystems.tick} once per world tick.
 */
export class WorldSystems {
    /**
     * The two scheduled tick lists.
     *
     * The engine schedules into them through its own world, and the content adapter's
     * `ticks` group writes into them directly.
     */
    public readonly ticks = new TickScheduler();

    /** The server's own light, which no packet carries; see `@jsprismarine/lighting`. */
    public readonly lighting: LightEngine;

    /** Redstone, fluid flow, fire spread and the random tick driver. */
    private readonly engine: Engine;

    private readonly view: WorldSystemsView;

    private readonly blockTickHandlers: WorldSystemsOptions['blockTickHandlers'];

    private readonly redstoneUpdateHandlers: WorldSystemsOptions['redstoneUpdateHandlers'];

    private readonly randomPositions = new BlockRandomPositions();

    /** What each runtime id this world has read does to light - see {@link lightPropertiesAt}. */
    private readonly lightByRuntimeId = new Map<number, BlockLightProperties>();

    public constructor(options: WorldSystemsOptions) {
        this.view = options.view;
        this.blockTickHandlers = options.blockTickHandlers;
        this.redstoneUpdateHandlers = options.redstoneUpdateHandlers;
        this.lighting = new LightEngine(this.lightView());
        this.engine = createEngine(
            {
                ...options.world,
                // Java schedules by delay and the list stores the absolute tick, so the
                // conversion happens here rather than in every system that schedules.
                scheduleTick: (kind, at, type, delay, priority) => {
                    this.ticks.list(kind).schedule(at, type, options.world.getGameTime() + delay, priority);
                },
                hasScheduledTick: (kind, at, type) => this.ticks.list(kind).hasScheduledTick(at, type),
                willTickThisTick: (kind, at, type) => this.ticks.list(kind).willTickThisTick(at, type)
            },
            {
                randomTickHandlers: options.randomTickHandlers,
                canSpreadFireAround: options.canSpreadFireAround,
                onRedstoneUpdate: options.redstoneUpdateHandlers?.dispatch
            }
        );
    }

    /**
     * Runs every update a block change causes: the neighbor updates, the extra updates a
     * signal source or a new fluid raises, and the shape updates around the position.
     *
     * Java's `Level.setBlockAndUpdate` with the write already done. A world calls it after
     * writing a block, which is what starts a circuit when a lever goes down and what gives
     * a placed bucket of water its first fluid tick. The engine writes the block again on the
     * way through, which costs a palette read and changes nothing, because the block it would
     * write is the one standing there.
     */
    public updateAround(at: BlockPosition, block: SystemBlock): void {
        this.engine.setBlockAndUpdate(at, { name: block.name, states: block.states });
    }

    /** Computes a newly loaded chunk's light and re-seeds across its neighbors' borders. */
    public onChunkLoaded(chunkX: number, chunkZ: number): void {
        this.lighting.onChunkLoaded(chunkX, chunkZ);
    }

    /** Drops a chunk's light. The neighbors keep what it gave them until something changes. */
    public onChunkUnloaded(chunkX: number, chunkZ: number): void {
        this.lighting.onChunkUnloaded(chunkX, chunkZ);
        this.redstoneUpdateHandlers?.forgetChunk(chunkX, chunkZ);
    }

    /**
     * Reports one block change.
     *
     * @param previous - What stood there, which the decrease wave needs; an unmapped block
     *   reads as air rather than as a wall, so removing one cannot darken a lit room.
     */
    public onBlockChanged(at: BlockPosition, previous: SystemBlock, next: SystemBlock): void {
        if (previous.name !== next.name) this.redstoneUpdateHandlers?.forgetPosition(at);
        this.lighting.onBlockChanged(
            at,
            lightPropertiesOf(previous) ?? TRANSPARENT,
            lightPropertiesOf(next) ?? TRANSPARENT
        );
    }

    /**
     * Runs one world tick's systems: scheduled ticks, then random ticks, then light.
     *
     * The order is `ServerLevel.tick`'s: block ticks before fluid ticks, both before the chunk
     * tick that draws the random positions. Light goes last because every write above may have
     * queued some.
     */
    public tick(currentTick: number): WorldSystemsReport {
        const scheduled = this.ticks.tick(
            currentTick,
            (kind: TickKind, tick: ScheduledTick) => {
                const contentHandler = this.blockTickHandlers?.[tick.type];
                if (contentHandler !== undefined) {
                    if (kind === 'block' && contentHandler(tick.at)) return;
                    if (kind === 'fluid') {
                        // A liquid family uses the block hook's scheduler. If both the
                        // engine fluid list and that block list queued the same tick, the
                        // earlier block pass already advanced it.
                        if (this.ticks.list('block').hasScheduledTick(tick.at, tick.type)) return;
                        if (contentHandler(tick.at)) return;
                    }
                }
                this.engine.runScheduledTick(kind, tick.at, tick.type);
            },
            SCHEDULED_TICK_BUDGET_PER_TICK
        );

        return {
            scheduled,
            randomTicked: this.runRandomTicks(),
            light: this.lighting.flush(LIGHT_BUDGET_PER_TICK)
        };
    }

    /**
     * Hands the sections a random tick may land in to the engine's driver.
     *
     * Java's `ServerLevel.tickChunks` decides the same thing twice over, and both halves
     * matter more than they look. It visits only the chunks a player ticket holds, so an
     * empty server simulates nothing however much of the world is in memory; and inside
     * those it draws only for sections whose palette holds something that takes random ticks,
     * so the hundreds of blocks of air above the ground cost nothing. A world that drew for
     * every section of every loaded chunk spent its whole tick budget on 441 chunks of air
     * with nobody online.
     *
     * The driver still draws before it filters within a section, which is also Java: a
     * section of nothing but stone consumes its draws, so the sequence does not depend on
     * what that section holds. One chunk at a time rather than all of them at once, because
     * the draw state is shared across the world and the order it is stepped in is part of the
     * result.
     */
    private runRandomTicks(): number {
        const speed = this.view.randomTickSpeed?.() ?? DEFAULT_RANDOM_TICK_SPEED;
        if (speed <= 0) return 0;

        let ticked = 0;
        for (const chunk of this.randomTickChunks()) {
            const sections: SectionOrigin[] = [];
            for (const section of chunk.sections) {
                sections.push({ x: chunk.x * SECTION_SIZE, y: section * SECTION_SIZE, z: chunk.z * SECTION_SIZE });
            }
            if (sections.length === 0) continue;

            ticked += this.engine.runRandomTicks(this.randomPositions, sections, speed);
        }

        return ticked;
    }

    /**
     * The chunks and sections one tick's random draws visit.
     *
     * The world answers when it can. A view that has not supplied {@link
     * WorldSystemsView.randomTickChunks} - which every test double predates - falls back to
     * every section of every loaded chunk, the behavior this had before, so nothing silently
     * stops ticking.
     */
    private randomTickChunks(): Iterable<RandomTickChunk> {
        const answered = this.view.randomTickChunks?.();
        if (answered !== undefined) return answered;

        const floor = minSubChunk(this.view.dimension);
        const sections = Array.from({ length: subChunkCount(this.view.dimension) }, (_unused, at) => floor + at);
        return Array.from(this.view.loadedChunks(), ({ x, z }) => ({ x, z, sections }));
    }

    private lightView(): BlockLightView {
        const dimension = this.view.dimension;

        return {
            minY: dimension.minY,
            // One past the highest block y, which is how the light engine bounds its columns.
            maxY: maxY(dimension) + 1,
            hasSkyLight: dimension.id === 0,
            blockAt: (x, y, z) => this.lightPropertiesAt(x, y, z),
            topOfColumn: (x, z) => this.view.topOfColumn?.(x, z) ?? maxY(dimension) + 1
        };
    }

    /**
     * The two numbers the light engine reads, memoised per runtime id.
     *
     * A runtime id is a hash of the block's own identifier and state values, so it names one
     * block for the life of the process and what that block does to light cannot change under
     * the memo. Resolving it to a `BlockState` and then through
     * `@jsprismarine/mapping`'s property table - which matches state overrides by splitting
     * their keys and merges the row it finds - costs two allocations and a string walk, and the
     * light pass asks tens of millions of times while a world preloads.
     *
     * A view with no {@link WorldSystemsView.blockRuntimeIdAt} resolves every read the long way,
     * which is what this did for all of them.
     */
    private lightPropertiesAt(x: number, y: number, z: number): BlockLightProperties | undefined {
        const runtimeId = this.view.blockRuntimeIdAt?.(x, y, z);
        if (runtimeId !== undefined) {
            const known = this.lightByRuntimeId.get(runtimeId);
            if (known !== undefined) return known;
        }

        const block = this.view.blockAt(x, y, z);
        if (block === undefined) return undefined;

        const properties = lightPropertiesOf(block) ?? TRANSPARENT;
        if (runtimeId !== undefined) this.lightByRuntimeId.set(runtimeId, properties);

        return properties;
    }
}
