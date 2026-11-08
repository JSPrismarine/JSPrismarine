/**
 * The light engine, the tick scheduler and the engine systems, driven from one world tick.
 *
 * All three are published packages with no idea a chunk exists. This is the one place that
 * owns them: it builds the light view out of the world's blocks, dispatches scheduled block
 * ticks through resolved content hooks, hands the chunk sections a random tick may land in to
 * the engine, and keeps all three inside a budget so no single tick can stall on a light flood
 * or a backlog of fluid ticks.
 */
import type { BlockPosition, LightFlushResult, LightSectionHint } from '@jsprismarine/lighting';
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
import { isLiquid } from '@jsprismarine/block-behaviors';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';

import { maxY, minSubChunk, subChunkCount } from './Dimension';
import type { DimensionType } from './Dimension';
import type { ContentRedstoneUpdateHandlers } from './redstoneUpdates';

/** A block as the systems read one: the identifier and its Bedrock state values. */
export interface SystemBlock {
    readonly name: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
    /** The palette id for block changes whose caller already read it from the chunk. */
    readonly runtimeId?: number;
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
 * which this server does not implement; the Java number is the one the package defaults to.
 */
export const SCHEDULED_TICK_BUDGET_PER_TICK = 65536;

/**
 * How long one world tick may spend running scheduled ticks before it leaves the rest for the next.
 *
 * Java has only the count above. This server also has hosts that run a tick of 20,000 leaf decay
 * checks in two seconds, long enough that every connected client times out, so the clock bounds
 * what the count does not.
 */
export const SCHEDULED_TICK_TIME_BUDGET_MS = 25;

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

/** A chunk section's runtime-id palette and the revision that owns it. */
export interface LightSectionPalette {
    readonly revision: number;
    readonly runtimeIds: Iterable<number>;
}

/** What {@link WorldSystems} reads out of the world it serves. */
export interface WorldSystemsView {
    readonly dimension: DimensionType;
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
    /** The chunk coordinates held in memory, used by fallbacks and world-wide reads. */
    loadedChunks(): Iterable<{ readonly x: number; readonly z: number }>;
    /**
     * Chunks whose simulation distance and guard ring currently require lighting.
     *
     * A view that returns the same object across calls promises the set has not changed in
     * between; one that changes the set returns a new object.
     */
    lightChunks?(): Iterable<{ readonly x: number; readonly z: number }>;
    /** Whether a newly loaded chunk should be initialized for light immediately. */
    shouldInitializeLight?(chunkX: number, chunkZ: number): boolean;
    /** The block-layer palette in a section, for revision-keyed light scan hints. */
    lightSectionAt?(chunkX: number, sectionY: number, chunkZ: number): LightSectionPalette | undefined;
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
 * The world reads and writes the engine systems use.
 *
 * `@jsprismarine/engine-systems` reads and writes through one `WorldAccess`. Tick scheduling
 * belongs to {@link WorldSystems.ticks} and the content adapter.
 */
export type WorldSystemsAccess = WorldAccess;

/** What a world gives {@link WorldSystems} to run on. */
export interface WorldSystemsOptions extends Pick<EngineOptions, 'randomTickHandlers'> {
    /** The reads the light pass and the random tick draw need, which a chunk answers. */
    readonly view: WorldSystemsView;
    /** The world reads and writes the engine systems need. */
    readonly world: WorldSystemsAccess;
    /** Resolved content handlers for scheduled block ticks. */
    readonly blockTickHandlers?: Readonly<Record<string, (at: BlockPosition) => void>>;
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
     * The content adapter's `ticks` group writes into them directly.
     */
    public readonly ticks = new TickScheduler();

    /** The server's own light, which no packet carries; see `@jsprismarine/lighting`. */
    public readonly lighting: LightEngine;

    /** Redstone and the random tick driver. */
    private readonly engine: Engine;

    private readonly view: WorldSystemsView;

    private readonly blockTickHandlers: WorldSystemsOptions['blockTickHandlers'];

    private readonly redstoneUpdateHandlers: WorldSystemsOptions['redstoneUpdateHandlers'];

    private readonly randomPositions = new BlockRandomPositions();

    /** The active light columns, separate from chunks which are merely loaded in memory. */
    private readonly litChunks = new Map<string, { readonly x: number; readonly z: number }>();

    /** What each runtime id this world has read does to light - see {@link lightPropertiesAt}. */
    private readonly lightByRuntimeId = new Map<number, BlockLightProperties>();
    /** Per chunk section facts, replaced whenever that section's palette revision changes. */
    /** The list the last {@link prepareLighting} pass found fully lit, while it is still the current one. */
    private litLightChunks: Iterable<{ readonly x: number; readonly z: number }> | undefined;
    private readonly lightHintsByChunk = new Map<string, Map<number, { revision: number; hint: LightSectionHint }>>();

    public constructor(options: WorldSystemsOptions) {
        this.view = options.view;
        this.blockTickHandlers = options.blockTickHandlers;
        this.redstoneUpdateHandlers = options.redstoneUpdateHandlers;
        this.lighting = new LightEngine(this.lightView());
        this.engine = createEngine(options.world, {
            randomTickHandlers: options.randomTickHandlers,
            onRedstoneUpdate: options.redstoneUpdateHandlers?.dispatch,
            shouldComputeRedstoneUpdate: options.redstoneUpdateHandlers?.shouldDispatch
        });
    }

    /**
     * Runs the six neighbor updates a block change causes and reports resulting power to
     * data-driven redstone hooks.
     *
     * A world calls it after writing a block, so this path does not write the block again.
     */
    public updateAround(at: BlockPosition, block: SystemBlock): void {
        this.engine.updateAround(at, block.name);
    }

    /** Computes a newly loaded in-ring chunk's light and re-seeds its neighbors' borders. */
    public onChunkLoaded(chunkX: number, chunkZ: number): void {
        if (!(this.view.shouldInitializeLight?.(chunkX, chunkZ) ?? true)) return;

        this.lighting.onChunkLoaded(chunkX, chunkZ);
        this.litChunks.set(this.lightChunkKey(chunkX, chunkZ), { x: chunkX, z: chunkZ });
    }

    /** Initializes newly relevant chunks before a world tick can run light-dependent simulation. */
    public prepareLighting(): void {
        const lightChunks = this.view.lightChunks?.();
        if (lightChunks === undefined) return;
        // The view hands back the same list while nothing has loaded, unloaded or moved, and the
        // pass that saw it lit every chunk in it.
        if (lightChunks === this.litLightChunks) return;

        const required = new Map<string, { readonly x: number; readonly z: number }>();
        for (const chunk of lightChunks) required.set(this.lightChunkKey(chunk.x, chunk.z), chunk);

        // Chunks left behind as a player moves no longer need resident light; returning chunks
        // are rebuilt and border-seeded when they re-enter the ring.
        for (const [key, chunk] of this.litChunks) {
            if (required.has(key)) continue;
            this.lighting.onChunkUnloaded(chunk.x, chunk.z);
            this.litChunks.delete(key);
        }

        let allLit = true;
        for (const { x, z } of required.values()) {
            this.initializeLightChunk(x, z);
            if (!this.lighting.hasChunk(x, z)) allLit = false;
        }
        this.litLightChunks = allLit ? lightChunks : undefined;
    }

    /** Whether all active light propagation has settled enough for simulation reads. */
    public get isLightingSettled(): boolean {
        return this.lighting.pending.queued === 0;
    }

    /** Reads Java's shared random tick position state without drawing another position. */
    public getRandomTickState(): number {
        return this.randomPositions.snapshot();
    }

    /** Restores Java's world-wide random tick draw counter at a replay boundary. */
    public restoreRandomTickState(state: number): void {
        this.randomPositions.restore(state);
    }

    /** Reads block light, initializing and settling an otherwise deferred loaded chunk on demand. */
    public getBlockLight(x: number, y: number, z: number): number {
        this.ensureLightForRead(x, y, z);
        return this.lighting.getBlockLight(x, y, z);
    }

    /** Reads sky light, initializing and settling an otherwise deferred loaded chunk on demand. */
    public getSkyLight(x: number, y: number, z: number): number {
        this.ensureLightForRead(x, y, z);
        return this.lighting.getSkyLight(x, y, z);
    }

    /** Drops a chunk's light. The neighbors keep what it gave them until something changes. */
    public onChunkUnloaded(chunkX: number, chunkZ: number): void {
        this.lighting.onChunkUnloaded(chunkX, chunkZ);
        this.litChunks.delete(this.lightChunkKey(chunkX, chunkZ));
        // A different chunk at these coordinates may start with the same revision.
        this.lightHintsByChunk.delete(this.lightChunkKey(chunkX, chunkZ));
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
        this.lighting.onBlockChanged(at, this.lightPropertiesFor(previous), this.lightPropertiesFor(next));
    }

    /** Resolves changed-block light once per runtime id, sharing the light scan's memo. */
    private lightPropertiesFor(block: SystemBlock): BlockLightProperties {
        const runtimeId = block.runtimeId;
        if (runtimeId !== undefined) {
            const known = this.lightByRuntimeId.get(runtimeId);
            if (known !== undefined) return known;
        }

        const properties = lightPropertiesOf(block) ?? TRANSPARENT;
        if (runtimeId !== undefined) this.lightByRuntimeId.set(runtimeId, properties);
        return properties;
    }

    /**
     * Advances one world tick, then spends this tick's light budget.
     *
     * Scheduled and random ticks do not wait for the light flood to settle. It is budgeted over
     * later ticks and can be thousands of ticks long after a join, and Java does not freeze a
     * world's block updates for light either; a reader that needs a settled value goes through
     * {@link WorldSystems.getSkyLight} or {@link WorldSystems.getBlockLight}, which settle the
     * chunk it reads on demand.
     */
    public tick(currentTick: number): WorldSystemsReport {
        this.prepareLighting();

        const scheduled = this.ticks.tick(
            currentTick,
            (kind: TickKind, tick: ScheduledTick) => {
                const activeBlock = kind === 'fluid' ? this.view.blockAt(tick.at.x, tick.at.y, tick.at.z) : undefined;
                const activeFluidType =
                    activeBlock !== undefined && isLiquid(activeBlock.name) ? activeBlock.name : undefined;
                const contentType = activeFluidType ?? tick.type;
                const contentHandler = this.blockTickHandlers?.[contentType];
                if (kind === 'fluid') {
                    // The block list runs first. If both lists contain a tick for the
                    // same active liquid, that earlier pass already advanced it. Resolve
                    // by the current block because queued ticks can name a previous
                    // source or flowing state.
                    if (this.ticks.list('block').hasScheduledTick(tick.at, contentType)) return;
                    contentHandler?.(tick.at);
                    return;
                }
                contentHandler?.(tick.at);
            },
            SCHEDULED_TICK_BUDGET_PER_TICK,
            performance.now() + SCHEDULED_TICK_TIME_BUDGET_MS
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
            hasSkyLight: dimension.java.hasSkylight,
            blockAt: (x, y, z) => this.lightPropertiesAt(x, y, z),
            sectionHintAt: (chunkX, sectionY, chunkZ) => this.lightSectionHintAt(chunkX, sectionY, chunkZ),
            topOfColumn: (x, z) => this.view.topOfColumn?.(x, z) ?? maxY(dimension) + 1
        };
    }

    private lightSectionHintAt(chunkX: number, sectionY: number, chunkZ: number): LightSectionHint | undefined {
        const palette = this.view.lightSectionAt?.(chunkX, sectionY, chunkZ);
        if (palette === undefined) return undefined;

        const chunkKey = `${chunkX},${chunkZ}`;
        let hints = this.lightHintsByChunk.get(chunkKey);
        const previous = hints?.get(sectionY);
        if (previous?.revision === palette.revision) return previous.hint;

        let mayEmit = false;
        let allTransparent = true;
        for (const runtimeId of palette.runtimeIds) {
            const properties = this.lightPropertiesForRuntimeId(runtimeId);
            if (properties.lightEmission > 0) mayEmit = true;
            if (properties.lightDampening > 0) allTransparent = false;
            if (mayEmit && !allTransparent) break;
        }

        hints ??= new Map();
        hints.set(sectionY, { revision: palette.revision, hint: { mayEmit, allTransparent } });
        this.lightHintsByChunk.set(chunkKey, hints);
        return hints.get(sectionY)!.hint;
    }

    private lightPropertiesForRuntimeId(runtimeId: number): BlockLightProperties {
        const cached = this.lightByRuntimeId.get(runtimeId);
        if (cached !== undefined) return cached;

        const state = BlockRuntimeIds.getState(runtimeId);
        const properties =
            state === null
                ? TRANSPARENT
                : (lightPropertiesOf({ name: state.name, states: state.properties }) ?? TRANSPARENT);
        this.lightByRuntimeId.set(runtimeId, properties);
        return properties;
    }

    private ensureLightForRead(x: number, y: number, z: number): void {
        if (!this.lighting.hasChunk(x >> 4, z >> 4)) {
            if (this.view.blockAt(x, y, z) === undefined) return;
            this.initializeLightChunk(x >> 4, z >> 4);
        }

        // A chunk the ring already initialized can still have its flood queued behind the
        // per-tick budget, and a read of it would see too little light: cows refused to spawn
        // for as long as the flood ran. Finishing the queue here is the work the following ticks
        // would have done anyway, and costs nothing once it is empty.
        if (this.lighting.pending.queued > 0) this.lighting.flush();
    }

    private initializeLightChunk(chunkX: number, chunkZ: number): void {
        if (this.lighting.hasChunk(chunkX, chunkZ)) return;
        this.lighting.onChunkLoaded(chunkX, chunkZ);
        this.litChunks.set(this.lightChunkKey(chunkX, chunkZ), { x: chunkX, z: chunkZ });
    }

    private lightChunkKey(chunkX: number, chunkZ: number): string {
        return `${chunkX},${chunkZ}`;
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
