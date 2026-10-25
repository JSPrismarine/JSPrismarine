/**
 * The Java-shaped scratch buffer one chunk is generated in.
 *
 * Every stage above the chunk storage speaks Java Edition block states: the terrain sampler,
 * the surface pass, the carvers and the features all name Java identifiers with Java property
 * names. Translating per write would cost a mapping lookup for each of a chunk's roughly 18000
 * placements, so the whole chunk is built here and translated once at the end.
 *
 * The region is three chunks square, centered on the chunk being generated, because Java's
 * `WorldGenRegion` lets a feature spill into its neighbors. Only the center chunk is kept: a
 * tree that crosses into a neighbor is clipped at the border, where Java carries it over into
 * that neighbor's saved chunk.
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

/** The chunk radius a feature may write into, which is Java's `WorldGenRegion` size. */
const REGION_RADIUS = 1;
const REGION_CHUNKS = REGION_RADIUS * 2 + 1;
const REGION_WIDTH = REGION_CHUNKS * 16;

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
 * A three by three chunk window of Java block states.
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
    private readonly originX: number;
    private readonly originZ: number;
    private readonly states: Uint16Array;
    private readonly palette: RegionBlock[] = [{ java: AIR_STATE }];
    private readonly paletteIndex = new Map<string, number>([[AIR, 0]]);

    /** The highest y holding anything other than air, per region column. */
    private readonly highest: Int32Array;

    /** The block entities features attached, keyed by the same index the states use. */
    private readonly blockEntities = new Map<number, RegionBlockEntity>();

    /** The entities features asked for, in the order they asked. */
    private readonly entitySpawns: RegionEntitySpawn[] = [];

    /** The `WORLD_SURFACE_WG` heights frozen after the terrain fill, as Java freezes them. */
    private frozenSurface: Int32Array | null = null;

    public constructor(private readonly options: GenerationRegionOptions) {
        this.chunkX = options.chunkX;
        this.chunkZ = options.chunkZ;
        this.minY = options.minY;
        this.height = options.height;
        this.maxY = options.minY + options.height - 1;

        this.originX = (options.chunkX - REGION_RADIUS) * 16;
        this.originZ = (options.chunkZ - REGION_RADIUS) * 16;
        this.states = new Uint16Array(REGION_WIDTH * REGION_WIDTH * options.height);
        this.highest = new Int32Array(REGION_WIDTH * REGION_WIDTH).fill(options.minY - 1);
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
        return true;
    }

    /** The bookkeeping every write does once its state has landed in the buffer. */
    private afterWrite(index: number, x: number, y: number, z: number, isAir: boolean): void {
        // A block entity belongs to the block it was attached to, so overwriting that block
        // takes it away, as Java's `setBlock` does.
        if (this.blockEntities.size > 0) this.blockEntities.delete(index);

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
            write: (x, y, z, state) => this.writeBedrock(x, y, z, state)
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

        this.blockEntities.set(index, { x: position.x, y: position.y, z: position.z, request });
    }

    /**
     * Records an entity a feature built its blocks around.
     *
     * The feature names a block position, and an entity stands in the middle of its block, which
     * is where Java's `end_spike` puts the crystal it summons.
     */
    private recordEntity(type: string, position: BlockPos, yaw: number): void {
        if (this.indexOf(position.x, position.y, position.z) === -1) return;

        this.entitySpawns.push({ type, x: position.x + 0.5, y: position.y, z: position.z + 0.5, yaw });
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
        const keys = Object.keys(state.properties).sort();
        const key =
            keys.length === 0
                ? state.name
                : `${state.name}[${keys.map((property) => `${property}=${state.properties[property]}`).join(',')}]`;

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
        const keys = Object.keys(state.states).sort();
        const key = `bedrock|${state.name}[${keys.map((name) => `${name}=${state.states[name]}`).join(',')}]`;

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
        if (localX < 0 || localX >= REGION_WIDTH || localZ < 0 || localZ >= REGION_WIDTH) return -1;

        return localX * REGION_WIDTH + localZ;
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
