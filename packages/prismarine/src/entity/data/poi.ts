/**
 * The points of interest the goals ask for, out of the blocks and out of what
 * the server recorded.
 *
 * Bedrock has no point-of-interest registry at all, so
 * `@jsprismarine/entity-goals` hands the question straight to the server
 * through `GoalWorld.poi` and eleven goals ask it. Java does have one, and
 * `PoiTypes` is a block-to-kind table: a bed is a home, a bell is a meeting
 * point, each of the thirteen job sites is one profession's work site. That is
 * most of what the goals want, so most kinds here are a set of block
 * identifiers and the search is a block search.
 *
 * Two kinds are not blocks. `indoors` and `outdoors` are questions about
 * whether a position has a roof over it, which this answers by looking up.
 *
 * The rest have no marker in the world at all: the warden's
 * `suspicious_location` is a vibration it heard and the dolphin's
 * `buried_treasure` is a structure the generator placed. Those come from
 * {@link PointsOfInterest.record}, so the subsystem that knows puts the
 * position in and the goal reads it back. Nothing invents one.
 *
 * Every search is a box widening one ring at a time and stopping at the first
 * hit, so a villager looking 32 blocks for a bed costs the rings it crosses
 * rather than the 274625 blocks in the cube.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import type { NavigationView } from '@jsprismarine/entity-goals';

import { distance } from './DataEntity';

const MAX_CACHED_BLOCKS = 100_000;

interface PoiCellFacts {
    blockRead: boolean;
    block: string | undefined;
    passableRead: boolean;
    passable: boolean;
    solidRead: boolean;
    solid: boolean;
}

interface PoiNavigation {
    blockAt(position: EntityPosition): string | undefined;
    isPassable(position: EntityPosition): boolean;
    isSolid(position: EntityPosition): boolean;
}

/** The thirteen blocks Java's `PoiTypes` makes a villager's work site. */
const JOB_SITES = [
    'minecraft:barrel',
    'minecraft:blast_furnace',
    'minecraft:brewing_stand',
    'minecraft:cartography_table',
    'minecraft:cauldron',
    'minecraft:composter',
    'minecraft:fletching_table',
    'minecraft:grindstone',
    'minecraft:lectern',
    'minecraft:loom',
    'minecraft:smithing_table',
    'minecraft:smoker',
    'minecraft:stonecutter'
] as const;

/**
 * The doors Java's `BlockTags.DOORS` holds, as Bedrock names them.
 *
 * Bedrock writes one identifier per wood, and `minecraft:wooden_door` is the
 * oak one; Java's village door scan treats them all alike.
 */
const DOORS = [
    'minecraft:acacia_door',
    'minecraft:bamboo_door',
    'minecraft:birch_door',
    'minecraft:cherry_door',
    'minecraft:crimson_door',
    'minecraft:dark_oak_door',
    'minecraft:iron_door',
    'minecraft:jungle_door',
    'minecraft:mangrove_door',
    'minecraft:pale_oak_door',
    'minecraft:spruce_door',
    'minecraft:warped_door',
    'minecraft:wooden_door'
] as const;

/**
 * The blocks that mark each kind of point of interest.
 *
 * `bed`, `home` and `hide` are one kind under three names, because the
 * villager's raid hiding place is its own house and Java's `PoiTypes.HOME` is
 * the bed in it. `village` and `meeting` are the bell, which is what Java
 * centers a village on, with the beds as the fallback for a village that has
 * no bell yet.
 */
const POI_BLOCKS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
    ['bed', new Set(['minecraft:bed'])],
    ['home', new Set(['minecraft:bed'])],
    ['hide', new Set(['minecraft:bed'])],
    ['door', new Set<string>(DOORS)],
    ['meeting', new Set(['minecraft:bell'])],
    ['village', new Set(['minecraft:bell', 'minecraft:bed'])],
    ['work', new Set<string>(JOB_SITES)],
    ['composter', new Set(['minecraft:composter'])],
    ['noteblock', new Set(['minecraft:noteblock'])]
]);

/** Every block identifier the POI index needs to keep. */
const POI_MARKER_BLOCKS = new Set([...POI_BLOCKS.values()].flatMap((markers) => [...markers]));

/** The two kinds that are a question about the blocks above a position rather than a block. */
const SHELTER_KINDS = new Set(['indoors', 'outdoors']);

/**
 * How far up a roof counts, in blocks.
 *
 * Java asks the motion-blocking heightmap whether anything is above the
 * position. With no heightmap here the scan is bounded, and 16 blocks covers
 * every village building Java's structures place.
 */
const ROOF_HEIGHT = 16;

/**
 * How far above and below a search looks, in blocks.
 *
 * Java's `PoiManager` searches whole chunk sections; the goals ask for radii
 * up to 64, and searching that far up and down costs more than it finds. Four
 * blocks reaches the floor below the entity and the floor above it.
 */
const SEARCH_HEIGHT = 4;

/** Bounds retained searches and chunk indexes for one entity tick. */
const MAX_CACHED_SEARCHES = 50_000;
const MAX_CACHED_MARKER_BANDS = 1_024;

/** What the index reads to answer a search. */
export interface PoiWorld {
    /** The blocks as the path finder reads them, which is where the markers are. */
    navigation(): NavigationView;
}

/**
 * The points of interest of one dimension.
 *
 * One index per runtime rather than one per entity: a bell is a bell whoever
 * is looking at it, and the recorded points are the dimension's too.
 */
export class PointsOfInterest {
    /** The positions a subsystem recorded, by kind. */
    private readonly recorded = new Map<string, EntityPosition[]>();
    private readonly blockCache = new Map<string, PoiCellFacts>();
    private readonly markerChunkBands = new Map<string, ReadonlyMap<string, readonly EntityPosition[]>>();
    private readonly searchCache = new Map<string, EntityPosition | null>();
    private blockCacheGeneration = 0;
    private cachedBlockCacheGeneration = 0;

    public constructor(private readonly world: PoiWorld) {}

    /** Clears block reads before the next entity tick. */
    public resetBlockCache(): void {
        this.blockCache.clear();
        this.markerChunkBands.clear();
        this.searchCache.clear();
        this.cachedBlockCacheGeneration = this.blockCacheGeneration;
    }

    /** Invalidates cached block reads after the world changes a block. */
    public invalidateBlockCache(): void {
        this.blockCacheGeneration += 1;
    }

    /**
     * Records a point of interest that no block marks.
     *
     * This is how the warden's `suspicious_location` and the dolphin's
     * `buried_treasure` arrive: the vibration listener and the generator know
     * where they are, and the goals do not.
     */
    public record(kind: string, at: EntityPosition): void {
        const points = this.recorded.get(kind) ?? [];
        points.push(at);
        this.recorded.set(kind, points);
    }

    /** Forgets every recorded point of one kind. */
    public forget(kind: string): void {
        this.recorded.delete(kind);
    }

    /** Whether this index knows how to answer a kind at all. */
    public knows(kind: string): boolean {
        return POI_BLOCKS.has(kind) || SHELTER_KINDS.has(kind) || this.recorded.has(kind);
    }

    /**
     * The nearest point of interest of a kind.
     *
     * @returns Its position, or undefined when nothing of the kind is within
     *   the radius. A kind this index has no marker for and nothing recorded
     *   under answers undefined, which keeps the goal asleep rather than
     *   sending it somewhere invented.
     */
    public nearest(kind: string, center: EntityPosition, radius: number): EntityPosition | undefined {
        const nearestRecorded = this.nearestRecorded(kind, center, radius);
        if (nearestRecorded !== undefined) return nearestRecorded;

        this.prepareBlockCache();
        const key = searchKey(kind, center, radius);
        if (this.searchCache.has(key)) {
            const cached = this.searchCache.get(key);
            return cached === null || cached === undefined ? undefined : { ...cached };
        }

        // Read once: the view is rebuilt on every ask and the scan crosses thousands of cells.
        const navigation = this.cachedNavigation(this.world.navigation());

        const markers = POI_BLOCKS.get(kind);
        let found: EntityPosition | undefined;
        if (markers !== undefined) found = this.nearestMarker(center, radius, markers, navigation);

        if (SHELTER_KINDS.has(kind)) {
            const indoors = kind === 'indoors';
            found = scan(center, radius, (cell) => sheltered(navigation, cell, indoors));
        }

        if (this.searchCache.size >= MAX_CACHED_SEARCHES) this.searchCache.clear();
        this.searchCache.set(key, found ?? null);
        return found;
    }

    private nearestMarker(
        center: EntityPosition,
        radius: number,
        markers: ReadonlySet<string>,
        navigation: PoiNavigation
    ): EntityPosition | undefined {
        const origin = { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) };
        const lastRing = Math.floor(radius);
        if (!(lastRing >= 0)) return undefined;

        const minChunkX = Math.floor((origin.x - lastRing) / 16);
        const maxChunkX = Math.floor((origin.x + lastRing) / 16);
        const minChunkZ = Math.floor((origin.z - lastRing) / 16);
        const maxChunkZ = Math.floor((origin.z + lastRing) / 16);
        let best:
            | { readonly cell: EntityPosition; readonly ring: number; readonly dx: number; readonly dz: number }
            | undefined;

        for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
            for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
                for (const identifier of markers) {
                    for (const cell of this.markerCells(chunkX, chunkZ, origin.y, navigation).get(identifier) ?? []) {
                        const dx = cell.x - origin.x;
                        const dz = cell.z - origin.z;
                        const ring = Math.max(Math.abs(dx), Math.abs(dz));
                        if (ring > lastRing) continue;
                        if (
                            best !== undefined &&
                            (ring > best.ring ||
                                (ring === best.ring &&
                                    (dx > best.dx ||
                                        (dx === best.dx &&
                                            (dz > best.dz || (dz === best.dz && cell.y >= best.cell.y))))))
                        )
                            continue;
                        best = { cell, ring, dx, dz };
                    }
                }
            }
        }

        return best === undefined ? undefined : { x: best.cell.x + 0.5, y: best.cell.y + 1, z: best.cell.z + 0.5 };
    }

    private markerCells(
        chunkX: number,
        chunkZ: number,
        centerY: number,
        navigation: PoiNavigation
    ): ReadonlyMap<string, readonly EntityPosition[]> {
        const key = `${chunkX},${chunkZ},${centerY}`;
        const cached = this.markerChunkBands.get(key);
        if (cached !== undefined) return cached;

        if (this.markerChunkBands.size >= MAX_CACHED_MARKER_BANDS) this.markerChunkBands.clear();

        const cells = new Map<string, EntityPosition[]>();
        const firstX = chunkX * 16;
        const firstZ = chunkZ * 16;
        for (let x = firstX; x < firstX + 16; x += 1) {
            for (let z = firstZ; z < firstZ + 16; z += 1) {
                for (let y = centerY - SEARCH_HEIGHT; y <= centerY + SEARCH_HEIGHT; y += 1) {
                    const position = { x, y, z };
                    const identifier = navigation.blockAt(position);
                    if (identifier === undefined || !POI_MARKER_BLOCKS.has(identifier)) continue;
                    const positions = cells.get(identifier) ?? [];
                    positions.push(position);
                    cells.set(identifier, positions);
                }
            }
        }

        this.markerChunkBands.set(key, cells);
        return cells;
    }

    /** The nearest recorded point of a kind, or undefined when none is in range. */
    private nearestRecorded(kind: string, center: EntityPosition, radius: number): EntityPosition | undefined {
        let nearest: EntityPosition | undefined;
        let away = radius;
        for (const point of this.recorded.get(kind) ?? []) {
            const range = distance(center, point);
            if (range > away) continue;
            nearest = point;
            away = range;
        }
        return nearest;
    }

    private cachedNavigation(navigation: NavigationView): PoiNavigation {
        return {
            blockAt: (position) => {
                const facts = this.factsAt(position);
                if (!facts.blockRead) {
                    facts.block = navigation.blockAt(position);
                    facts.blockRead = true;
                }
                return facts.block;
            },
            isPassable: (position) => {
                const facts = this.factsAt(position);
                if (!facts.passableRead) {
                    facts.passable = navigation.isPassable(position);
                    facts.passableRead = true;
                }
                return facts.passable;
            },
            isSolid: (position) => {
                const facts = this.factsAt(position);
                if (!facts.solidRead) {
                    facts.solid = navigation.isSolid(position);
                    facts.solidRead = true;
                }
                return facts.solid;
            }
        };
    }

    private factsAt(position: EntityPosition): PoiCellFacts {
        this.prepareBlockCache();

        const key = `${position.x},${position.y},${position.z}`;
        const existing = this.blockCache.get(key);
        if (existing !== undefined) return existing;

        if (this.blockCache.size >= MAX_CACHED_BLOCKS) this.blockCache.clear();
        const facts: PoiCellFacts = {
            blockRead: false,
            block: undefined,
            passableRead: false,
            passable: false,
            solidRead: false,
            solid: false
        };
        this.blockCache.set(key, facts);
        return facts;
    }

    private prepareBlockCache(): void {
        if (this.cachedBlockCacheGeneration === this.blockCacheGeneration) return;
        this.blockCache.clear();
        this.markerChunkBands.clear();
        this.searchCache.clear();
        this.cachedBlockCacheGeneration = this.blockCacheGeneration;
    }
}

/** The block search depends on whole-block coordinates and the floored radius. */
const searchKey = (kind: string, center: EntityPosition, radius: number): string =>
    `${kind}|${Math.floor(center.x)},${Math.floor(center.y)},${Math.floor(center.z)}|${Math.floor(radius)}`;

/**
 * Walks the cells around a position outwards and hands back what the first
 * accepted cell is worth.
 *
 * Ring order rather than a sort of everything in range, because the point of
 * a search bounded at 64 blocks is to stop early.
 */
const scan = (
    center: EntityPosition,
    radius: number,
    accept: (cell: EntityPosition) => EntityPosition | undefined
): EntityPosition | undefined => {
    const origin = { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) };

    for (let ring = 0; ring <= Math.floor(radius); ring += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
            for (let dz = -ring; dz <= ring; dz += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                for (let dy = -SEARCH_HEIGHT; dy <= SEARCH_HEIGHT; dy += 1) {
                    const found = accept({ x: origin.x + dx, y: origin.y + dy, z: origin.z + dz });
                    if (found !== undefined) return found;
                }
            }
        }
    }
    return undefined;
};

/** A cell the entity could stand in that has a roof over it, or that has none. */
const sheltered = (navigation: PoiNavigation, cell: EntityPosition, indoors: boolean): EntityPosition | undefined => {
    if (!navigation.isPassable(cell)) return undefined;
    if (hasRoof(navigation, cell) !== indoors) return undefined;
    return { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 };
};

/** Whether anything solid stands within {@link ROOF_HEIGHT} blocks above a cell. */
const hasRoof = (navigation: PoiNavigation, cell: EntityPosition): boolean => {
    for (let above = 1; above <= ROOF_HEIGHT; above += 1)
        if (navigation.isSolid({ x: cell.x, y: cell.y + above, z: cell.z })) return true;
    return false;
};
