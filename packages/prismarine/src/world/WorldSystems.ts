/**
 * The light engine, the tick scheduler and the engine systems, driven from one world tick.
 *
 * All three are published packages with no idea a chunk exists. This is the one place that
 * owns them: it builds the light view out of the world's blocks, dispatches scheduled block
 * ticks through resolved content hooks, hands the chunk sections a random tick may land in to
 * the engine, and keeps all three inside count budgets, so a light flood or a backlog of fluid
 * ticks spreads over the ticks that follow. No budget reads the clock.
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

import Chunk from './chunk/Chunk';
import { maxY, minSubChunk, subChunkCount } from './Dimension';
import type { DimensionType } from './DimensionType';
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
 * A torch placed in the open queues a few hundred nodes, and a chunk of broken terrain floods a
 * few thousand when it is first lit. A chunk is not simulated until its first light is done
 * ({@link WorldSystems.isLightReady}), so this number is also how soon the world around a player
 * who just joined starts to move: at 16384 the chunks next to the player are ready within a few
 * ticks and a whole light ring of broken terrain within about a hundred. The rest of a flood
 * finishes on the ticks that follow; {@link WorldSystemsReport.light} says when it has.
 */
export const LIGHT_BUDGET_PER_TICK = 16384;

/**
 * How many chunks one world tick takes into the light model.
 *
 * Taking a chunk in reads each of its 256 block columns down to the ground and queues the sources
 * it finds. A player who joins, teleports or changes dimension puts a whole light ring of loaded
 * chunks in front of this at once, and taking them all in was the longest thing a tick did. Eight
 * a tick still queues more light in broken terrain than {@link LIGHT_BUDGET_PER_TICK} floods, so a
 * higher number finishes no chunk sooner there. A read that cannot wait takes in the chunks it
 * needs itself; see {@link WorldSystems.getSkyLight}.
 */
export const LIGHT_CHUNKS_PER_TICK = 8;

/**
 * How many scheduled ticks one world tick may run, per list.
 *
 * Java's limit is 65536 for each of the block and fluid lists. Bedrock's is 100 per chunk,
 * which this server does not implement; the Java number is the one the package defaults to.
 *
 * It is the only bound. A host too slow to run the batch in a tick's period ticks slower, as
 * Java does, and runs the same ticks a fast host runs, so a replay agrees on both.
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
     * {@link BlockLightView.topOfColumn} defines it.
     *
     * Left out, a fresh chunk's light scan reads every block from the dimension ceiling down,
     * which in an Overworld is mostly open sky.
     */
    topOfColumn?(x: number, z: number): number;
    /** The chunk coordinates held in memory, used by fallbacks and world-wide reads. */
    loadedChunks(): Iterable<{ readonly x: number; readonly z: number }>;
    /**
     * Whether the fluid ticks of a chunk may run now. One that may not keeps its due ticks queued
     * until it may, as Java's `LevelTicks` does for a chunk that is not ticking, so water at the
     * edge of the loaded area waits for the next chunk rather than stopping for good. A view
     * without it runs every due fluid tick.
     */
    canTickFluids?(chunkX: number, chunkZ: number): boolean;
    /**
     * Chunks whose simulation distance and guard ring currently require lighting, in the order
     * they should be lit: {@link LIGHT_CHUNKS_PER_TICK} of them are taken in each tick, from the
     * front.
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

    /** True while {@link tick} runs; see {@link isRunning}. */
    private running = false;

    /** The position of the scheduled tick running now; see {@link activeTickPosition}. */
    private activeTick: BlockPosition | undefined;

    /** The active light columns, separate from chunks which are merely loaded in memory. */
    private readonly litChunks = new Map<number, { readonly x: number; readonly z: number }>();

    /** What each runtime id this world has read does to light - see {@link lightPropertiesAt}. */
    private readonly lightByRuntimeId = new Map<number, BlockLightProperties>();
    /** Per chunk section facts, replaced whenever that section's palette revision changes. */
    /** The list the light passes found fully lit and ready, while it is still the current one. */
    private litLightChunks: Iterable<{ readonly x: number; readonly z: number }> | undefined;
    /** The list {@link unlitChunks} and {@link unreadyChunks} were last built from. */
    private requiredLightChunks: Iterable<{ readonly x: number; readonly z: number }> | undefined;
    /** Chunks the light ring requires that are not in the light model yet, in the order to take them in. */
    private readonly unlitChunks = new Map<number, { readonly x: number; readonly z: number }>();
    /** Chunks the light ring requires whose first light has not finished, in the order to finish them. */
    private readonly unreadyChunks = new Map<number, { readonly x: number; readonly z: number }>();
    /** Chunks whose first light has finished; see {@link isLightReady}. */
    /** Section corners by the section list a chunk handed out; see {@link sectionOriginsOf}. */
    private readonly sectionOrigins = new WeakMap<
        Iterable<number>,
        { readonly x: number; readonly z: number; readonly origins: readonly SectionOrigin[] }
    >();
    private readonly readyChunks = new Set<number>();
    private readonly lightHintsByChunk = new Map<number, Map<number, { revision: number; hint: LightSectionHint }>>();

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

    /**
     * Takes note of a newly loaded chunk the light ring requires. {@link prepareLighting} computes
     * its light within the tick's budget; a view that lists no light chunks has no such pass, so
     * its chunk is lit here.
     */
    public onChunkLoaded(chunkX: number, chunkZ: number): void {
        if (!(this.view.shouldInitializeLight?.(chunkX, chunkZ) ?? true)) return;

        const key = this.lightChunkKey(chunkX, chunkZ);
        const chunk = { x: chunkX, z: chunkZ };
        // A chunk the model already holds was replaced where it stands, and is computed again.
        if (this.view.lightChunks === undefined || this.lighting.hasChunk(chunkX, chunkZ)) {
            this.lighting.onChunkLoaded(chunkX, chunkZ);
            this.litChunks.set(key, chunk);
            this.readyChunks.delete(key);
            // Its first light runs again, and its neighbors wait for it as they wait for a chunk
            // that has just loaded.
            if (this.view.lightChunks !== undefined) {
                this.unreadyChunks.set(key, chunk);
                this.litLightChunks = undefined;
            }
            return;
        }
        this.unlitChunks.set(key, chunk);
        this.unreadyChunks.set(key, chunk);
        this.litLightChunks = undefined;
    }

    /**
     * Takes up to {@link LIGHT_CHUNKS_PER_TICK} of the chunks the light ring requires into the
     * light model, in the order the view lists them, and drops the light of chunks it no longer
     * lists. {@link tick} calls it once a tick, before anything in the tick reads light.
     */
    public prepareLighting(): void {
        const lightChunks = this.view.lightChunks?.();
        if (lightChunks === undefined) return;
        // The view hands back the same list while nothing has loaded, unloaded or moved, and the
        // passes that saw it finished every chunk in it.
        if (lightChunks === this.litLightChunks) return;
        if (lightChunks !== this.requiredLightChunks) this.requireLight(lightChunks);

        let budget = LIGHT_CHUNKS_PER_TICK;
        for (const [key, { x, z }] of this.unlitChunks) {
            if (budget === 0) break;

            this.unlitChunks.delete(key);
            // A read may have taken it in ahead of this pass.
            if (this.lighting.hasChunk(x, z)) continue;
            this.initializeLightChunk(x, z);
            budget--;
        }
    }

    /** Rebuilds what the light ring requires from a new list, and drops the light of chunks it left out. */
    private requireLight(lightChunks: Iterable<{ readonly x: number; readonly z: number }>): void {
        const required = new Map<number, { readonly x: number; readonly z: number }>();
        for (const chunk of lightChunks) required.set(this.lightChunkKey(chunk.x, chunk.z), chunk);

        // Chunks left behind as a player moves no longer need resident light; returning chunks
        // are rebuilt and border-seeded when they re-enter the ring.
        for (const [key, chunk] of this.litChunks) {
            if (required.has(key)) continue;
            this.lighting.onChunkUnloaded(chunk.x, chunk.z);
            this.litChunks.delete(key);
            this.readyChunks.delete(key);
        }

        this.unlitChunks.clear();
        this.unreadyChunks.clear();
        for (const [key, chunk] of required) {
            if (!this.lighting.hasChunk(chunk.x, chunk.z)) this.unlitChunks.set(key, chunk);
            if (!this.readyChunks.has(key)) this.unreadyChunks.set(key, chunk);
        }
        this.requiredLightChunks = lightChunks;
    }

    /**
     * Spends the tick's light budget: finishes the first light of the chunks the ring requires, in
     * the order the view lists them, and floods whatever else is queued with what is left.
     *
     * A chunk is finished by flooding the nine chunks around it, so the chunks nearest a player
     * become ready first while the rest of the ring is still queued. In queue order every chunk of
     * the ring would finish in the same last ticks, because each one's flood waits behind the
     * sources of every chunk taken in after it.
     */
    private advanceLight(): LightFlushResult {
        let left = LIGHT_BUDGET_PER_TICK;
        for (const [key, { x, z }] of this.unreadyChunks) {
            // The next chunk in line waits for the chunks `prepareLighting` still owes it.
            if (!this.lightTakenInAround(x, z)) break;

            left -= this.lighting.settleAround(x, z, left).processed;
            if (this.lighting.isFloodingAround(x, z)) break;
            this.unreadyChunks.delete(key);
            this.readyChunks.add(key);
            if (left === 0) break;
        }
        if (this.unlitChunks.size === 0 && this.unreadyChunks.size === 0)
            this.litLightChunks = this.requiredLightChunks;

        const rest = this.lighting.flush(left);
        return { ...rest, processed: LIGHT_BUDGET_PER_TICK - left + rest.processed };
    }

    /** Whether a chunk and every neighbor the light ring requires are in the light model. */
    private lightTakenInAround(chunkX: number, chunkZ: number): boolean {
        if (!this.lighting.hasChunk(chunkX, chunkZ)) return false;
        if (this.unlitChunks.size === 0) return true;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                // A read may have taken a listed chunk in ahead of the pass.
                if (
                    this.unlitChunks.has(this.lightChunkKey(chunkX + dx, chunkZ + dz)) &&
                    !this.lighting.hasChunk(chunkX + dx, chunkZ + dz)
                )
                    return false;
            }
        }
        return true;
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

    /**
     * Whether a chunk may be simulated: the first light of the chunk and of every neighbor the
     * light ring requires has finished.
     *
     * Java ticks a chunk only once it and its neighbors are loaded and lit. This is the same
     * question asked of a chunk whose light arrives over several ticks, and what its entities, its
     * random ticks and its natural spawns wait for. Each of them reads light in the chunk or one
     * block over its border, and a read of light that is still arriving has to finish it inside
     * the tick.
     *
     * A chunk's first light stays finished. Light a later block change queues floods within the
     * tick's budget and a read near it finishes only that, so a torch or an explosion holds
     * nothing up. A neighbor that has just loaded does, until its own first light is done.
     */
    public isLightReady(chunkX: number, chunkZ: number): boolean {
        if (!this.firstLightDone(chunkX, chunkZ)) return false;
        if (this.unreadyChunks.size === 0) return true;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (
                    this.unreadyChunks.has(this.lightChunkKey(chunkX + dx, chunkZ + dz)) &&
                    !this.firstLightDone(chunkX + dx, chunkZ + dz)
                )
                    return false;
            }
        }
        return true;
    }

    /**
     * Whether a chunk's first light has finished: it and the neighbors the light ring requires
     * were taken into the light model, and the light they queued has flooded. Remembers the
     * answer once it is yes.
     */
    private firstLightDone(chunkX: number, chunkZ: number): boolean {
        const key = this.lightChunkKey(chunkX, chunkZ);
        if (this.readyChunks.has(key)) return true;
        // A view that lists no light chunks has no pass to take one in. The first read of a chunk
        // nobody announced does, so such a chunk waits for nothing.
        if (!this.lighting.hasChunk(chunkX, chunkZ)) return this.view.lightChunks === undefined;
        if (!this.lightTakenInAround(chunkX, chunkZ) || this.lighting.isFloodingAround(chunkX, chunkZ)) return false;

        this.readyChunks.add(key);
        this.unreadyChunks.delete(key);
        return true;
    }

    /**
     * Reads block light. A chunk whose light is not final yet is finished first, as
     * {@link getSkyLight} describes.
     */
    public getBlockLight(x: number, y: number, z: number): number {
        this.ensureLightForRead(x, y, z);
        return this.lighting.getBlockLight(x, y, z);
    }

    /**
     * Reads sky light, and finishes the light of the chunk first when it is not final yet.
     *
     * Finishing takes the chunk and the neighbors the light ring still owes into the light model
     * and floods the light queued in those nine chunks. Light reaches fifteen blocks, so nothing
     * further away can change the answer, and the rest of the queue is left for the tick's budget.
     * The work a read does therefore depends on the nine chunks around it and not on how many
     * chunks a join, a teleport or a move just queued.
     */
    public getSkyLight(x: number, y: number, z: number): number {
        this.ensureLightForRead(x, y, z);
        return this.lighting.getSkyLight(x, y, z);
    }

    /** Drops a chunk's light. The neighbors keep what it gave them until something changes. */
    public onChunkUnloaded(chunkX: number, chunkZ: number): void {
        this.lighting.onChunkUnloaded(chunkX, chunkZ);
        const key = this.lightChunkKey(chunkX, chunkZ);
        this.litChunks.delete(key);
        this.unlitChunks.delete(key);
        this.unreadyChunks.delete(key);
        this.readyChunks.delete(key);
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
        const outer = this.running;
        this.running = true;
        try {
            return this.runTick(currentTick);
        } finally {
            this.running = outer;
        }
    }

    /**
     * Whether {@link tick} is running, so the world can tell its own systems' writes from
     * somebody else's.
     */
    public isRunning(): boolean {
        return this.running === true;
    }

    /**
     * Where the scheduled tick that is running now stands, or undefined between ticks. A write
     * made then is that tick's doing, which is how the world follows a settling chunk's water
     * across a chunk border.
     */
    public activeTickPosition(): BlockPosition | undefined {
        return this.activeTick;
    }

    /** Runs one scheduled tick's handler with its position recorded; see {@link activeTickPosition}. */
    private runAt(at: BlockPosition, handler: ((at: BlockPosition) => void) | undefined): void {
        if (handler === undefined) return;
        const outer = this.activeTick;
        this.activeTick = at;
        try {
            handler(at);
        } finally {
            this.activeTick = outer;
        }
    }

    /** The body of {@link tick}. */
    private runTick(currentTick: number): WorldSystemsReport {
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
                    this.runAt(tick.at, contentHandler);
                    return;
                }
                this.runAt(tick.at, contentHandler);
            },
            SCHEDULED_TICK_BUDGET_PER_TICK,
            (kind, chunkX, chunkZ) => kind !== 'fluid' || (this.view.canTickFluids?.(chunkX, chunkZ) ?? true)
        );

        return {
            scheduled,
            randomTicked: this.runRandomTicks(),
            light: this.advanceLight()
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
            const sections = this.sectionOriginsOf(chunk);
            if (sections.length === 0) continue;

            ticked += this.engine.runRandomTicks(this.randomPositions, sections, speed);
        }

        return ticked;
    }

    /**
     * The corners of a chunk's random tick sections.
     *
     * A chunk hands back the same section list until a block write changes it, so the corners
     * built for that list serve every tick until then, rather than a new object per section per
     * tick.
     */
    private sectionOriginsOf(chunk: RandomTickChunk): readonly SectionOrigin[] {
        const list = chunk.sections;
        const known = typeof list === 'object' ? this.sectionOrigins.get(list) : undefined;
        if (known !== undefined && known.x === chunk.x && known.z === chunk.z) return known.origins;

        const origins: SectionOrigin[] = [];
        for (const section of list) {
            origins.push({ x: chunk.x * SECTION_SIZE, y: section * SECTION_SIZE, z: chunk.z * SECTION_SIZE });
        }
        if (typeof list === 'object') this.sectionOrigins.set(list, { x: chunk.x, z: chunk.z, origins });
        return origins;
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

        const chunkKey = this.lightChunkKey(chunkX, chunkZ);
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
        const chunkX = x >> 4;
        const chunkZ = z >> 4;
        if (!this.lighting.hasChunk(chunkX, chunkZ)) {
            if (this.view.blockAt(x, y, z) === undefined) return;
            this.initializeLightChunk(chunkX, chunkZ);
        }

        // A neighbor the ring requires and the tick's budget has not reached holds sources whose
        // light crosses into this chunk, so the read takes it in now. Asked of the view rather
        // than of the pass's own list, which is a tick old when a player has just arrived.
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const neighborX = chunkX + dx;
                const neighborZ = chunkZ + dz;
                if (this.lighting.hasChunk(neighborX, neighborZ)) continue;
                if (this.view.blockAt(neighborX << 4, y, neighborZ << 4) === undefined) continue;
                if (!(this.view.shouldInitializeLight?.(neighborX, neighborZ) ?? true)) continue;
                this.initializeLightChunk(neighborX, neighborZ);
            }
        }

        // A read of a flood still queued behind the per-tick budget would see too little light:
        // cows refused to spawn for as long as the flood ran. Only the nine chunks that can reach
        // the read are finished. Flushing the whole queue here ran every chunk a join had just
        // queued, over a million nodes, inside the tick of the first mob that checked for daylight.
        if (!this.lighting.isSettledAround(chunkX, chunkZ)) this.lighting.settleAround(chunkX, chunkZ);
    }

    private initializeLightChunk(chunkX: number, chunkZ: number): void {
        if (this.lighting.hasChunk(chunkX, chunkZ)) return;
        this.lighting.onChunkLoaded(chunkX, chunkZ);
        this.litChunks.set(this.lightChunkKey(chunkX, chunkZ), { x: chunkX, z: chunkZ });
    }

    /**
     * A chunk's key in the light bookkeeping. A number, as the world keys its loaded chunks: the
     * readiness of every simulated chunk and its neighbors is asked each tick, and a string key
     * was built and hashed for every one of those questions.
     */
    private lightChunkKey(chunkX: number, chunkZ: number): number {
        return Chunk.packXZ(chunkX, chunkZ);
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
