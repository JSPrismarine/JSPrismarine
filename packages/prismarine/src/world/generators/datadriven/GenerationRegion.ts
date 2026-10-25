/**
 * The Java-shaped scratch buffer one chunk is generated in.
 *
 * Every stage above the chunk storage speaks Java Edition block states: the terrain sampler,
 * the surface pass, the carvers and the features all name Java identifiers with Java property
 * names. Translating per write would cost a mapping lookup for each of a chunk's roughly 18000
 * placements, so the whole chunk is built here and translated once at the end.
 *
 * The region can hold one chunk of terrain or a three by three feature view. The latter mirrors
 * Java's `WorldGenRegion`: features read neighboring terrain, and writes beyond the center are
 * returned as chunk patches for those chunks.
 */
import type {
    BlockEntityRequest,
    BlockOracle,
    BlockPos,
    BlockState,
    FeatureWorld,
    HeightmapType,
    TemplateRequest
} from '@jsprismarine/features';
import type { BedrockBlockState } from '@jsprismarine/structures';
import type { SurfaceChunk } from '@jsprismarine/worldgen';

import type { TemplateSource, TemplateTarget } from './javaTemplatePlacement';
import { placeJavaTemplate } from './javaTemplatePlacement';

/** The radius of Java's feature view around its generating chunk. */
const FEATURE_RADIUS = 1;

const AIR = 'minecraft:air';
const AIR_STATE: BlockState = { name: AIR, properties: {} };

/** How a {@link GenerationRegion} is built. */
export interface GenerationRegionOptions {
    readonly chunkX: number;
    readonly chunkZ: number;
    /** The lowest y the dimension generates. */
    readonly minY: number;
    /** How many y levels the dimension generates. */
    readonly height: number;
    /** Chunk radius held in memory; zero is used for cached terrain tiles. Defaults to one. */
    readonly radius?: number;
    readonly seaLevel: number;
    readonly seed: bigint;
    /** The static block facts, which the features package reads through the world. */
    readonly blocks: BlockOracle;
    /** The biome at a block position, as the surface pass and the features both read it. */
    readonly biomeAt: (x: number, y: number, z: number) => string;
    /** Java's `Biome.getTemperature(pos) < 0.15`, which is what `freeze_top_layer` acts on. */
    readonly isColdEnoughToSnow?: (x: number, y: number, z: number) => boolean;
    /**
     * Where the structure templates come from. Absent on a server that carries none, which
     * makes `template` and `fossil` report that they placed nothing.
     */
    readonly templates?: TemplateSource;
}

/**
 * One entry of the region's palette.
 *
 * Almost every block is a Java state, which is what the terrain, surface and feature stages
 * write. A block a structure template placed arrives already translated, because
 * `@jsprismarine/structures` answers in Bedrock states, so it carries both: the Bedrock state
 * the chunk gets, and the Java view the rest of generation reads it back through.
 */
export interface RegionBlock {
    readonly java: BlockState;
    /** Set only for a block a structure template placed. */
    readonly bedrock?: BedrockBlockState;
}

/** A block entity a feature attached to a block it placed, in world coordinates. */
export interface RegionBlockEntity {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** What the feature asked for, still naming Java's block entity type and loot table. */
    readonly request: BlockEntityRequest;
}

/** A block entity a later feature write removed, in world coordinates. */
export interface RegionBlockEntityRemoval {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** An entity a feature asked for, at the entity coordinates it stands on. */
export interface RegionEntitySpawn {
    /** The Java entity type the feature named, for example `minecraft:end_crystal`. */
    readonly type: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** Which way it faces, in degrees. */
    readonly yaw: number;
}

/**
 * The center chunk handed over as palette slots rather than as 98304 block states.
 *
 * What the Bedrock chunk is filled from. Translating per block costs one mapping lookup for each
 * of the column's blocks; translating the palette costs one for each of its few hundred entries,
 * and the index buffer is then copied section by section. That is the difference between work
 * proportional to the chunk and work proportional to the materials in it, and it is what makes
 * the handover cheap enough to sit on the main thread behind a worker pool.
 */
export interface CenterBlockSlots {
    /** The palette the slots index into. Slot 0 is air. */
    readonly palette: readonly RegionBlock[];
    /** One slot per block, indexed `(localX * 16 + localZ) * height + (y - minY)`. */
    readonly slots: Uint16Array;
    /** The highest y holding a non-air block per column, indexed `localX * 16 + localZ`. */
    readonly columnTops: Int32Array;
}

/**
 * A region flattened into something `postMessage` moves rather than copies.
 *
 * What a `terrain` body in a worker hands back. Everything is a number, a plain object or an
 * `ArrayBuffer`: no class instance survives a structured clone, and a per-block object graph
 * costs the main thread 298 microseconds a chunk against 20 for this shape.
 *
 * The region's options do not travel. The block oracle, the biome lookup and the template source
 * are functions, and the thread receiving this has its own.
 */
export interface GenerationRegionPayload {
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly minY: number;
    readonly height: number;
    readonly radius: number;
    /** The palette the state indices point into. A few hundred entries, not 98304. */
    readonly palette: readonly RegionBlock[];
    /** `Uint16Array` of palette slots, indexed the way the region indexes its own. */
    readonly states: ArrayBuffer;
    /** `Int32Array` of the highest non-air y per column. */
    readonly highest: ArrayBuffer;
    /** `Int32Array` of the frozen `WORLD_SURFACE_WG` heights, absent before the fill froze them. */
    readonly frozenSurface?: ArrayBuffer;
    /** The block entities, each with the state index it is attached to. */
    readonly blockEntities: ReadonlyArray<readonly [index: number, entity: RegionBlockEntity]>;
    readonly entitySpawns: readonly RegionEntitySpawn[];
}

/** A payload and the buffers to hand `postMessage` so they move instead of being copied. */
export interface GenerationRegionTransfer {
    readonly payload: GenerationRegionPayload;
    readonly transferList: readonly ArrayBuffer[];
}

/** A block state written during decoration, in world coordinates. */
export interface RegionBlockWrite {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly block: RegionBlock;
}

/** Decoration output that belongs to one chunk. */
export interface RegionChunkPatch {
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly blocks: readonly RegionBlockWrite[];
    readonly blockEntityRemovals: readonly RegionBlockEntityRemoval[];
    readonly blockEntities: readonly RegionBlockEntity[];
    readonly entitySpawns: readonly RegionEntitySpawn[];
}

interface MutableRegionPatch {
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly blocks: RegionBlockWrite[];
    readonly blockEntityRemovals: RegionBlockEntityRemoval[];
    readonly blockEntities: RegionBlockEntity[];
    readonly entitySpawns: RegionEntitySpawn[];
}

/**
 * A Java state's place in the palette's key space: the identifier, and its properties sorted.
 *
 * Sorted rather than written in the order they arrived, because the same state reached through
 * two code paths has to land in the same slot.
 */
const javaPaletteKey = (state: BlockState): string => {
    const keys = Object.keys(state.properties).sort();
    if (keys.length === 0) return state.name;

    return `${state.name}[${keys.map((property) => `${property}=${state.properties[property]}`).join(',')}]`;
};

/**
 * A Bedrock state's place in the palette's key space, which is its own.
 *
 * The namespace matters: a Java `minecraft:bone_block[axis=y]` and the Bedrock state a template
 * resolved to the same block are different entries, because only the second reaches the chunk
 * without a mapping lookup.
 */
const bedrockPaletteKey = (state: BedrockBlockState): string => {
    const keys = Object.keys(state.states).sort();
    return `bedrock|${state.name}[${keys.map((name) => `${name}=${state.states[name]}`).join(',')}]`;
};

/** Where one palette entry sits in the key space, whichever edition wrote it. */
const paletteKeyOf = (block: RegionBlock): string =>
    block.bedrock === undefined ? javaPaletteKey(block.java) : bedrockPaletteKey(block.bedrock);

/**
 * A rectangular chunk window of Java block states.
 *
 * States are held as indices into a per-region palette, so the buffer is two bytes a block
 * rather than one object reference. {@link surfaceChunk} and {@link featureWorld} project the
 * two seams the generation stages read it through; the two interfaces spell `getBlock`
 * differently, so neither is implemented on the class itself.
 */
export class GenerationRegion {
    /** The lowest y the region holds. */
    public readonly minY: number;
    /** The highest y the region holds. */
    public readonly maxY: number;

    private readonly chunkX: number;
    private readonly chunkZ: number;
    private readonly height: number;
    private readonly radius: number;
    private readonly width: number;
    private readonly originX: number;
    private readonly originZ: number;
    private states: Uint16Array<ArrayBuffer>;
    private palette: RegionBlock[] = [{ java: AIR_STATE }];
    private paletteIndex = new Map<string, number>([[AIR, 0]]);

    /** The highest y holding anything other than air, per region column. */
    private highest: Int32Array<ArrayBuffer>;

    /** The block entities features attached, keyed by the same index the states use. */
    private blockEntities = new Map<number, RegionBlockEntity>();

    /** The entities features asked for, in the order they asked. */
    private entitySpawns: RegionEntitySpawn[] = [];

    private trackingWrites = false;
    private readonly trackedWrites = new Map<number, RegionBlockWrite>();
    private readonly trackedBlockEntityRemovals = new Map<number, RegionBlockEntityRemoval>();
    private readonly trackedBlockEntities = new Map<number, RegionBlockEntity>();
    private readonly trackedEntitySpawns: RegionEntitySpawn[] = [];

    /** The `WORLD_SURFACE_WG` heights frozen after the terrain fill, as Java freezes them. */
    private frozenSurface: Int32Array<ArrayBuffer> | null = null;

    public constructor(private readonly options: GenerationRegionOptions) {
        this.chunkX = options.chunkX;
        this.chunkZ = options.chunkZ;
        this.minY = options.minY;
        this.height = options.height;
        this.radius = options.radius ?? FEATURE_RADIUS;
        this.width = (this.radius * 2 + 1) * 16;
        this.maxY = options.minY + options.height - 1;

        this.originX = (options.chunkX - this.radius) * 16;
        this.originZ = (options.chunkZ - this.radius) * 16;
        this.states = new Uint16Array(this.width * this.width * options.height);
        this.highest = new Int32Array(this.width * this.width).fill(options.minY - 1);
    }

    /**
     * Packs the region for `postMessage` and gives its buffers up.
     *
     * The region is spent once this returns, whether or not the caller posts the payload: the
     * buffers are already promised to the other side. What travels is the palette and three flat
     * arrays, which is 18 microseconds for a column against 76 structured-cloned.
     *
     * @returns The payload and the buffers to pass as the transfer list.
     */
    public transfer(): GenerationRegionTransfer {
        const payload: GenerationRegionPayload = {
            chunkX: this.chunkX,
            chunkZ: this.chunkZ,
            minY: this.minY,
            height: this.height,
            radius: this.radius,
            palette: this.palette,
            states: this.states.buffer,
            highest: this.highest.buffer,
            ...(this.frozenSurface === null ? {} : { frozenSurface: this.frozenSurface.buffer }),
            blockEntities: [...this.blockEntities],
            entitySpawns: this.entitySpawns
        };

        const transferList = [this.states.buffer, this.highest.buffer];
        if (this.frozenSurface !== null) transferList.push(this.frozenSurface.buffer);

        return { payload, transferList };
    }

    /**
     * Rebuilds a region from a payload that arrived on this thread, without copying a buffer.
     *
     * The palette index is rebuilt rather than carried, because it is a `Map` and a `Map` is
     * cheaper to rebuild from a few hundred entries than to clone.
     *
     * @param payload - What {@link GenerationRegion.transfer} produced.
     * @param options - The things that cannot travel: the block oracle, the biome lookup, the
     * sea level, the seed and the template source. The geometry comes from the payload.
     * @returns A region owning the payload's bytes. The payload is spent.
     */
    public static adopt(
        payload: GenerationRegionPayload,
        options: Omit<GenerationRegionOptions, 'chunkX' | 'chunkZ' | 'minY' | 'height' | 'radius'>
    ): GenerationRegion {
        const region = new GenerationRegion({
            ...options,
            chunkX: payload.chunkX,
            chunkZ: payload.chunkZ,
            minY: payload.minY,
            height: payload.height,
            radius: payload.radius
        });

        region.palette = [...payload.palette];
        region.paletteIndex = new Map(region.palette.map((block, slot) => [paletteKeyOf(block), slot]));
        region.states = new Uint16Array(payload.states);
        region.highest = new Int32Array(payload.highest);
        region.frozenSurface = payload.frozenSurface === undefined ? null : new Int32Array(payload.frozenSurface);
        region.blockEntities = new Map(payload.blockEntities);
        region.entitySpawns = [...payload.entitySpawns];
        return region;
    }

    /** The state at a block position, air outside the region. */
    public stateAt(x: number, y: number, z: number): BlockState {
        return this.blockAt(x, y, z).java;
    }

    /** The palette entry at a block position, air outside the region. */
    public blockAt(x: number, y: number, z: number): RegionBlock {
        const index = this.indexOf(x, y, z);
        return index === -1 ? this.palette[0]! : this.palette[this.states[index]!]!;
    }

    /** Writes a state, ignoring a position outside the region. Returns whether it landed. */
    public write(x: number, y: number, z: number, state: BlockState): boolean {
        const index = this.indexOf(x, y, z);
        if (index === -1) return false;

        this.states[index] = this.paletteSlot(state);
        this.afterWrite(index, x, y, z, state.name === AIR);
        this.trackWrite(index, x, y, z);
        return true;
    }

    /** Writes a name-only state without allocating a `BlockState` for terrain samples. */
    public writeName(x: number, y: number, z: number, name: string): boolean {
        const index = this.indexOf(x, y, z);
        if (index === -1) return false;

        this.states[index] = this.paletteSlotForName(name);
        this.afterWrite(index, x, y, z, name === AIR);
        this.trackWrite(index, x, y, z);
        return true;
    }

    /**
     * Writes a block a structure template resolved, which is already a Bedrock state.
     *
     * The Java view the region keeps beside it is the Bedrock identifier with no properties.
     * That only decides what a later feature reads back at the position, and the two editions
     * agree on the identifier for every block a vanilla template places; the chunk gets the
     * exact Bedrock state.
     */
    public writeBedrock(x: number, y: number, z: number, state: BedrockBlockState): boolean {
        const index = this.indexOf(x, y, z);
        if (index === -1) return false;

        this.states[index] = this.bedrockSlot(state);
        this.afterWrite(index, x, y, z, state.name === AIR);
        this.trackWrite(index, x, y, z);
        return true;
    }

    /** Starts collecting decoration writes so neighboring chunks can receive their share. */
    public beginWriteTracking(): void {
        this.trackingWrites = true;
        this.trackedWrites.clear();
        this.trackedBlockEntityRemovals.clear();
        this.trackedBlockEntities.clear();
        this.trackedEntitySpawns.length = 0;
    }

    /** Returns the writes grouped by destination chunk, then stops tracking. */
    public takeTrackedPatches(): readonly RegionChunkPatch[] {
        this.trackingWrites = false;
        const patches = new Map<string, MutableRegionPatch>();
        const patchFor = (chunkX: number, chunkZ: number): MutableRegionPatch => {
            const key = `${chunkX},${chunkZ}`;
            let patch = patches.get(key);
            if (patch === undefined) {
                patch = { chunkX, chunkZ, blocks: [], blockEntityRemovals: [], blockEntities: [], entitySpawns: [] };
                patches.set(key, patch);
            }
            return patch;
        };

        for (const write of this.trackedWrites.values()) {
            patchFor(Math.floor(write.x / 16), Math.floor(write.z / 16)).blocks.push(write);
        }
        for (const removal of this.trackedBlockEntityRemovals.values()) {
            patchFor(Math.floor(removal.x / 16), Math.floor(removal.z / 16)).blockEntityRemovals.push(removal);
        }
        for (const blockEntity of this.trackedBlockEntities.values()) {
            patchFor(Math.floor(blockEntity.x / 16), Math.floor(blockEntity.z / 16)).blockEntities.push(blockEntity);
        }
        for (const spawn of this.trackedEntitySpawns) {
            patchFor(Math.floor(spawn.x / 16), Math.floor(spawn.z / 16)).entitySpawns.push(spawn);
        }

        this.trackedWrites.clear();
        this.trackedBlockEntityRemovals.clear();
        this.trackedBlockEntities.clear();
        this.trackedEntitySpawns.length = 0;
        return [...patches.values()];
    }

    /** Copies another tile's center terrain and frozen surface heights into this region. */
    public copyCenterFrom(source: GenerationRegion): void {
        if (source.minY !== this.minY || source.maxY !== this.maxY) {
            throw new RangeError('Cannot combine generation regions with different vertical extents');
        }

        // A feature view copies nine terrain tiles. Move their palette indices in bulk so this
        // boundary does not allocate a RegionBlock and sort state properties for every block.
        const destinationSlots = source.palette.map((block, slot) => {
            if (slot === 0) return 0;
            return block.bedrock === undefined ? this.paletteSlot(block.java) : this.bedrockSlot(block.bedrock);
        });
        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                const x = source.chunkX * 16 + localX;
                const z = source.chunkZ * 16 + localZ;
                const sourceColumn = source.columnIndex(x, z);
                const targetColumn = this.columnIndex(x, z);
                if (sourceColumn === -1 || targetColumn === -1) continue;

                const sourceTop = source.highest[sourceColumn]!;
                for (let y = this.minY; y <= sourceTop; y++) {
                    const sourceIndex = sourceColumn * this.height + (y - this.minY);
                    const sourceSlot = source.states[sourceIndex]!;
                    if (sourceSlot === 0) continue;

                    const targetIndex = targetColumn * this.height + (y - this.minY);
                    const targetSlot = destinationSlots[sourceSlot]!;
                    const block = this.palette[targetSlot]!;
                    if (block.java.name === AIR) continue;

                    this.states[targetIndex] = targetSlot;
                    this.blockEntities.delete(targetIndex);
                    if (this.trackingWrites) {
                        this.trackedBlockEntities.delete(targetIndex);
                        this.trackedWrites.set(targetIndex, { x, y, z, block });
                    }
                    if (y > this.highest[targetColumn]!) this.highest[targetColumn] = y;
                }
            }
        }
        for (const blockEntity of source.centerBlockEntities()) {
            this.attachBlockEntity({ x: blockEntity.x, y: blockEntity.y, z: blockEntity.z }, blockEntity.request);
        }
        this.entitySpawns.push(...source.centerEntitySpawns());

        if (source.frozenSurface !== null) {
            this.frozenSurface ??= new Int32Array(this.highest.length).fill(this.minY - 1);
            for (let localX = 0; localX < 16; localX++) {
                for (let localZ = 0; localZ < 16; localZ++) {
                    const x = source.chunkX * 16 + localX;
                    const z = source.chunkZ * 16 + localZ;
                    const sourceColumn = source.columnIndex(x, z);
                    const targetColumn = this.columnIndex(x, z);
                    if (sourceColumn !== -1 && targetColumn !== -1) {
                        this.frozenSurface[targetColumn] = source.frozenSurface[sourceColumn]!;
                    }
                }
            }
        }
    }

    /** Applies a previous feature write before this chunk's own decoration runs. */
    public applyPatch(patch: RegionChunkPatch): void {
        for (const removal of patch.blockEntityRemovals) {
            const index = this.indexOf(removal.x, removal.y, removal.z);
            if (index !== -1) this.blockEntities.delete(index);
        }
        for (const write of patch.blocks) {
            if (write.block.bedrock === undefined) this.write(write.x, write.y, write.z, write.block.java);
            else this.writeBedrock(write.x, write.y, write.z, write.block.bedrock);
        }
        for (const blockEntity of patch.blockEntities) {
            this.attachBlockEntity({ x: blockEntity.x, y: blockEntity.y, z: blockEntity.z }, blockEntity.request);
        }
        this.entitySpawns.push(...patch.entitySpawns);
    }

    /** The bookkeeping every write does once its state has landed in the buffer. */
    private afterWrite(index: number, x: number, y: number, z: number, isAir: boolean): void {
        // A block entity belongs to the block it was attached to, so overwriting that block
        // takes it away, as Java's `setBlock` does.
        const removedBlockEntity = this.blockEntities.get(index);
        if (removedBlockEntity !== undefined) {
            if (this.trackingWrites) this.trackedBlockEntityRemovals.set(index, { x, y, z });
            this.blockEntities.delete(index);
        }
        if (this.trackingWrites) this.trackedBlockEntities.delete(index);

        const column = this.columnIndex(x, z);
        if (!isAir) {
            if (y > this.highest[column]!) this.highest[column] = y;
        } else if (y === this.highest[column]) {
            // Removing the topmost block drops the column's ceiling to the next one down.
            let next = y - 1;
            while (next >= this.minY && this.stateAt(x, next, z).name === AIR) next--;
            this.highest[column] = next;
        }
    }

    /**
     * Freezes the `WORLD_SURFACE_WG` heightmap, which Java does once the terrain fill is done.
     *
     * The surface pass reads it while writing into the same columns, so taking it live would
     * let a column's new grass move the surface the next rule reads.
     */
    public freezeSurfaceHeights(): void {
        this.frozenSurface = Int32Array.from(this.highest);
    }

    /** The seam `@jsprismarine/worldgen`'s surface pass writes through. */
    public surfaceChunk(): SurfaceChunk {
        return {
            chunkX: this.chunkX,
            chunkZ: this.chunkZ,
            minY: this.minY,
            maxY: this.maxY,
            getBlock: (x, y, z) => this.stateAt(x, y, z).name,
            setBlock: (x, y, z, state) => {
                this.write(x, y, z, this.stateOf(state));
            },
            surfaceHeight: (localX, localZ) => {
                const column = this.columnIndex(this.chunkX * 16 + localX, this.chunkZ * 16 + localZ);
                return (this.frozenSurface ?? this.highest)[column]!;
            }
        };
    }

    /** The seam `@jsprismarine/features` decorates through. */
    public featureWorld(): FeatureWorld {
        return {
            minY: this.minY,
            height: this.height,
            seaLevel: this.options.seaLevel,
            seed: this.options.seed,
            blocks: this.options.blocks,
            getBlock: (position) => this.stateAt(position.x, position.y, position.z),
            setBlock: (position, state) => this.write(position.x, position.y, position.z, state),
            getHeight: (heightmap, x, z) => this.heightAt(heightmap, x, z),
            getBiome: (position) => this.options.biomeAt(position.x, position.y, position.z),
            setBlockEntity: (position, data) => this.attachBlockEntity(position, data),
            spawnEntity: (type, position, yaw) => this.recordEntity(type, position, yaw),
            placeTemplate: (request) => this.stampTemplate(request),
            ...(this.options.isColdEnoughToSnow
                ? {
                      isColdEnoughToSnow: (position: { x: number; y: number; z: number }) =>
                          this.options.isColdEnoughToSnow!(position.x, position.y, position.z)
                  }
                : {})
        };
    }

    /** The block entities attached inside the center chunk, which is the chunk that is kept. */
    public centerBlockEntities(): readonly RegionBlockEntity[] {
        return [...this.blockEntities.values()].filter((entry) => this.isInCenterChunk(entry.x, entry.z));
    }

    /** The entities asked for inside the center chunk, in the order the features asked. */
    public centerEntitySpawns(): readonly RegionEntitySpawn[] {
        return this.entitySpawns.filter((spawn) => this.isInCenterChunk(Math.floor(spawn.x), Math.floor(spawn.z)));
    }

    /**
     * The center chunk's blocks as palette slots, for the translation pass.
     *
     * A radius-0 region is already exactly the center chunk in exactly this layout, so it hands
     * its own buffers over rather than copying them. They stay the region's, so a caller reads
     * them and does not keep them.
     */
    public centerBlockSlots(): CenterBlockSlots {
        if (this.radius === 0) return { palette: this.palette, slots: this.states, columnTops: this.highest };

        const slots = new Uint16Array(256 * this.height);
        const columnTops = new Int32Array(256).fill(this.minY - 1);
        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                const source = this.columnIndex(this.chunkX * 16 + localX, this.chunkZ * 16 + localZ);
                if (source === -1) continue;

                const target = localX * 16 + localZ;
                columnTops[target] = this.highest[source]!;
                slots.set(this.states.subarray(source * this.height, (source + 1) * this.height), target * this.height);
            }
        }

        return { palette: this.palette, slots, columnTops };
    }

    /** Every non-air block the center chunk holds, for the translation pass. */
    public forEachCenterBlock(visit: (localX: number, y: number, localZ: number, block: RegionBlock) => void): void {
        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                const x = this.chunkX * 16 + localX;
                const z = this.chunkZ * 16 + localZ;
                const top = this.highest[this.columnIndex(x, z)]!;
                for (let y = this.minY; y <= top; y++) {
                    const block = this.blockAt(x, y, z);
                    if (block.java.name !== AIR) visit(localX, y, localZ, block);
                }
            }
        }
    }

    /**
     * Stamps a structure template, which `template` and `fossil` delegate to.
     *
     * @returns Whether any block landed, or false on a server that carries no templates, which
     *   is the same answer the feature gets for a placement the world refused.
     */
    private stampTemplate(request: TemplateRequest): boolean {
        const source = this.options.templates;
        if (source === undefined) return false;

        const target: TemplateTarget = {
            blockAt: (x, y, z) => this.stateAt(x, y, z),
            heightAt: (heightmap, x, z) => this.heightAt(heightmap, x, z),
            hasTag: (identifier, tag) => this.options.blocks.hasTag({ name: identifier, properties: {} }, tag),
            write: (x, y, z, state) => this.writeBedrock(x, y, z, state),
            setBlockEntity: (x, y, z, entity) => this.attachBlockEntity({ x, y, z }, entity)
        };

        return placeJavaTemplate(request, source, target, this.options.seed);
    }

    /**
     * Records a block entity against the block a feature just wrote.
     *
     * A position outside the region is dropped, the same way the block write that preceded it
     * was dropped, so the two never disagree about whether the block is there.
     */
    private attachBlockEntity(position: BlockPos, request: BlockEntityRequest): void {
        const index = this.indexOf(position.x, position.y, position.z);
        if (index === -1) return;

        const blockEntity = { x: position.x, y: position.y, z: position.z, request };
        this.blockEntities.set(index, blockEntity);
        if (this.trackingWrites) {
            this.trackedBlockEntityRemovals.delete(index);
            this.trackedBlockEntities.set(index, blockEntity);
        }
    }

    /**
     * Records an entity a feature built its blocks around.
     *
     * The feature names a block position, and an entity stands in the middle of its block, which
     * is where Java's `end_spike` puts the crystal it summons.
     */
    private recordEntity(type: string, position: BlockPos, yaw: number): void {
        this.spawnEntityAt(type, position.x + 0.5, position.y, position.z + 0.5, yaw);
    }

    /**
     * Records an entity at the position it stands on, which a structure template saves whole.
     *
     * A template's entities sit between blocks: a cushion is saved at y 0.9375 and a villager
     * in the middle of its block, so the coordinates are taken as given rather than snapped to
     * the block the entity happens to be over.
     */
    public spawnEntityAt(type: string, x: number, y: number, z: number, yaw: number): void {
        if (this.indexOf(Math.floor(x), Math.floor(y), Math.floor(z)) === -1) return;

        const spawn = { type, x, y, z, yaw };
        this.entitySpawns.push(spawn);
        if (this.trackingWrites) this.trackedEntitySpawns.push(spawn);
    }

    /** Whether a block column belongs to the chunk being generated rather than to a neighbor. */
    private isInCenterChunk(x: number, z: number): boolean {
        return x >> 4 === this.chunkX && z >> 4 === this.chunkZ;
    }

    /** A bare identifier as a state, memoized through the palette's own index. */
    private stateOf(name: string): BlockState {
        const slot = this.paletteIndex.get(name);
        if (slot !== undefined) return this.palette[slot]!.java;

        const state: BlockState = { name, properties: {} };
        this.paletteIndex.set(name, this.palette.push({ java: state }) - 1);
        return state;
    }

    private paletteSlotForName(name: string): number {
        const existing = this.paletteIndex.get(name);
        if (existing !== undefined) return existing;

        const slot = this.palette.push({ java: { name, properties: {} } }) - 1;
        this.paletteIndex.set(name, slot);
        return slot;
    }

    private trackWrite(index: number, x: number, y: number, z: number): void {
        if (!this.trackingWrites) return;

        this.trackedWrites.set(index, { x, y, z, block: this.palette[this.states[index]!]! });
    }

    private heightAt(heightmap: HeightmapType, x: number, z: number): number {
        const column = this.columnIndex(x, z);
        if (column === -1) return this.minY;

        const matches = this.heightmapPredicate(heightmap);
        for (let y = this.highest[column]!; y >= this.minY; y--) {
            if (matches(this.stateAt(x, y, z))) return y + 1;
        }

        return this.minY;
    }

    private paletteSlot(state: BlockState): number {
        const key = javaPaletteKey(state);

        const existing = this.paletteIndex.get(key);
        if (existing !== undefined) return existing;

        const slot = this.palette.push({ java: state }) - 1;
        this.paletteIndex.set(key, slot);
        return slot;
    }

    /**
     * The palette slot for a Bedrock state, in its own key space.
     *
     * The namespace matters: a Java `minecraft:bone_block[axis=y]` and the Bedrock state a
     * template resolved to the same block are different entries, because only the second one
     * reaches the chunk without a mapping lookup.
     */
    private bedrockSlot(state: BedrockBlockState): number {
        const key = bedrockPaletteKey(state);

        const existing = this.paletteIndex.get(key);
        if (existing !== undefined) return existing;

        const slot = this.palette.push({ java: { name: state.name, properties: {} }, bedrock: state }) - 1;
        this.paletteIndex.set(key, slot);
        return slot;
    }

    private indexOf(x: number, y: number, z: number): number {
        if (y < this.minY || y > this.maxY) return -1;

        const column = this.columnIndex(x, z);
        return column === -1 ? -1 : column * this.height + (y - this.minY);
    }

    private columnIndex(x: number, z: number): number {
        const localX = x - this.originX;
        const localZ = z - this.originZ;
        if (localX < 0 || localX >= this.width || localZ < 0 || localZ >= this.width) return -1;

        return localX * this.width + localZ;
    }

    private heightmapPredicate(heightmap: HeightmapType): (state: BlockState) => boolean {
        const blocks = this.options.blocks;
        switch (heightmap) {
            case 'WORLD_SURFACE':
            case 'WORLD_SURFACE_WG':
                return (state) => !blocks.isAir(state);
            case 'OCEAN_FLOOR':
            case 'OCEAN_FLOOR_WG':
                return (state) => blocks.isSolid(state);
            case 'MOTION_BLOCKING':
                return (state) => blocks.isSolid(state) || blocks.fluid(state) !== 'empty';
            case 'MOTION_BLOCKING_NO_LEAVES':
                return (state) =>
                    (blocks.isSolid(state) || blocks.fluid(state) !== 'empty') &&
                    !blocks.hasTag(state, 'minecraft:leaves');
        }
    }
}
