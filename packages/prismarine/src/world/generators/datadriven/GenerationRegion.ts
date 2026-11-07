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
    EntitySpawnOptions,
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

/** Keeps feature-view writes sparse while terrain blocks remain in their immutable source tiles. */
const READ_THROUGH_TERRAIN = Symbol('GenerationRegion read-through terrain');

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
    [READ_THROUGH_TERRAIN]?: true;
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
    /** The block an end crystal's beam points at, Java's `crystal_beam_target`. */
    readonly beamTarget?: BlockPos;
    /** Whether an end crystal renders its base plate; absent keeps the client default, true. */
    readonly showBottom?: boolean;
    /** Whether the entity ignores damage, Java's `crystal_invulnerable`. */
    readonly invulnerable?: boolean;
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

/** A chunk's Bedrock biome sections, compacted for a single worker transfer. */
export interface PackedBiomeSections {
    /** One id for a uniform section, or 4096 block ids for a nonuniform section. */
    readonly ids: Uint16Array<ArrayBuffer>;
    /** Start offsets for each section, with one trailing offset. */
    readonly offsets: Uint32Array<ArrayBuffer>;
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
    /** Compact per-section Bedrock biome IDs, transferred separately from the terrain tile. */
    readonly biomeSections?: ArrayBuffer;
    /** `Uint32Array` offsets delimiting each uniform or nonuniform section in `biomeSections`. */
    readonly biomeSectionOffsets?: ArrayBuffer;
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

/** A block position in world coordinates. */
export interface RegionBlockPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** Decoration output that belongs to one chunk. */
export interface RegionChunkPatch {
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly blocks: readonly RegionBlockWrite[];
    readonly blockEntityRemovals: readonly RegionBlockEntityRemoval[];
    readonly blockEntities: readonly RegionBlockEntity[];
    readonly entitySpawns: readonly RegionEntitySpawn[];
    /**
     * The positions among {@link RegionChunkPatch.blocks} a structure piece wrote.
     *
     * A structure's blocks win over a feature from another chunk, whichever of the two Java
     * would have run first: decorated earlier, the feature tests against the structure's blocks
     * and leaves them; decorated later, the piece writes over whatever the feature placed. A
     * neighbor's pass here decorates against bare terrain and never sees the pieces, so the
     * merge is where that outcome is kept - an inbound write at one of these positions is
     * dropped.
     */
    readonly structureBlocks: readonly RegionBlockPosition[];
}

interface MutableRegionPatch {
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly blocks: RegionBlockWrite[];
    readonly blockEntityRemovals: RegionBlockEntityRemoval[];
    readonly blockEntities: RegionBlockEntity[];
    readonly entitySpawns: RegionEntitySpawn[];
    readonly structureBlocks: RegionBlockPosition[];
}

/** The ground cover blocks no tag lists: Java 26.3's leaf litter and wildflowers. */
const GROUND_COVER_NAMES: ReadonlySet<string> = new Set([
    'minecraft:leaf_litter',
    'minecraft:wildflowers',
    'minecraft:short_grass',
    'minecraft:tall_grass',
    'minecraft:fern',
    'minecraft:large_fern',
    'minecraft:firefly_bush',
    'minecraft:bush',
    'minecraft:sweet_berry_bush',
    'minecraft:dead_bush',
    'minecraft:nether_sprouts',
    'minecraft:crimson_roots',
    'minecraft:warped_roots'
]);

/** What {@link GenerationRegion.applyPatch} leaves alone. */
export interface ApplyPatchOptions {
    /**
     * Positions the patch may not write. The chunk's own structure blocks, when the patch is a
     * neighbor's; see {@link RegionChunkPatch.structureBlocks}.
     */
    readonly keep?: readonly RegionBlockPosition[];
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
    private terrainSources: readonly (GenerationRegion | undefined)[] | undefined;
    private readonly sparseWrites: Map<number, number> | undefined;
    private hasSparseWrites = false;
    private palette: RegionBlock[] = [{ java: AIR_STATE }];
    private paletteIndex = new Map<string, number>([[AIR, 0]]);
    private isAirByPaletteSlot: boolean[] = [];
    private biomeSectionIds: Uint16Array<ArrayBuffer> | undefined;
    private biomeSectionOffsets: Uint32Array<ArrayBuffer> | undefined;

    /** Lazily computed heightmaps, one entry per heightmap and region column. */
    private readonly heightmapCaches = new Map<HeightmapType, Int32Array<ArrayBuffer>>();
    /** Predicates are shared across lookups so a height query does not allocate a closure. */
    private readonly heightmapPredicates = new Map<HeightmapType, (state: BlockState) => boolean>();

    /** The highest y holding anything other than air, per region column. */
    private highest: Int32Array<ArrayBuffer>;

    /** The block entities features attached, keyed by the same index the states use. */
    private blockEntities = new Map<number, RegionBlockEntity>();

    /** The entities features asked for, in the order they asked. */
    private entitySpawns: RegionEntitySpawn[] = [];

    private trackingWrites = false;
    /** Whether the writes arriving now come from a structure piece; see {@link GenerationRegion.withStructureWrites}. */
    private placingStructure = false;
    private readonly trackedWrites = new Map<number, RegionBlockWrite>();
    private readonly trackedStructureWrites = new Map<number, RegionBlockPosition>();
    private readonly trackedBlockEntityRemovals = new Map<number, RegionBlockEntityRemoval>();
    private readonly trackedBlockEntities = new Map<number, RegionBlockEntity>();
    private readonly trackedEntitySpawns: RegionEntitySpawn[] = [];

    /** The `WORLD_SURFACE_WG` heights frozen after the terrain fill, as Java freezes them. */
    private frozenSurface: Int32Array<ArrayBuffer> | null = null;
    /** Whether the fresh-terrain writer may still skip generic per-write bookkeeping. */
    private directTerrainWriting = false;

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
        this.states = new Uint16Array(options[READ_THROUGH_TERRAIN] ? 0 : this.width * this.width * options.height);
        this.terrainSources = undefined;
        this.sparseWrites = options[READ_THROUGH_TERRAIN] ? new Map() : undefined;
        this.highest = new Int32Array(this.width * this.width).fill(options.minY - 1);
        this.isAirByPaletteSlot = [options.blocks.isAir(AIR_STATE)];
    }

    /**
     * Builds a feature view over nine immutable terrain tiles, with only its writes stored locally.
     *
     * @internal The terrain tiles are read-only for the life of this view; writes and patches
     *   belong to this feature pass alone.
     * @param options - Feature-view geometry and world readers.
     * @param tiles - The nine completed radius-zero terrain tiles around the center chunk.
     * @returns An isolated feature view that does not copy the tiles' block-state arrays.
     */
    public static featureView(options: GenerationRegionOptions, tiles: readonly GenerationRegion[]): GenerationRegion {
        if (tiles.length !== 9) throw new RangeError('A feature view needs nine terrain tiles.');

        const sources: (GenerationRegion | undefined)[] = new Array(9);
        for (const tile of tiles) {
            if (tile.radius !== 0 || tile.minY !== options.minY || tile.maxY !== options.minY + options.height - 1) {
                throw new RangeError('Feature-view terrain tiles must be radius-zero and match its vertical extent.');
            }

            const relativeX = tile.chunkX - options.chunkX;
            const relativeZ = tile.chunkZ - options.chunkZ;
            if (Math.abs(relativeX) > FEATURE_RADIUS || Math.abs(relativeZ) > FEATURE_RADIUS) {
                throw new RangeError('Feature-view terrain tiles must fit its three by three window.');
            }
            const index = (relativeX + FEATURE_RADIUS) * 3 + relativeZ + FEATURE_RADIUS;
            if (sources[index] !== undefined) throw new RangeError('A feature view needs distinct terrain tiles.');
            sources[index] = tile;
        }

        if (sources.some((tile) => tile === undefined)) {
            throw new RangeError('A feature view needs every terrain tile in its three by three window.');
        }

        const view = new GenerationRegion({ ...options, radius: FEATURE_RADIUS, [READ_THROUGH_TERRAIN]: true });
        view.terrainSources = sources;

        for (const tile of tiles) {
            for (let localX = 0; localX < 16; localX++) {
                for (let localZ = 0; localZ < 16; localZ++) {
                    const x = tile.chunkX * 16 + localX;
                    const z = tile.chunkZ * 16 + localZ;
                    const sourceColumn = tile.columnIndex(x, z);
                    const targetColumn = view.columnIndex(x, z);
                    if (sourceColumn === -1 || targetColumn === -1) continue;

                    view.highest[targetColumn] = tile.highest[sourceColumn]!;
                    if (tile.frozenSurface !== null) {
                        view.frozenSurface ??= new Int32Array(view.highest.length).fill(options.minY - 1);
                        view.frozenSurface[targetColumn] = tile.frozenSurface[sourceColumn]!;
                    }
                }
            }

            for (const blockEntity of tile.centerBlockEntities()) {
                view.attachBlockEntity({ x: blockEntity.x, y: blockEntity.y, z: blockEntity.z }, blockEntity.request);
            }
            view.entitySpawns.push(...tile.centerEntitySpawns());
        }

        return view;
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
        this.directTerrainWriting = false;
        const biomeSections = this.biomeSectionIds;
        const biomeSectionOffsets = this.biomeSectionOffsets;
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
            ...(biomeSections === undefined || biomeSectionOffsets === undefined
                ? {}
                : {
                      biomeSections: biomeSections.buffer,
                      biomeSectionOffsets: biomeSectionOffsets.buffer
                  }),
            blockEntities: [...this.blockEntities],
            entitySpawns: this.entitySpawns
        };

        const transferList = [this.states.buffer, this.highest.buffer];
        if (this.frozenSurface !== null) transferList.push(this.frozenSurface.buffer);
        if (biomeSections !== undefined && biomeSectionOffsets !== undefined) {
            transferList.push(biomeSections.buffer, biomeSectionOffsets.buffer);
        }

        return { payload, transferList };
    }

    /**
     * Describes this immutable terrain tile for a worker task without spending its buffers.
     *
     * `GenerationPool` structured-clones task input before the worker sees it, so its copies
     * cannot mutate this region. This is for the read-only terrain tiles a feature pass needs;
     * callers that hand a tile away must use {@link GenerationRegion.transfer} instead.
     *
     * @returns A payload view whose buffers remain owned by this region.
     */
    public workerInput(): GenerationRegionPayload {
        this.directTerrainWriting = false;
        return {
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
        region.isAirByPaletteSlot = region.palette.map((block) => options.blocks.isAir(block.java));
        region.states = new Uint16Array(payload.states);
        region.highest = new Int32Array(payload.highest);
        region.frozenSurface = payload.frozenSurface === undefined ? null : new Int32Array(payload.frozenSurface);
        if ((payload.biomeSections === undefined) !== (payload.biomeSectionOffsets === undefined)) {
            throw new RangeError('A generation region must carry both biome section buffers or neither');
        }
        if (payload.biomeSections !== undefined && payload.biomeSectionOffsets !== undefined) {
            region.setBiomeSections({
                ids: new Uint16Array(payload.biomeSections),
                offsets: new Uint32Array(payload.biomeSectionOffsets)
            });
        }
        region.blockEntities = new Map(payload.blockEntities);
        region.entitySpawns = [...payload.entitySpawns];
        return region;
    }

    /** Stores the biome IDs computed for this chunk, ready for promotion or transfer. */
    public setBiomeSections(sections: PackedBiomeSections): void {
        const { ids, offsets } = sections;
        if (offsets.length < 2 || offsets[0] !== 0 || offsets.at(-1) !== ids.length) {
            throw new RangeError('Biome section offsets must span the biome ID buffer');
        }

        for (let section = 0; section < offsets.length - 1; section++) {
            const length = offsets[section + 1]! - offsets[section]!;
            if (length !== 1 && length !== 4096) {
                throw new RangeError(`Biome section ${section} must hold one or 4096 IDs, got ${length}`);
            }
        }

        this.biomeSectionIds = ids;
        this.biomeSectionOffsets = offsets;
    }

    /** One section's biome IDs, either a uniform id or its packed 16³ blocks. */
    public biomeSection(index: number): number | Uint16Array<ArrayBuffer> | undefined {
        const ids = this.biomeSectionIds;
        const offsets = this.biomeSectionOffsets;
        if (ids === undefined || offsets === undefined) return undefined;

        const start = offsets[index];
        const end = offsets[index + 1];
        if (start === undefined || end === undefined) return undefined;
        if (end - start === 1) return ids[start];
        return ids.subarray(start, end);
    }

    /** The state at a block position, air outside the region. */
    public stateAt(x: number, y: number, z: number): BlockState {
        return this.blockAt(x, y, z).java;
    }

    /** The palette entry at a block position, air outside the region. */
    public blockAt(x: number, y: number, z: number): RegionBlock {
        const index = this.indexOf(x, y, z);
        if (index === -1) return this.palette[0]!;

        // Avoid a Map lookup on every feature read until this view has an overlay to consult.
        const written = this.hasSparseWrites ? this.sparseWrites?.get(index) : undefined;
        if (written !== undefined) return this.palette[written]!;

        if (this.terrainSources !== undefined) {
            const chunkX = Math.floor(x / 16);
            const chunkZ = Math.floor(z / 16);
            const relativeX = chunkX - this.chunkX + FEATURE_RADIUS;
            const relativeZ = chunkZ - this.chunkZ + FEATURE_RADIUS;
            const source = this.terrainSources[relativeX * 3 + relativeZ];
            const block = source?.blockAt(x, y, z);
            return block === undefined || block.java.name === AIR ? this.palette[0]! : block;
        }

        return this.palette[this.states[index]!]!;
    }

    /** Writes a state, ignoring a position outside the region. Returns whether it landed. */
    public write(x: number, y: number, z: number, state: BlockState): boolean {
        const index = this.indexOf(x, y, z);
        if (index === -1) return false;

        this.writeResolvedSlot(index, x, y, z, this.paletteSlot(state));
        return true;
    }

    /** Writes a name-only state without allocating a `BlockState` for terrain samples. */
    public writeName(x: number, y: number, z: number, name: string): boolean {
        const index = this.indexOf(x, y, z);
        if (index === -1) return false;

        this.writeResolvedSlot(index, x, y, z, this.paletteSlotForName(name));
        return true;
    }

    /**
     * Creates the direct writer for a fresh terrain tile.
     *
     * Terrain writes happen before heightmap reads, block entities, or write tracking. That lets
     * this writer update the palette slot and column ceiling directly; later stages use
     * {@link writeName}, which keeps the full per-write bookkeeping.
     *
     * @internal Used only by the datadriven terrain sampler before the tile is exposed.
     * @returns A terrain writer scoped to this fresh region.
     */
    public createTerrainNameWriter(): (x: number, y: number, z: number, name: string) => boolean {
        if (
            this.sparseWrites !== undefined ||
            this.trackingWrites ||
            this.blockEntities.size !== 0 ||
            this.heightmapCaches.size !== 0 ||
            this.frozenSurface !== null ||
            this.palette.length !== 1
        ) {
            throw new Error('A terrain name writer requires a fresh, untracked region');
        }
        this.directTerrainWriting = true;

        const slots = new Map<string, number>();
        let previousName: string | undefined;
        let previousSlot = 0;

        return (x, y, z, name) => {
            if (!this.directTerrainWriting) return this.writeName(x, y, z, name);
            if (y < this.minY || y > this.maxY) return false;
            const column = this.columnIndex(x, z);
            if (column === -1) return false;
            const index = column * this.height + (y - this.minY);

            let slot: number | undefined;
            if (name === previousName) {
                slot = previousSlot;
            } else {
                slot = slots.get(name);
                if (slot === undefined) {
                    slot = this.paletteSlotForName(name);
                    slots.set(name, slot);
                }
                previousName = name;
                previousSlot = slot;
            }

            // Air writes need the ordinary clearing path; terrain fill skips them, but this
            // keeps the writer correct if a sampler result or caller includes air explicitly.
            if (this.isAirByPaletteSlot[slot]) this.writeResolvedSlot(index, x, y, z, slot);
            else {
                // Fresh terrain has no heightmap cache, block entities, or tracking to invalidate.
                this.states[index] = slot;
                if (y > this.highest[column]!) this.highest[column] = y;
            }
            return true;
        };
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

        this.writeResolvedSlot(index, x, y, z, this.bedrockSlot(state));
        return true;
    }

    /** Starts collecting decoration writes so neighboring chunks can receive their share. */
    public beginWriteTracking(): void {
        this.directTerrainWriting = false;
        this.trackingWrites = true;
        this.trackedWrites.clear();
        this.trackedStructureWrites.clear();
        this.trackedBlockEntityRemovals.clear();
        this.trackedBlockEntities.clear();
        this.trackedEntitySpawns.length = 0;
    }

    /**
     * Runs a structure piece's placement, marking what it writes as the structure's.
     *
     * The marks ride along in the patches as {@link RegionChunkPatch.structureBlocks}. A later
     * write at the same position by a feature of this pass takes the mark away again, because
     * that feature saw the structure's block and Java would have let it through too.
     */
    public withStructureWrites<T>(place: () => T): T {
        const wasPlacing = this.placingStructure;
        this.placingStructure = true;
        try {
            return place();
        } finally {
            this.placingStructure = wasPlacing;
        }
    }

    /** Returns the writes grouped by destination chunk, then stops tracking. */
    public takeTrackedPatches(): readonly RegionChunkPatch[] {
        this.trackingWrites = false;
        const patches = new Map<string, MutableRegionPatch>();
        const patchFor = (chunkX: number, chunkZ: number): MutableRegionPatch => {
            const key = `${chunkX},${chunkZ}`;
            let patch = patches.get(key);
            if (patch === undefined) {
                patch = {
                    chunkX,
                    chunkZ,
                    blocks: [],
                    blockEntityRemovals: [],
                    blockEntities: [],
                    entitySpawns: [],
                    structureBlocks: []
                };
                patches.set(key, patch);
            }
            return patch;
        };

        for (const write of this.trackedWrites.values()) {
            patchFor(Math.floor(write.x / 16), Math.floor(write.z / 16)).blocks.push(write);
        }
        for (const position of this.trackedStructureWrites.values()) {
            patchFor(Math.floor(position.x / 16), Math.floor(position.z / 16)).structureBlocks.push(position);
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
        this.trackedStructureWrites.clear();
        this.trackedBlockEntityRemovals.clear();
        this.trackedBlockEntities.clear();
        this.trackedEntitySpawns.length = 0;
        return [...patches.values()];
    }

    /** Copies another tile's center terrain and frozen surface heights into this region. */
    public copyCenterFrom(source: GenerationRegion): void {
        this.directTerrainWriting = false;
        if (source.minY !== this.minY || source.maxY !== this.maxY) {
            throw new RangeError('Cannot combine generation regions with different vertical extents');
        }

        // Move the source palette indices in bulk so this merge does not allocate a RegionBlock
        // and sort state properties for every block.
        const destinationSlots = source.palette.map((block, slot) => {
            if (slot === 0) return 0;
            const destinationSlot =
                block.bedrock === undefined ? this.paletteSlot(block.java) : this.bedrockSlot(block.bedrock);
            return block.java.name === AIR ? 0 : destinationSlot;
        });
        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                const x = source.chunkX * 16 + localX;
                const z = source.chunkZ * 16 + localZ;
                const sourceColumn = source.columnIndex(x, z);
                const targetColumn = this.columnIndex(x, z);
                if (sourceColumn === -1 || targetColumn === -1) continue;

                const sourceTop = source.highest[sourceColumn]!;
                let copiedState = false;
                for (let y = this.minY; y <= sourceTop; y++) {
                    const sourceIndex = sourceColumn * this.height + (y - this.minY);
                    const sourceSlot = source.states[sourceIndex]!;
                    if (sourceSlot === 0) continue;

                    const targetIndex = targetColumn * this.height + (y - this.minY);
                    const targetSlot = destinationSlots[sourceSlot]!;
                    if (targetSlot === 0) continue;
                    const block = this.palette[targetSlot]!;

                    this.states[targetIndex] = targetSlot;
                    copiedState = true;
                    this.blockEntities.delete(targetIndex);
                    if (this.trackingWrites) {
                        this.trackedBlockEntities.delete(targetIndex);
                        this.trackedWrites.set(targetIndex, { x, y, z, block });
                    }
                    if (y > this.highest[targetColumn]!) this.highest[targetColumn] = y;
                }
                if (copiedState) this.invalidateHeightmapCache(targetColumn);
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

    /**
     * Applies a feature pass's writes to this region.
     *
     * @param patch - The writes, this chunk's own or a neighbor's.
     * @param options - What to leave alone. A write, a block entity or its removal at a kept
     *   position is dropped; an entity spawn is kept, because it stands in the world rather
     *   than in a block.
     */
    public applyPatch(patch: RegionChunkPatch, options: ApplyPatchOptions = {}): void {
        this.directTerrainWriting = false;
        const kept = new Set<number>();
        for (const position of options.keep ?? []) {
            const index = this.indexOf(position.x, position.y, position.z);
            if (index !== -1) kept.add(index);
        }
        const isKept = (x: number, y: number, z: number): boolean => kept.size > 0 && kept.has(this.indexOf(x, y, z));

        for (const removal of patch.blockEntityRemovals) {
            const index = this.indexOf(removal.x, removal.y, removal.z);
            if (index !== -1 && !kept.has(index)) this.blockEntities.delete(index);
        }
        for (const write of patch.blocks) {
            if (isKept(write.x, write.y, write.z)) continue;
            // A patch was drawn against terrain that did not hold the blocks another chunk's
            // trees put here, so its grass and leaf litter believe this spot is air. Java's
            // ground cover only goes where the block is replaceable; it must not erase a trunk.
            if (
                write.block.bedrock === undefined &&
                this.isGroundCover(write.block.java) &&
                !this.isOpenSpace(this.stateAt(write.x, write.y, write.z))
            )
                continue;
            if (write.block.bedrock === undefined) this.write(write.x, write.y, write.z, write.block.java);
            else this.writeBedrock(write.x, write.y, write.z, write.block.bedrock);
        }
        for (const blockEntity of patch.blockEntities) {
            if (isKept(blockEntity.x, blockEntity.y, blockEntity.z)) continue;
            this.attachBlockEntity({ x: blockEntity.x, y: blockEntity.y, z: blockEntity.z }, blockEntity.request);
        }
        this.entitySpawns.push(...patch.entitySpawns);
    }

    /** Whether a block is one of the plants a ground cover feature scatters: grass, ferns, flowers and leaf litter. */
    private isGroundCover(state: BlockState): boolean {
        // Not `#replaceable`, which also lists air, water and fire: a write of air is a carve, not a plant.
        return GROUND_COVER_NAMES.has(state.name) || this.options.blocks.hasTag(state, 'minecraft:flowers');
    }

    /** Whether ground cover may go over a block: air, water, or a plant of the same kind. */
    private isOpenSpace(state: BlockState): boolean {
        return (
            state.name === 'minecraft:air' ||
            state.name === 'minecraft:cave_air' ||
            state.name === 'minecraft:water' ||
            this.isGroundCover(state)
        );
    }

    /** The bookkeeping every write does once its state has landed in the buffer. */
    private afterWrite(index: number, x: number, y: number, z: number): void {
        // A block entity belongs to the block it was attached to, so overwriting that block
        // takes it away, as Java's `setBlock` does.
        const removedBlockEntity = this.blockEntities.get(index);
        if (removedBlockEntity !== undefined) {
            if (this.trackingWrites) this.trackedBlockEntityRemovals.set(index, { x, y, z });
            this.blockEntities.delete(index);
        }
        if (this.trackingWrites) this.trackedBlockEntities.delete(index);

        const column = this.columnIndex(x, z);
        this.invalidateHeightmapCache(column);
        const written = this.sparseWrites?.get(index);
        const isAir =
            written === undefined ? this.isAirByPaletteSlot[this.states[index]!]! : this.isAirByPaletteSlot[written]!;
        if (!isAir) {
            if (y > this.highest[column]!) this.highest[column] = y;
        } else if (y === this.highest[column]) {
            // Removing the topmost block drops the column's ceiling to the next one down.
            let nextY = y - 1;
            if (this.sparseWrites === undefined) {
                let nextIndex = index - 1;
                while (nextY >= this.minY && this.isAirByPaletteSlot[this.states[nextIndex]!]!) {
                    nextY--;
                    nextIndex--;
                }
            } else {
                while (nextY >= this.minY && this.options.blocks.isAir(this.blockAt(x, nextY, z).java)) nextY--;
            }
            this.highest[column] = nextY;
        }
    }

    /**
     * Freezes the `WORLD_SURFACE_WG` heightmap, which Java does once the terrain fill is done.
     *
     * The surface pass reads it while writing into the same columns, so taking it live would
     * let a column's new grass move the surface the next rule reads.
     */
    public freezeSurfaceHeights(): void {
        this.directTerrainWriting = false;
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
                this.writeName(x, y, z, state);
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
            spawnEntity: (type, position, options) => this.recordEntity(type, position, options),
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
                    const index = this.indexOf(x, y, z);
                    const slot = this.states[index]!;
                    if (!this.isAirByPaletteSlot[slot]!) visit(localX, y, localZ, this.palette[slot]!);
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
        this.directTerrainWriting = false;
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
    private recordEntity(type: string, position: BlockPos, options: EntitySpawnOptions | undefined): void {
        this.spawnEntityAt(type, position.x + 0.5, position.y, position.z + 0.5, options?.yaw ?? 0, options);
    }

    /**
     * Records an entity at the position it stands on, which a structure template saves whole.
     *
     * A template's entities sit between blocks: a cushion is saved at y 0.9375 and a villager
     * in the middle of its block, so the coordinates are taken as given rather than snapped to
     * the block the entity happens to be over.
     *
     * @param options - What the spawn carries beyond its yaw: an end crystal's beam target, its
     * base plate flag and its invulnerability.
     */
    public spawnEntityAt(
        type: string,
        x: number,
        y: number,
        z: number,
        yaw: number,
        options?: Omit<EntitySpawnOptions, 'yaw'>
    ): void {
        if (this.indexOf(Math.floor(x), Math.floor(y), Math.floor(z)) === -1) return;

        const spawn: RegionEntitySpawn = {
            type,
            x,
            y,
            z,
            yaw,
            ...(options?.beamTarget === undefined ? {} : { beamTarget: options.beamTarget }),
            ...(options?.showBottom === undefined ? {} : { showBottom: options.showBottom }),
            ...(options?.invulnerable === undefined ? {} : { invulnerable: options.invulnerable })
        };
        this.entitySpawns.push(spawn);
        if (this.trackingWrites) this.trackedEntitySpawns.push(spawn);
    }

    /** Whether a block column belongs to the chunk being generated rather than to a neighbor. */
    private isInCenterChunk(x: number, z: number): boolean {
        return x >> 4 === this.chunkX && z >> 4 === this.chunkZ;
    }

    private paletteSlotForName(name: string): number {
        const existing = this.paletteIndex.get(name);
        if (existing !== undefined) return existing;

        const slot = this.addPaletteBlock({ java: { name, properties: {} } });
        this.paletteIndex.set(name, slot);
        return slot;
    }

    /** Writes one already resolved slot and keeps every per-write region invariant current. */
    private writeResolvedSlot(index: number, x: number, y: number, z: number, slot: number): void {
        this.writeSlot(index, slot);
        this.afterWrite(index, x, y, z);
        this.trackWrite(index, x, y, z);
    }

    private trackWrite(index: number, x: number, y: number, z: number): void {
        if (!this.trackingWrites) return;

        this.trackedWrites.set(index, { x, y, z, block: this.blockAt(x, y, z) });
        if (this.placingStructure) this.trackedStructureWrites.set(index, { x, y, z });
        else this.trackedStructureWrites.delete(index);
    }

    /** Writes a palette slot into this region or its task-local sparse overlay. */
    private writeSlot(index: number, slot: number): void {
        this.directTerrainWriting = false;
        if (this.sparseWrites === undefined) this.states[index] = slot;
        else {
            this.sparseWrites.set(index, slot);
            this.hasSparseWrites = true;
        }
    }

    private heightAt(heightmap: HeightmapType, x: number, z: number): number {
        const column = this.columnIndex(x, z);
        if (column === -1) return this.minY;

        let cache = this.heightmapCaches.get(heightmap);
        if (cache === undefined) {
            this.directTerrainWriting = false;
            // A valid heightmap answer is at least minY, so minY - 1 marks an uncached column.
            cache = new Int32Array(this.highest.length).fill(this.minY - 1);
            this.heightmapCaches.set(heightmap, cache);
        }
        const cachedHeight = cache[column]!;
        if (cachedHeight !== this.minY - 1) return cachedHeight;

        const matches = this.heightmapPredicate(heightmap);
        for (let y = this.highest[column]!; y >= this.minY; y--) {
            if (matches(this.stateAt(x, y, z))) {
                cache[column] = y + 1;
                return y + 1;
            }
        }

        cache[column] = this.minY;
        return this.minY;
    }

    /** Invalidates heightmap answers after a block changes in one column. */
    private invalidateHeightmapCache(column: number): void {
        for (const cache of this.heightmapCaches.values()) cache[column] = this.minY - 1;
    }

    private paletteSlot(state: BlockState): number {
        const key = javaPaletteKey(state);

        const existing = this.paletteIndex.get(key);
        if (existing !== undefined) return existing;

        const slot = this.addPaletteBlock({ java: state });
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

        const slot = this.addPaletteBlock({ java: { name: state.name, properties: {} }, bedrock: state });
        this.paletteIndex.set(key, slot);
        return slot;
    }

    private addPaletteBlock(block: RegionBlock): number {
        const slot = this.palette.push(block) - 1;
        this.isAirByPaletteSlot[slot] = this.options.blocks.isAir(block.java);
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
        const cached = this.heightmapPredicates.get(heightmap);
        if (cached !== undefined) return cached;

        const blocks = this.options.blocks;
        let matches: (state: BlockState) => boolean;
        switch (heightmap) {
            case 'WORLD_SURFACE':
            case 'WORLD_SURFACE_WG':
                matches = (state) => !blocks.isAir(state);
                break;
            case 'OCEAN_FLOOR':
            case 'OCEAN_FLOOR_WG':
                matches = (state) => blocks.isSolid(state);
                break;
            case 'MOTION_BLOCKING':
                matches = (state) => blocks.isSolid(state) || blocks.fluid(state) !== 'empty';
                break;
            case 'MOTION_BLOCKING_NO_LEAVES':
                matches = (state) =>
                    (blocks.isSolid(state) || blocks.fluid(state) !== 'empty') &&
                    !blocks.hasTag(state, 'minecraft:leaves');
                break;
        }
        this.heightmapPredicates.set(heightmap, matches);
        return matches;
    }
}
