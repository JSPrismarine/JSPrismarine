/**
 * The light engine and the tick scheduler, driven from one world tick.
 *
 * Both are published packages with no idea a chunk exists. This is the one place that owns
 * them: it builds the light view out of the world's blocks, drains the two scheduled tick
 * lists in Java's order, draws the random tick positions, and keeps all three inside a budget
 * so no single tick can stall on a light flood or a backlog of fluid ticks.
 */
import type { BlockPosition, LightFlushResult } from '@jsprismarine/lighting';
import { LightEngine } from '@jsprismarine/lighting';
import type { BlockLightProperties, BlockLightView } from '@jsprismarine/lighting';
import type { ScheduledTick, TickKind } from '@jsprismarine/engine-systems';
import {
    DEFAULT_RANDOM_TICK_SPEED,
    SECTION_SIZE,
    TickScheduler,
    drawSectionPositions,
    BlockRandomPositions,
    isRandomlyTicking
} from '@jsprismarine/engine-systems';
import { bedrockBlockPropertiesOf } from '@jsprismarine/mapping';

import { maxY, minSubChunk, subChunkCount } from './Dimension';
import type { DimensionDefinition } from './Dimension';

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

/** What {@link WorldSystems} reads out of the world it serves. */
export interface WorldSystemsView {
    readonly dimension: DimensionDefinition;
    /** The block at a world position, or undefined when its chunk is not loaded. */
    blockAt(x: number, y: number, z: number): SystemBlock | undefined;
    /** The chunk coordinates the world holds in memory, which is what random ticking visits. */
    loadedChunks(): Iterable<{ readonly x: number; readonly z: number }>;
    /** `random_tick_speed`, which is draws per section rather than a rate. */
    randomTickSpeed?(): number;
}

/** What the systems hand back to the world when something comes due. */
export interface WorldSystemsHandlers {
    /** Runs one scheduled block or fluid tick. */
    scheduledTick(kind: TickKind, at: BlockPosition, type: string): void;
    /**
     * Runs one random tick.
     *
     * Optional because choosing the positions is the world's job and acting on them is the
     * block behaviors' job. Until that side is wired the positions are still drawn, so the
     * draw sequence - which decides where crops grow - does not shift when it is.
     */
    randomTick?(at: BlockPosition): void;
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
 * The light engine and the scheduler for one dimension.
 *
 * A world builds one, reports its block changes and chunk loads to it, and calls
 * {@link WorldSystems.tick} once per world tick.
 */
export class WorldSystems {
    /** The two scheduled tick lists, which the content adapter's `ticks` group writes into. */
    public readonly ticks = new TickScheduler();

    /** The server's own light, which no packet carries; see `@jsprismarine/lighting`. */
    public readonly lighting: LightEngine;

    private readonly randomPositions = new BlockRandomPositions();

    public constructor(
        private readonly view: WorldSystemsView,
        private readonly handlers: WorldSystemsHandlers
    ) {
        this.lighting = new LightEngine(this.lightView());
    }

    /** Computes a newly loaded chunk's light and re-seeds across its neighbors' borders. */
    public onChunkLoaded(chunkX: number, chunkZ: number): void {
        this.lighting.onChunkLoaded(chunkX, chunkZ);
    }

    /** Drops a chunk's light. The neighbors keep what it gave them until something changes. */
    public onChunkUnloaded(chunkX: number, chunkZ: number): void {
        this.lighting.onChunkUnloaded(chunkX, chunkZ);
    }

    /**
     * Reports one block change.
     *
     * @param previous - What stood there, which the decrease wave needs; an unmapped block
     *   reads as air rather than as a wall, so removing one cannot darken a lit room.
     */
    public onBlockChanged(at: BlockPosition, previous: SystemBlock, next: SystemBlock): void {
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
            (kind: TickKind, tick: ScheduledTick) => this.handlers.scheduledTick(kind, tick.at, tick.type),
            SCHEDULED_TICK_BUDGET_PER_TICK
        );

        return {
            scheduled,
            randomTicked: this.runRandomTicks(),
            light: this.lighting.flush(LIGHT_BUDGET_PER_TICK)
        };
    }

    /**
     * Draws this tick's random positions for every loaded chunk.
     *
     * The draw happens before the filter, as it does in Java: a section of nothing but stone
     * still consumes its draws, so the sequence does not depend on what the world holds.
     */
    private runRandomTicks(): number {
        const speed = this.view.randomTickSpeed?.() ?? DEFAULT_RANDOM_TICK_SPEED;
        if (speed <= 0) return 0;

        const floor = minSubChunk(this.view.dimension);
        const sections = subChunkCount(this.view.dimension);

        let ticked = 0;
        for (const chunk of this.view.loadedChunks()) {
            for (let section = 0; section < sections; section++) {
                const origin = {
                    x: chunk.x * SECTION_SIZE,
                    y: (floor + section) * SECTION_SIZE,
                    z: chunk.z * SECTION_SIZE
                };

                for (const at of drawSectionPositions(this.randomPositions, origin, speed)) {
                    const block = this.view.blockAt(at.x, at.y, at.z);
                    if (block === undefined || !isRandomlyTicking(block)) continue;

                    ticked++;
                    this.handlers.randomTick?.(at);
                }
            }
        }

        return ticked;
    }

    private lightView(): BlockLightView {
        const dimension = this.view.dimension;

        return {
            minY: dimension.minY,
            // One past the highest block y, which is how the light engine bounds its columns.
            maxY: maxY(dimension) + 1,
            hasSkyLight: dimension.id === 0,
            blockAt: (x, y, z) => {
                const block = this.view.blockAt(x, y, z);
                if (block === undefined) return undefined;

                return lightPropertiesOf(block) ?? TRANSPARENT;
            }
        };
    }
}
