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

    public constructor(private readonly world: PoiWorld) {}

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

        // Read once: the view is rebuilt on every ask and the scan crosses thousands of cells.
        const navigation = this.world.navigation();

        const markers = POI_BLOCKS.get(kind);
        if (markers !== undefined) return scan(center, radius, (cell) => marked(navigation, cell, markers));

        if (!SHELTER_KINDS.has(kind)) return undefined;
        const indoors = kind === 'indoors';
        return scan(center, radius, (cell) => sheltered(navigation, cell, indoors));
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
}

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

/** Where an entity stands to use a marker block, or undefined when the cell holds none. */
const marked = (
    navigation: NavigationView,
    cell: EntityPosition,
    markers: ReadonlySet<string>
): EntityPosition | undefined => {
    const identifier = navigation.blockAt(cell);
    if (identifier === undefined || !markers.has(identifier)) return undefined;
    return { x: cell.x + 0.5, y: cell.y + 1, z: cell.z + 0.5 };
};

/** A cell the entity could stand in that has a roof over it, or that has none. */
const sheltered = (navigation: NavigationView, cell: EntityPosition, indoors: boolean): EntityPosition | undefined => {
    if (!navigation.isPassable(cell)) return undefined;
    if (hasRoof(navigation, cell) !== indoors) return undefined;
    return { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 };
};

/** Whether anything solid stands within {@link ROOF_HEIGHT} blocks above a cell. */
const hasRoof = (navigation: NavigationView, cell: EntityPosition): boolean => {
    for (let above = 1; above <= ROOF_HEIGHT; above += 1)
        if (navigation.isSolid({ x: cell.x, y: cell.y + above, z: cell.z })) return true;
    return false;
};
