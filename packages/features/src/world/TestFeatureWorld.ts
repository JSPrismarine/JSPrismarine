import type { BlockState, FluidKind } from './BlockState';
import { blockState, blockStateKey } from './BlockState';
import type { BlockOracle, BlockPos, FeatureWorld, HeightmapType } from './FeatureWorld';
import { posKey } from './FeatureWorld';

/** The state every unwritten position holds. */
export const AIR = blockState('minecraft:air');

/** What a caller may declare about the blocks a test uses. */
export interface TestOracleTables {
    /** Identifiers that count as air. Defaults to the three vanilla air blocks. */
    readonly air?: readonly string[];
    /** Identifiers that hold a fluid, and which one. Waterlogged states are detected separately. */
    readonly fluids?: Readonly<Record<string, FluidKind>>;
    /** Identifiers a feature may overwrite. Air and fluids are always replaceable. */
    readonly replaceable?: readonly string[];
    /** Identifiers that do not fill their cell. Everything else is solid and sturdy on every face. */
    readonly nonSolid?: readonly string[];
    /** Tag membership, keyed by tag identifier with no leading `#`. */
    readonly tags?: Readonly<Record<string, readonly string[]>>;
    /** Overrides `canSurvive`. The default asks whether the block below is solid. */
    readonly canSurvive?: (world: FeatureWorld, position: BlockPos, state: BlockState) => boolean;
}

const DEFAULT_AIR = ['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'];
const DEFAULT_FLUIDS = { 'minecraft:water': 'water', 'minecraft:lava': 'lava' } as const;

/**
 * Builds a {@link BlockOracle} from plain tables.
 *
 * A test declares only the blocks it cares about; everything unnamed is a solid, unreplaceable,
 * untagged block, which is what a feature placed into stone sees.
 */
export const createTestOracle = (tables: TestOracleTables = {}): BlockOracle => {
    const air = new Set(tables.air ?? DEFAULT_AIR);
    const fluids = new Map<string, FluidKind>(Object.entries(tables.fluids ?? DEFAULT_FLUIDS));
    const replaceable = new Set(tables.replaceable ?? []);
    const nonSolid = new Set(tables.nonSolid ?? []);
    const tagMembers = new Map<string, Set<string>>(
        Object.entries(tables.tags ?? {}).map(([tag, members]) => [tag, new Set(members)])
    );

    const fluid = (state: BlockState): FluidKind => {
        const own = fluids.get(state.name);
        if (own !== undefined) return own;
        return state.properties['waterlogged'] === 'true' ? 'water' : 'empty';
    };
    const isAir = (state: BlockState) => air.has(state.name);
    const isSolid = (state: BlockState) =>
        !isAir(state) && !nonSolid.has(state.name) && !fluids.has(state.name) && !replaceable.has(state.name);

    return {
        isAir,
        isSolid,
        isSturdy: (state) => isSolid(state),
        isReplaceable: (state) => isAir(state) || fluids.has(state.name) || replaceable.has(state.name),
        fluid,
        hasTag: (state, tag) => {
            const members = tagMembers.get(tag);
            if (members === undefined) return false;
            return members.has(state.name) || members.has(blockStateKey(state));
        },
        canSurvive:
            tables.canSurvive ??
            ((world, position) => isSolid(world.getBlock({ x: position.x, y: position.y - 1, z: position.z }))),
        tagMembers: (tag) => [...(tagMembers.get(tag) ?? [])]
    };
};

/** How a test world is sized and what it knows about blocks. */
export interface TestFeatureWorldOptions {
    /** The lowest generated y. Defaults to -64, the overworld's. */
    readonly minY?: number;
    /** The number of generated y levels. Defaults to 384, the overworld's. */
    readonly height?: number;
    /** The sea level `relative_to_sea_level` resolves against. Defaults to 63. */
    readonly seaLevel?: number;
    /** The biome every position reports. Defaults to `minecraft:plains`. */
    readonly biome?: string;
    /** The block facts. Defaults to {@link createTestOracle} with no tables. */
    readonly blocks?: BlockOracle;
}

const HEIGHTMAP_MATCHES: Readonly<Record<HeightmapType, (oracle: BlockOracle, state: BlockState) => boolean>> = {
    WORLD_SURFACE_WG: (oracle, state) => !oracle.isAir(state),
    WORLD_SURFACE: (oracle, state) => !oracle.isAir(state),
    OCEAN_FLOOR_WG: (oracle, state) => oracle.isSolid(state),
    OCEAN_FLOOR: (oracle, state) => oracle.isSolid(state),
    MOTION_BLOCKING: (oracle, state) => oracle.isSolid(state) || oracle.fluid(state) !== 'empty',
    MOTION_BLOCKING_NO_LEAVES: (oracle, state) => oracle.isSolid(state) || oracle.fluid(state) !== 'empty'
};

/**
 * An in-memory {@link FeatureWorld} for tests: a sparse block store, computed heightmaps and a
 * per-position biome override.
 *
 * It records every write in order, so a test can assert what a feature built without walking the
 * whole volume, and it answers heightmap queries by scanning the stored column, so a feature that
 * reads a heightmap after writing sees its own blocks, as it does in Java.
 */
export class TestFeatureWorld implements FeatureWorld {
    /** @inheritDoc */
    public readonly minY: number;
    /** @inheritDoc */
    public readonly height: number;
    /** @inheritDoc */
    public readonly seaLevel: number;
    /** @inheritDoc */
    public readonly blocks: BlockOracle;
    /** Every successful write in the order it happened. */
    public readonly writes: { position: BlockPos; state: BlockState }[] = [];

    private readonly store = new Map<string, BlockState>();
    private readonly biomes = new Map<string, string>();
    private readonly defaultBiome: string;

    public constructor(options: TestFeatureWorldOptions = {}) {
        this.minY = options.minY ?? -64;
        this.height = options.height ?? 384;
        this.seaLevel = options.seaLevel ?? 63;
        this.blocks = options.blocks ?? createTestOracle();
        this.defaultBiome = options.biome ?? 'minecraft:plains';
    }

    /** @inheritDoc */
    public getBlock(position: BlockPos): BlockState {
        return this.store.get(posKey(position)) ?? AIR;
    }

    /** @inheritDoc */
    public setBlock(position: BlockPos, state: BlockState): boolean {
        if (position.y < this.minY || position.y >= this.minY + this.height) return false;
        this.store.set(posKey(position), state);
        this.writes.push({ position, state });
        return true;
    }

    /** @inheritDoc */
    public getHeight(heightmap: HeightmapType, x: number, z: number): number {
        const matches = HEIGHTMAP_MATCHES[heightmap];
        for (let y = this.minY + this.height - 1; y >= this.minY; y--) {
            if (matches(this.blocks, this.getBlock({ x, y, z }))) return y + 1;
        }
        return this.minY;
    }

    /** @inheritDoc */
    public getBiome(position: BlockPos): string {
        return this.biomes.get(posKey(position)) ?? this.defaultBiome;
    }

    /** Overrides the biome at one position. */
    public setBiome(position: BlockPos, biome: string): void {
        this.biomes.set(posKey(position), biome);
    }

    /** Fills an inclusive box with one state, without recording the writes. */
    public fill(from: BlockPos, to: BlockPos, state: BlockState): this {
        for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) {
            for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) {
                for (let z = Math.min(from.z, to.z); z <= Math.max(from.z, to.z); z++) {
                    this.store.set(posKey({ x, y, z }), state);
                }
            }
        }
        return this;
    }

    /** Fills every column from `minY` up to and including `topY` with one state. */
    public fillGround(topY: number, state: BlockState, radius = 32, center: BlockPos = { x: 0, y: 0, z: 0 }): this {
        return this.fill(
            { x: center.x - radius, y: this.minY, z: center.z - radius },
            { x: center.x + radius, y: topY, z: center.z + radius },
            state
        );
    }

    /** Counts the stored positions holding a given identifier. */
    public count(name: string): number {
        let total = 0;
        for (const state of this.store.values()) if (state.name === name) total++;
        return total;
    }

    /** Returns every stored position holding a given identifier, in insertion order. */
    public positionsOf(name: string): BlockPos[] {
        const found: BlockPos[] = [];
        for (const [key, state] of this.store) {
            if (state.name !== name) continue;
            const [x, y, z] = key.split(',').map(Number);
            found.push({ x: x ?? 0, y: y ?? 0, z: z ?? 0 });
        }
        return found;
    }

    /** Forgets the recorded write log, leaving the blocks in place. */
    public clearWrites(): void {
        this.writes.length = 0;
    }
}
