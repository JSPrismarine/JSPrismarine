import type { BlockLightProperties, BlockLightView } from './BlockLightView';
import { CHUNK_COLUMN_COUNT, CHUNK_SIZE, chunkOf, columnKeyOf, heightmapIndexOf } from './coordinates';
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

/** The block light layer, which floods out of emitting blocks. */
const BLOCK_LAYER = 0;
/** The sky light layer, which floods down from the open sky. */
const SKY_LAYER = 1;

type LightLayer = typeof BLOCK_LAYER | typeof SKY_LAYER;

interface LightColumn {
    /**
     * For each of the 256 block columns, one past the y of the highest block with a dampening
     * above 0. Everything at or above it has sky light 15 and is not stored.
     */
    readonly heightmap: Int32Array;
    readonly blockSections: Map<number, LightSection>;
    readonly skySections: Map<number, LightSection>;
}

/** The six neighbor offsets, the four horizontal ones first so a loop can stop after them. */
const HORIZONTAL_DIRECTIONS = 4;
const ALL_DIRECTIONS = 6;
const OFFSET_X = [-1, 1, 0, 0, 0, 0] as const;
const OFFSET_Z = [0, 0, -1, 1, 0, 0] as const;
const OFFSET_Y = [0, 0, 0, 0, -1, 1] as const;

/**
 * The server's internal light model: a block light layer that floods out of emitters and a sky
 * light layer that falls from the open sky, both kept current as blocks change and both advanced in
 * bounded steps so a tick cannot stall.
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
    private readonly increaseQueues = [new LightQueue(), new LightQueue()] as const;
    private readonly decreaseQueues = [new LightQueue(), new LightQueue()] as const;
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

        return column === undefined ? 0 : this.read(BLOCK_LAYER, column, x, y, z);
    }

    /**
     * The sky light at a world position, 0 to 15, before the time of day and the weather scale it.
     * The daylight cycle multiplies this number; it does not change it.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @returns {number} The level, 0 in a dimension with no sky and 0 for a position in a column the
     * engine has not been told about.
     */
    public getSkyLight(x: number, y: number, z: number): number {
        if (!this.view.hasSkyLight) return 0;
        const column = this.columnAt(x, z);

        return column === undefined ? 0 : this.read(SKY_LAYER, column, x, y, z);
    }

    /**
     * Takes a chunk into the light model and computes its light from scratch: it builds the sky
     * heightmap, makes every emitter in the column a source, and re-seeds across the border of each
     * loaded neighbor so light that stopped at the chunk's edge while it was absent flows in.
     *
     * Calling this for a chunk the engine already holds discards that chunk's stored light and
     * computes it again, which is how a caller forces a full recompute.
     * @param {number} chunkX - The chunk x.
     * @param {number} chunkZ - The chunk z.
     */
    public onChunkLoaded(chunkX: number, chunkZ: number): void {
        const key = columnKeyOf(chunkX, chunkZ);
        this.awaitingChunks.delete(key);

        const column: LightColumn = {
            heightmap: new Int32Array(CHUNK_COLUMN_COUNT).fill(this.view.minY),
            blockSections: new Map(),
            skySections: new Map()
        };
        this.columns.set(key, column);

        const baseX = chunkX * CHUNK_SIZE;
        const baseZ = chunkZ * CHUNK_SIZE;
        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                this.scanColumn(column, baseX + localX, baseZ + localZ);
            }
        }

        if (this.view.hasSkyLight) {
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                    this.seedSkySources(baseX + localX, baseZ + localZ);
                }
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
     * Queues the smallest piece of work that makes both layers correct again after one block
     * changed. Nothing is computed here; {@link LightEngine.flush} does the computing.
     *
     * The sky layer is patched rather than rebuilt: the column's heightmap entry moves only when
     * the change was at or above the highest light-blocking block, and the only scan is the walk
     * down the column that finds the next blocker after the top one is broken.
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

        this.changeBlockLight(column, x, y, z, newState);
        if (this.view.hasSkyLight) this.changeSkyLight(column, x, y, z, oldState, newState);
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
            if (this.decreaseQueues[BLOCK_LAYER].size > 0) this.stepDecrease(BLOCK_LAYER);
            else if (this.decreaseQueues[SKY_LAYER].size > 0) this.stepDecrease(SKY_LAYER);
            else if (this.increaseQueues[BLOCK_LAYER].size > 0) this.stepIncrease(BLOCK_LAYER);
            else if (this.increaseQueues[SKY_LAYER].size > 0) this.stepIncrease(SKY_LAYER);
            else break;

            processed++;
        }

        return { processed, queued: this.queuedNodes, deferred: this.awaitingChunks.size };
    }

    private get queuedNodes(): number {
        return (
            this.decreaseQueues[BLOCK_LAYER].size +
            this.decreaseQueues[SKY_LAYER].size +
            this.increaseQueues[BLOCK_LAYER].size +
            this.increaseQueues[SKY_LAYER].size
        );
    }

    private columnAt(x: number, z: number): LightColumn | undefined {
        return this.columns.get(columnKeyOf(chunkOf(x), chunkOf(z)));
    }

    private heightAt(column: LightColumn, x: number, z: number): number {
        return column.heightmap[heightmapIndexOf(x & 15, z & 15)]!;
    }

    private read(layer: LightLayer, column: LightColumn, x: number, y: number, z: number): number {
        if (layer === SKY_LAYER) {
            if (!this.view.hasSkyLight) return 0;
            if (y >= this.heightAt(column, x, z)) return MAX_LIGHT_LEVEL;
        }

        const sections = layer === SKY_LAYER ? column.skySections : column.blockSections;
        const section = sections.get(y >> 4);

        return section === undefined ? 0 : section.get(x & 15, y & 15, z & 15);
    }

    private write(layer: LightLayer, column: LightColumn, x: number, y: number, z: number, level: number): void {
        // Sky light at or above the heightmap is a constant 15 that is never stored, so a write
        // there would be either redundant or a bug; drop it either way.
        if (layer === SKY_LAYER && y >= this.heightAt(column, x, z)) return;

        const sections = layer === SKY_LAYER ? column.skySections : column.blockSections;
        const sectionY = y >> 4;
        let section = sections.get(sectionY);
        if (section === undefined) {
            if (level === 0) return;
            section = new LightSection();
            sections.set(sectionY, section);
        }

        section.set(x & 15, y & 15, z & 15, level);
    }

    /** The level a block holds on its own: its emission for block light, nothing for sky light. */
    private sourceLevel(layer: LightLayer, block: BlockLightProperties): number {
        return layer === SKY_LAYER ? 0 : Math.min(block.lightEmission, MAX_LIGHT_LEVEL);
    }

    /**
     * One downward walk of a block column: records the heightmap entry and seeds every emitter.
     *
     * The walk starts at {@link BlockLightView.topOfColumn} where the view answers it. This is
     * the engine's hottest loop by a wide margin - it is every block of every column of every
     * chunk that loads - and in an Overworld most of what it would otherwise read is the two
     * hundred blocks of open sky above the ground, which neither emit nor dampen and so move
     * neither the heightmap nor a source.
     */
    private scanColumn(column: LightColumn, x: number, z: number): void {
        let height = this.view.minY;
        const top = Math.min(this.view.topOfColumn?.(x, z) ?? this.view.maxY, this.view.maxY);

        for (let y = top - 1; y >= this.view.minY; y--) {
            const block = this.view.blockAt(x, y, z);
            if (block === undefined) continue;

            if (height === this.view.minY && block.lightDampening > 0) height = y + 1;

            if (block.lightEmission > 0) {
                this.write(BLOCK_LAYER, column, x, y, z, this.sourceLevel(BLOCK_LAYER, block));
                this.increaseQueues[BLOCK_LAYER].push(x, y, z);
            }
        }

        column.heightmap[heightmapIndexOf(x & 15, z & 15)] = height;
    }

    /**
     * Queues the sky sources of one block column.
     *
     * Everything at or above the heightmap holds 15, but only two kinds of cell have anywhere to
     * send it: the cell at the heightmap, which lights the column below, and the cells facing a
     * horizontal neighbor whose own heightmap is higher, which light that neighbor sideways. The
     * seed range is therefore the column's own height up to the tallest of its four neighbors, which
     * is the local relief rather than the height of the world.
     */
    private seedSkySources(x: number, z: number): void {
        const column = this.columnAt(x, z);
        if (column === undefined) return;

        const height = this.heightAt(column, x, z);
        let top = height + 1;
        for (let direction = 0; direction < HORIZONTAL_DIRECTIONS; direction++) {
            const neighborX = x + OFFSET_X[direction]!;
            const neighborZ = z + OFFSET_Z[direction]!;
            const neighbor = this.columnAt(neighborX, neighborZ);
            if (neighbor === undefined) continue;

            const neighborHeight = this.heightAt(neighbor, neighborX, neighborZ);
            if (neighborHeight > top) top = neighborHeight;
        }

        for (let y = height; y < top; y++) this.increaseQueues[SKY_LAYER].push(x, y, z);
    }

    /**
     * Re-seeds the four border planes of a chunk that just loaded, from the neighbor's side, so the
     * light already standing next to the chunk flows into it.
     */
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
                    if (this.read(BLOCK_LAYER, column, x, y, z) > 1) {
                        this.increaseQueues[BLOCK_LAYER].push(x, y, z);
                    }
                }

                if (this.view.hasSkyLight) this.seedSkySources(x, z);
            }
        }
    }

    private changeBlockLight(
        column: LightColumn,
        x: number,
        y: number,
        z: number,
        newState: BlockLightProperties
    ): void {
        const previous = this.read(BLOCK_LAYER, column, x, y, z);
        const emission = Math.min(newState.lightEmission, MAX_LIGHT_LEVEL);
        this.write(BLOCK_LAYER, column, x, y, z, emission);

        if (previous > emission) this.decreaseQueues[BLOCK_LAYER].push(x, y, z, previous);
        if (emission > 0) this.increaseQueues[BLOCK_LAYER].push(x, y, z);
        this.pushNeighbors(BLOCK_LAYER, x, y, z);
    }

    private changeSkyLight(
        column: LightColumn,
        x: number,
        y: number,
        z: number,
        oldState: BlockLightProperties,
        newState: BlockLightProperties
    ): void {
        const index = heightmapIndexOf(x & 15, z & 15);
        const oldHeight = column.heightmap[index]!;
        const newHeight = this.heightAfterChange(
            x,
            y,
            z,
            oldHeight,
            oldState.lightDampening > 0,
            newState.lightDampening > 0
        );

        if (newHeight > oldHeight) {
            // The column lost its open sky between the old height and the new blocker. Those cells
            // read 15 a moment ago, so every level they fed has to come down before the sky light
            // that reaches them through the new blocker can fill them in again.
            column.heightmap[index] = newHeight;
            for (let gapY = oldHeight; gapY < newHeight; gapY++) {
                this.write(SKY_LAYER, column, x, gapY, z, 0);
                this.decreaseQueues[SKY_LAYER].push(x, gapY, z, MAX_LIGHT_LEVEL);
            }
        } else if (newHeight < oldHeight) {
            column.heightmap[index] = newHeight;
        } else if (y < oldHeight) {
            const previous = this.read(SKY_LAYER, column, x, y, z);
            this.write(SKY_LAYER, column, x, y, z, 0);
            if (previous > 0) this.decreaseQueues[SKY_LAYER].push(x, y, z, previous);
        }

        if (newHeight === oldHeight) this.increaseQueues[SKY_LAYER].push(x, y, z);
        else this.seedSkySources(x, z);
        this.pushNeighbors(SKY_LAYER, x, y, z);
    }

    /**
     * Where the column's heightmap entry lands after a block changed. The only case that costs a
     * scan is breaking the top blocker, which walks down to the next one.
     */
    private heightAfterChange(
        x: number,
        y: number,
        z: number,
        height: number,
        wasBlocking: boolean,
        isBlocking: boolean
    ): number {
        if (isBlocking) return y >= height ? y + 1 : height;
        if (!wasBlocking || y !== height - 1) return height;

        for (let scan = y - 1; scan >= this.view.minY; scan--) {
            const block = this.view.blockAt(x, scan, z);
            if (block !== undefined && block.lightDampening > 0) return scan + 1;
        }

        return this.view.minY;
    }

    private pushNeighbors(layer: LightLayer, x: number, y: number, z: number): void {
        for (let direction = 0; direction < ALL_DIRECTIONS; direction++) {
            const neighborY = y + OFFSET_Y[direction]!;
            if (neighborY < this.view.minY || neighborY >= this.view.maxY) continue;

            this.increaseQueues[layer].push(x + OFFSET_X[direction]!, neighborY, z + OFFSET_Z[direction]!);
        }
    }

    private stepIncrease(layer: LightLayer): void {
        const node = this.increaseQueues[layer].shift();
        if (node === undefined) return;

        const { x, y, z } = node;
        const column = this.columnAt(x, z);
        if (column === undefined) return;

        const level = this.read(layer, column, x, y, z);
        if (level <= 1) return;

        for (let direction = 0; direction < ALL_DIRECTIONS; direction++) {
            const neighborX = x + OFFSET_X[direction]!;
            const neighborY = y + OFFSET_Y[direction]!;
            const neighborZ = z + OFFSET_Z[direction]!;
            const block = this.crossable(neighborX, neighborY, neighborZ);
            if (block === undefined) continue;

            const target = level - Math.max(1, block.lightDampening);
            if (target <= 0) continue;

            const neighborColumn = this.columnAt(neighborX, neighborZ)!;
            if (this.read(layer, neighborColumn, neighborX, neighborY, neighborZ) >= target) continue;

            this.write(layer, neighborColumn, neighborX, neighborY, neighborZ, target);
            this.increaseQueues[layer].push(neighborX, neighborY, neighborZ);
        }
    }

    private stepDecrease(layer: LightLayer): void {
        const node = this.decreaseQueues[layer].shift();
        if (node === undefined) return;

        const { x, y, z, level: removed } = node;
        for (let direction = 0; direction < ALL_DIRECTIONS; direction++) {
            const neighborX = x + OFFSET_X[direction]!;
            const neighborY = y + OFFSET_Y[direction]!;
            const neighborZ = z + OFFSET_Z[direction]!;
            const block = this.crossable(neighborX, neighborY, neighborZ);
            if (block === undefined) continue;

            const neighborColumn = this.columnAt(neighborX, neighborZ)!;
            const neighborLevel = this.read(layer, neighborColumn, neighborX, neighborY, neighborZ);
            if (neighborLevel === 0) continue;

            if (neighborLevel >= removed) {
                // The neighbor is at least as bright as what went away, so it is lit by something
                // else and becomes the front of the re-propagation.
                this.increaseQueues[layer].push(neighborX, neighborY, neighborZ);
                continue;
            }

            const source = this.sourceLevel(layer, block);
            this.write(layer, neighborColumn, neighborX, neighborY, neighborZ, source);
            this.decreaseQueues[layer].push(neighborX, neighborY, neighborZ, neighborLevel);
            if (source > 0) this.increaseQueues[layer].push(neighborX, neighborY, neighborZ);
        }
    }

    /**
     * The block a propagation step may cross into, or `undefined` when it may not: outside the
     * dimension, in a chunk the view has not loaded, or in a column the engine does not hold. The
     * last two cases record the column so the step runs when the chunk arrives, which is what keeps
     * an unloaded neighbor from behaving like a wall: the light next to the border keeps its level
     * instead of being darkened against an imaginary surface.
     */
    private crossable(x: number, y: number, z: number): BlockLightProperties | undefined {
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
