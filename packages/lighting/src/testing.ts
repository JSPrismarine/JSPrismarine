/**
 * A typed {@link BlockLightView} double for tests, in the published package so servers and plugins
 * can test their own light consumers against it. Blocks live in a `Map`, every chunk is loaded
 * until {@link TestBlockLightView.unloadChunk} says otherwise, and nothing here is tuned for speed.
 */
import type { BlockLightProperties, BlockLightView } from './BlockLightView';
import { chunkOf, columnKeyOf } from './coordinates';

/** A block that neither emits nor swallows light. The double answers with it where nothing was placed. */
export const AIR: BlockLightProperties = Object.freeze({ lightEmission: 0, lightDampening: 0 });

/**
 * A {@link BlockLightProperties} value with the unstated field defaulted to 0.
 * @param {Partial<BlockLightProperties>} properties - The fields that matter to the test.
 * @returns {BlockLightProperties} The complete properties.
 * @example
 * ```typescript
 * const stone = lightBlock({ lightDampening: 15 });
 * const torch = lightBlock({ lightEmission: 14 });
 * ```
 */
export const lightBlock = (properties: Partial<BlockLightProperties>): BlockLightProperties =>
    Object.freeze({ lightEmission: 0, lightDampening: 0, ...properties });

/** The dimension shape a {@link TestBlockLightView} reports. Defaults describe an overworld. */
export interface TestBlockLightViewOptions {
    /** The lowest block y, inclusive. Default -64. */
    readonly minY?: number;
    /** One past the highest block y. Default 320. */
    readonly maxY?: number;
    /** Whether the dimension has a sky. Default true. */
    readonly hasSkyLight?: boolean;
}

/** An in-memory {@link BlockLightView} whose contents and loaded chunks a test sets directly. */
export class TestBlockLightView implements BlockLightView {
    /** The lowest block y, inclusive. */
    public readonly minY: number;
    /** One past the highest block y. */
    public readonly maxY: number;
    /** Whether the dimension has a sky. */
    public readonly hasSkyLight: boolean;

    private readonly blocks = new Map<string, BlockLightProperties>();
    private readonly unloaded = new Set<number>();

    public constructor(options: TestBlockLightViewOptions = {}) {
        this.minY = options.minY ?? -64;
        this.maxY = options.maxY ?? 320;
        this.hasSkyLight = options.hasSkyLight ?? true;
    }

    /**
     * The block at a world position, or `undefined` when its chunk is unloaded.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @returns {BlockLightProperties | undefined} The block, {@link AIR} where none was placed, or
     * `undefined` for an unloaded chunk.
     */
    public blockAt(x: number, y: number, z: number): BlockLightProperties | undefined {
        if (this.unloaded.has(columnKeyOf(chunkOf(x), chunkOf(z)))) return undefined;

        return this.blocks.get(`${x},${y},${z}`) ?? AIR;
    }

    /**
     * Puts a block at a world position, replacing whatever was there.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {BlockLightProperties} block - The block to place.
     * @returns {BlockLightProperties} The block that was there before, {@link AIR} if none.
     */
    public place(x: number, y: number, z: number, block: BlockLightProperties): BlockLightProperties {
        const key = `${x},${y},${z}`;
        const previous = this.blocks.get(key) ?? AIR;
        this.blocks.set(key, block);

        return previous;
    }

    /**
     * Makes a chunk answer `undefined`, as an unloaded chunk does.
     * @param {number} chunkX - The chunk x.
     * @param {number} chunkZ - The chunk z.
     */
    public unloadChunk(chunkX: number, chunkZ: number): void {
        this.unloaded.add(columnKeyOf(chunkX, chunkZ));
    }

    /**
     * Makes a previously unloaded chunk answer with its blocks again.
     * @param {number} chunkX - The chunk x.
     * @param {number} chunkZ - The chunk z.
     */
    public loadChunk(chunkX: number, chunkZ: number): void {
        this.unloaded.delete(columnKeyOf(chunkX, chunkZ));
    }
}
