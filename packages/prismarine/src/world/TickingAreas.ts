/**
 * A level's ticking areas: rectangles of chunks that stay loaded and tick with no player near,
 * which the `/tickingarea` command and a script's `world.tickingAreaManager` add.
 *
 * BDS keeps the two apart, as the `ticking-areas` scenario of the parity suite recorded: a script
 * lists, counts and removes only its own areas, and the command only the command's, each up to
 * its own limit. An area covers whole chunks, and its world keeps them in through
 * {@link World.setTickingArea}. The areas last as long as the level is loaded; BDS saves them
 * with the world, which this does not yet.
 */
import type Server from '../Server';
import type { Level } from './Level';
import type { ChunkRectangle, World } from './World';

/** Who added an area: a script's ticking area manager or the `/tickingarea` command. */
export type TickingAreaOwner = 'script' | 'command';

/** The most areas the `/tickingarea` command keeps, as Bedrock's command refuses a eleventh. */
export const COMMAND_TICKING_AREA_LIMIT = 10;

/** One ticking area. */
export interface TickingArea {
    readonly name: string;
    readonly owner: TickingAreaOwner;
    /** The dimension, as Bedrock names it, such as `minecraft:overworld`. */
    readonly dimension: string;
    /** The chunks it covers. */
    readonly chunks: ChunkRectangle;
}

/** How many chunks a rectangle covers. */
export const chunkCountOf = ({ minX, maxX, minZ, maxZ }: ChunkRectangle): number =>
    (maxX - minX + 1) * (maxZ - minZ + 1);

/** The chunks a block box covers, by its corners in any order. */
export const chunksOfBlocks = (
    from: { readonly x: number; readonly z: number },
    to: { readonly x: number; readonly z: number }
): ChunkRectangle => ({
    minX: Math.min(Math.floor(from.x), Math.floor(to.x)) >> 4,
    maxX: Math.max(Math.floor(from.x), Math.floor(to.x)) >> 4,
    minZ: Math.min(Math.floor(from.z), Math.floor(to.z)) >> 4,
    maxZ: Math.max(Math.floor(from.z), Math.floor(to.z)) >> 4
});

/** What the areas ask of a dimension's world. */
export type TickingAreaWorld = Pick<World, 'setTickingArea' | 'isTickingAreaLoaded'>;

/** The ticking areas of one level. */
export class TickingAreas {
    private readonly areas = new Map<string, TickingArea>();

    /** @param worldOf - The level's world of a dimension, started when nobody has entered it. */
    public constructor(private readonly worldOf: (dimension: string) => TickingAreaWorld | undefined) {}

    private static key(owner: TickingAreaOwner, name: string): string {
        return `${owner}:${name}`;
    }

    /** The areas one owner added, in the order it added them. */
    public list(owner: TickingAreaOwner): TickingArea[] {
        return [...this.areas.values()].filter((area) => area.owner === owner);
    }

    /** One owner's area by name. */
    public get(owner: TickingAreaOwner, name: string): TickingArea | undefined {
        return this.areas.get(TickingAreas.key(owner, name));
    }

    /** How many chunks one owner's areas cover between them. */
    public chunkCount(owner: TickingAreaOwner): number {
        return this.list(owner).reduce((total, area) => total + chunkCountOf(area.chunks), 0);
    }

    /**
     * Adds an area, which starts its chunks loading.
     * @returns False when the owner already has an area of that name.
     */
    public add(area: TickingArea): boolean {
        const key = TickingAreas.key(area.owner, area.name);
        if (this.areas.has(key)) return false;
        this.areas.set(key, area);
        this.worldOf(area.dimension)?.setTickingArea(key, area.chunks);
        return true;
    }

    /** Removes one owner's area by name, and returns whether it had one. */
    public remove(owner: TickingAreaOwner, name: string): boolean {
        const key = TickingAreas.key(owner, name);
        const area = this.areas.get(key);
        if (area === undefined) return false;
        this.areas.delete(key);
        this.worldOf(area.dimension)?.setTickingArea(key, undefined);
        return true;
    }

    /** Whether every chunk of an area is loaded. */
    public isLoaded(area: TickingArea): boolean {
        return this.worldOf(area.dimension)?.isTickingAreaLoaded(TickingAreas.key(area.owner, area.name)) ?? false;
    }
}

const levels = new WeakMap<Level, TickingAreas>();

/**
 * The ticking areas of a level, made the first time they are asked for, which the command and
 * the scripts share.
 */
export const tickingAreasOf = (server: Server, level: Level): TickingAreas => {
    let found = levels.get(level);
    if (found === undefined) {
        found = new TickingAreas((dimension) =>
            level === server.getWorldManager().getDefaultLevel()
                ? server.getWorldManager().startWorld(dimension)
                : [...level.worlds()].find((world) => world.getDimension().bedrockName === dimension)
        );
        levels.set(level, found);
    }
    return found;
};
