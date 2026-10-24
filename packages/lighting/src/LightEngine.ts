import type { BlockLightProperties, BlockLightView } from './BlockLightView';
import { CHUNK_SIZE, chunkOf, columnKeyOf } from './coordinates';
import { LightQueue } from './LightQueue';
import { LightSection, MAX_LIGHT_LEVEL } from './LightSection';

/** A world block position. */
export interface BlockPosition {
    /** World x. */
    readonly x: number;
    /** World y. */
    readonly y: number;
    /** World z. */
    readonly z: number;
}

/** How much light work is outstanding. */
export interface LightQueueDepth {
    /** Nodes waiting in the increase and decrease queues. Zero means the light has settled. */
    readonly queued: number;
    /**
     * Chunk columns that propagation reached and could not enter because they are not loaded. Their
     * light is computed when {@link LightEngine.onChunkLoaded} announces them.
     */
    readonly deferred: number;
}

/** What one {@link LightEngine.flush} call did and what is left. */
export interface LightFlushResult extends LightQueueDepth {
    /** Nodes taken off a queue during the call, never more than the budget. */
    readonly processed: number;
}

interface LightColumn {
    readonly blockSections: Map<number, LightSection>;
}

const OFFSET_X = [-1, 1, 0, 0, 0, 0] as const;
const OFFSET_Y = [0, 0, -1, 1, 0, 0] as const;
const OFFSET_Z = [0, 0, 0, 0, -1, 1] as const;

/**
 * The server's internal light model: a block light layer that floods out of emitters, kept current
 * as blocks change and advanced in bounded steps so a tick cannot stall.
 *
 * These levels never reach a player. The Bedrock protocol has no light packet and neither
 * `LevelChunkPacket` nor `SubChunkPacket` carries light arrays, so the connected client computes
 * and renders light itself from the block palette it already has. The server keeps its own copy for
 * the three rules that read it: mob spawning, crop growth, and daylight detectors. Where the two
 * models disagree, the player sees the client's answer and the server acts on this one.
 *
 * Java's directional opacity, which lets a slab, a stair or a piston pass light in some directions
 * and not others, is deliberately not implemented. Bedrock's block data expresses one
 * `minecraft:light_dampening` scalar per state with no direction, the Bedrock client applies that
 * scalar, and a server that modeled Java's per-face rule would compute light the client contradicts
 * for every slab and stair in the world.
 *
 * The engine reads the world through an injected {@link BlockLightView} and holds no reference to
 * chunk, block or world classes. The server has to announce a chunk with
 * {@link LightEngine.onChunkLoaded} before the engine stores light in it.
 */
export class LightEngine {
    private readonly columns = new Map<number, LightColumn>();
    private readonly blockIncrease = new LightQueue();
    private readonly blockDecrease = new LightQueue();
    private readonly awaitingChunks = new Set<number>();

    public constructor(private readonly view: BlockLightView) {}

    /** The work the engine still has to do. {@link LightEngine.flush} returns the same numbers. */
    public get pending(): LightQueueDepth {
        return { queued: this.queuedNodes, deferred: this.awaitingChunks.size };
    }

    /**
     * The block light at a world position, 0 to 15.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @returns {number} The level, or 0 for a position in a column the engine has not been told
     * about. Check that the chunk is loaded before reading a 0 as darkness.
     */
    public getBlockLight(x: number, y: number, z: number): number {
        const column = this.columnAt(x, z);

        return column === undefined ? 0 : this.readBlockLight(column, x, y, z);
    }

    /**
     * Takes a chunk into the light model and computes its light from scratch: every emitter in the
     * column becomes a source, and the border light of each loaded neighbor is re-seeded so light
     * that stopped at the chunk's edge while it was absent flows in.
     *
     * Calling this for a chunk the engine already holds discards that chunk's stored light and
     * computes it again, which is how a caller forces a full recompute.
     * @param {number} chunkX - The chunk x.
     * @param {number} chunkZ - The chunk z.
     */
    public onChunkLoaded(chunkX: number, chunkZ: number): void {
        const key = columnKeyOf(chunkX, chunkZ);
        this.awaitingChunks.delete(key);

        const column: LightColumn = { blockSections: new Map() };
        this.columns.set(key, column);

        const baseX = chunkX * CHUNK_SIZE;
        const baseZ = chunkZ * CHUNK_SIZE;
        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                this.seedColumn(column, baseX + localX, baseZ + localZ);
            }
        }

        this.seedNeighborBorders(chunkX, chunkZ);
    }

    /**
     * Drops a chunk's stored light. Light in the neighbors that came from this chunk is left as it
     * is; it is recomputed when the chunk comes back, because {@link LightEngine.onChunkLoaded}
     * re-seeds across the border.
     * @param {number} chunkX - The chunk x.
     * @param {number} chunkZ - The chunk z.
     */
    public onChunkUnloaded(chunkX: number, chunkZ: number): void {
        this.columns.delete(columnKeyOf(chunkX, chunkZ));
    }

    /**
     * Queues the smallest piece of work that makes the light correct again after one block changed.
     * Nothing is computed here; {@link LightEngine.flush} does the computing.
     *
     * A change that alters neither emission nor dampening queues nothing, so a server can call this
     * for every block change without filtering first.
     * @param {BlockPosition} position - Where the block changed.
     * @param {BlockLightProperties} oldState - The light properties of the block that was there.
     * @param {BlockLightProperties} newState - The light properties of the block that is there now.
     */
    public onBlockChanged(
        position: BlockPosition,
        oldState: BlockLightProperties,
        newState: BlockLightProperties
    ): void {
        const { x, y, z } = position;
        if (y < this.view.minY || y >= this.view.maxY) return;
        if (oldState.lightEmission === newState.lightEmission && oldState.lightDampening === newState.lightDampening) {
            return;
        }

        const column = this.columnAt(x, z);
        if (column === undefined) return;

        const previous = this.readBlockLight(column, x, y, z);
        const emission = Math.min(newState.lightEmission, MAX_LIGHT_LEVEL);
        this.writeBlockLight(column, x, y, z, emission);

        if (previous > emission) this.blockDecrease.push(x, y, z, previous);
        if (emission > 0) this.blockIncrease.push(x, y, z);
        this.pushNeighbors(this.blockIncrease, x, y, z);
    }

    /**
     * Advances the light by at most `budget` queue nodes and reports what is left, so a tick can
     * spend a fixed amount of time on light and decide from the result whether to come back.
     *
     * Every decrease node runs before any increase node, which is what makes a removed light source
     * darken its neighborhood before the surviving sources fill it in again. Stopping mid-flush
     * leaves the light part way through that sequence: levels are readable but not yet correct, and
     * they become correct once `queued` reaches 0.
     * @param {number} [budget] - The most nodes to process. Unbounded when omitted.
     * @returns {LightFlushResult} The work done and the work left.
     * @throws {RangeError} When the budget is negative or not a number.
     */
    public flush(budget: number = Number.POSITIVE_INFINITY): LightFlushResult {
        if (Number.isNaN(budget) || budget < 0) {
            throw new RangeError(`Light flush budget ${budget} is not a count of nodes`);
        }

        let processed = 0;
        while (processed < budget) {
            if (this.blockDecrease.size > 0) this.stepBlockDecrease();
            else if (this.blockIncrease.size > 0) this.stepBlockIncrease();
            else break;

            processed++;
        }

        return { processed, queued: this.queuedNodes, deferred: this.awaitingChunks.size };
    }

    private get queuedNodes(): number {
        return this.blockDecrease.size + this.blockIncrease.size;
    }

    private columnAt(x: number, z: number): LightColumn | undefined {
        return this.columns.get(columnKeyOf(chunkOf(x), chunkOf(z)));
    }

    private readBlockLight(column: LightColumn, x: number, y: number, z: number): number {
        const section = column.blockSections.get(y >> 4);

        return section === undefined ? 0 : section.get(x & 15, y & 15, z & 15);
    }

    private writeBlockLight(column: LightColumn, x: number, y: number, z: number, level: number): void {
        const sectionY = y >> 4;
        let section = column.blockSections.get(sectionY);
        if (section === undefined) {
            if (level === 0) return;
            section = new LightSection();
            column.blockSections.set(sectionY, section);
        }

        section.set(x & 15, y & 15, z & 15, level);
    }

    private seedColumn(column: LightColumn, x: number, z: number): void {
        for (let y = this.view.minY; y < this.view.maxY; y++) {
            const block = this.view.blockAt(x, y, z);
            if (block === undefined || block.lightEmission <= 0) continue;

            const emission = Math.min(block.lightEmission, MAX_LIGHT_LEVEL);
            this.writeBlockLight(column, x, y, z, emission);
            this.blockIncrease.push(x, y, z);
        }
    }

    private seedNeighborBorders(chunkX: number, chunkZ: number): void {
        const baseX = chunkX * CHUNK_SIZE;
        const baseZ = chunkZ * CHUNK_SIZE;
        const last = CHUNK_SIZE - 1;

        this.seedBorderPlane(baseX - 1, baseX - 1, baseZ, baseZ + last);
        this.seedBorderPlane(baseX + CHUNK_SIZE, baseX + CHUNK_SIZE, baseZ, baseZ + last);
        this.seedBorderPlane(baseX, baseX + last, baseZ - 1, baseZ - 1);
        this.seedBorderPlane(baseX, baseX + last, baseZ + CHUNK_SIZE, baseZ + CHUNK_SIZE);
    }

    private seedBorderPlane(fromX: number, toX: number, fromZ: number, toZ: number): void {
        const column = this.columnAt(fromX, fromZ);
        if (column === undefined) return;

        for (let x = fromX; x <= toX; x++) {
            for (let z = fromZ; z <= toZ; z++) {
                for (let y = this.view.minY; y < this.view.maxY; y++) {
                    if (this.readBlockLight(column, x, y, z) > 1) this.blockIncrease.push(x, y, z);
                }
            }
        }
    }

    private pushNeighbors(queue: LightQueue, x: number, y: number, z: number): void {
        for (let direction = 0; direction < 6; direction++) {
            const neighborY = y + OFFSET_Y[direction]!;
            if (neighborY < this.view.minY || neighborY >= this.view.maxY) continue;

            queue.push(x + OFFSET_X[direction]!, neighborY, z + OFFSET_Z[direction]!);
        }
    }

    private stepBlockIncrease(): void {
        const node = this.blockIncrease.shift();
        if (node === undefined) return;

        const { x, y, z } = node;
        const column = this.columnAt(x, z);
        if (column === undefined) return;

        const level = this.readBlockLight(column, x, y, z);
        if (level <= 1) return;

        for (let direction = 0; direction < 6; direction++) {
            const neighborX = x + OFFSET_X[direction]!;
            const neighborY = y + OFFSET_Y[direction]!;
            const neighborZ = z + OFFSET_Z[direction]!;
            const block = this.neighborBlock(neighborX, neighborY, neighborZ);
            if (block === undefined) continue;

            const target = level - Math.max(1, block.lightDampening);
            if (target <= 0) continue;

            const neighborColumn = this.columnAt(neighborX, neighborZ)!;
            if (this.readBlockLight(neighborColumn, neighborX, neighborY, neighborZ) >= target) continue;

            this.writeBlockLight(neighborColumn, neighborX, neighborY, neighborZ, target);
            this.blockIncrease.push(neighborX, neighborY, neighborZ);
        }
    }

    private stepBlockDecrease(): void {
        const node = this.blockDecrease.shift();
        if (node === undefined) return;

        const { x, y, z, level: removed } = node;
        for (let direction = 0; direction < 6; direction++) {
            const neighborX = x + OFFSET_X[direction]!;
            const neighborY = y + OFFSET_Y[direction]!;
            const neighborZ = z + OFFSET_Z[direction]!;
            const block = this.neighborBlock(neighborX, neighborY, neighborZ);
            if (block === undefined) continue;

            const neighborColumn = this.columnAt(neighborX, neighborZ)!;
            const neighborLevel = this.readBlockLight(neighborColumn, neighborX, neighborY, neighborZ);
            if (neighborLevel === 0) continue;

            if (neighborLevel >= removed) {
                this.blockIncrease.push(neighborX, neighborY, neighborZ);
                continue;
            }

            const emission = Math.min(block.lightEmission, MAX_LIGHT_LEVEL);
            this.writeBlockLight(neighborColumn, neighborX, neighborY, neighborZ, emission);
            this.blockDecrease.push(neighborX, neighborY, neighborZ, neighborLevel);
            if (emission > 0) this.blockIncrease.push(neighborX, neighborY, neighborZ);
        }
    }

    /**
     * The block a propagation step may cross into, or `undefined` when it may not: outside the
     * dimension, in a chunk the view has not loaded, or in a column the engine does not hold. The
     * last two cases record the column so the step runs when the chunk arrives, which is what keeps
     * an unloaded neighbor from behaving like a wall.
     */
    private neighborBlock(x: number, y: number, z: number): BlockLightProperties | undefined {
        if (y < this.view.minY || y >= this.view.maxY) return undefined;

        const key = columnKeyOf(chunkOf(x), chunkOf(z));
        if (!this.columns.has(key)) {
            this.awaitingChunks.add(key);
            return undefined;
        }

        const block = this.view.blockAt(x, y, z);
        if (block === undefined) this.awaitingChunks.add(key);

        return block;
    }
}
