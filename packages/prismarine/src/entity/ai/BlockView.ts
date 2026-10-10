import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { FENCE_HEIGHT, collisionTopOf } from '../../world/physics/BlockShapes';
import type { World } from '../../world/World';
import { DamageCause } from '../DamageCause';
import { BREAKS_A_FALL } from '../Environment';

/**
 * What the world looks like to a mob, read synchronously.
 *
 * Pathfinding looks at a few hundred blocks to plan one route and a handful more every tick to
 * decide where to put its feet, and it has to answer within the tick. `World.getBlock` is async and
 * will generate a chunk that is not loaded, so a mob using it would both stall the tick and quietly
 * generate terrain by walking towards it. This reads only what is already in memory.
 *
 * An unloaded chunk reads as solid rather than as air. A mob at the edge of the loaded world then
 * treats it as a wall and stays inside, which is the conservative answer: the alternative is mobs
 * walking off into ungenerated space and falling forever.
 *
 * Everything here is asked in terms of a *box* rather than a point, because a mob is a box: the
 * questions are "does this body fit here" and "what is holding it up", not "is this one column
 * solid". Asking about the column the mob's centre is in is what let a sheep bury half of itself
 * in a wall before anything objected.
 */

/** Nothing is exactly on a boundary in practice, and a box's far edge is open, not closed. */
const EPSILON = 1e-7;

/**
 * The tallest thing a mob's feet may already be inside and still be considered standing on it.
 *
 * Carpets, snow and slabs are collision boxes a mob stands *on top of*, not walls, and a route
 * planner that treated the cell as occupied would refuse to walk on a carpet.
 */
export const STEP_HEIGHT = 0.6;

/** Passable, but not something to stand on and not something to breathe in. */
const LIQUID_NAMES: ReadonlySet<string> = new Set([
    'minecraft:water',
    'minecraft:flowing_water',
    'minecraft:lava',
    'minecraft:flowing_lava'
]);

/**
 * Passable but harmful; a mob would rather go round, and is hurt if it does not.
 *
 * Keyed by what each one does rather than being a bare set, because the pathfinder and the damage
 * code want different things from the same list: one only asks "would this hurt", and the other
 * has to say *how* - burning to death and being pricked by a cactus are different deaths, and
 * armour helps with one of them and not the other.
 */
const HAZARDS: ReadonlyMap<string, DamageCause> = new Map([
    ['minecraft:lava', DamageCause.Lava],
    ['minecraft:flowing_lava', DamageCause.Lava],
    ['minecraft:fire', DamageCause.Fire],
    ['minecraft:soul_fire', DamageCause.Fire],
    ['minecraft:magma', DamageCause.Fire],
    ['minecraft:cactus', DamageCause.Contact],
    ['minecraft:sweet_berry_bush', DamageCause.Contact]
]);

interface BlockFacts {
    /** How high its top surface sits inside its own cell. `0` means walked straight through. */
    top: number;
    passable: boolean;
    liquid: boolean;
    /** What standing in this does, or null if it does nothing. */
    harm: DamageCause | null;
    /** Whether landing in or on it costs nothing - see `Environment.BREAKS_A_FALL`. */
    softFall: boolean;
}

const SOLID: BlockFacts = { top: 1, passable: false, liquid: false, harm: null, softFall: false };
const OPEN: BlockFacts = { top: 0, passable: true, liquid: false, harm: null, softFall: false };

/**
 * Facts per runtime id, worked out once.
 *
 * A runtime id is a hash, so resolving one back to a name costs an index lookup - too much to do
 * several hundred times per path, and the shape lookup on top of it more so. A world only ever
 * contains a few dozen distinct blocks, so this map stays small and the second lookup of any block
 * is free.
 */
const facts = new Map<number, BlockFacts>();

const factsFor = (runtimeId: number): BlockFacts => {
    const known = facts.get(runtimeId);
    if (known !== undefined) return known;

    const state = BlockRuntimeIds.getState(runtimeId);
    const name = state?.name;
    const top = name === undefined ? 1 : collisionTopOf(name, state?.properties);

    const resolved: BlockFacts = {
        top,
        passable: top === 0,
        liquid: name !== undefined && LIQUID_NAMES.has(name),
        harm: (name !== undefined && HAZARDS.get(name)) || null,
        softFall: name !== undefined && BREAKS_A_FALL.has(name)
    };

    facts.set(runtimeId, resolved);
    return resolved;
};

/** The cells a box of this width, centred here, reaches into. */
const spanOf = (centre: number, width: number): { min: number; max: number } => ({
    min: Math.floor(centre - width / 2),
    max: Math.floor(centre + width / 2 - EPSILON)
});

export class BlockView {
    public constructor(private readonly world: World) {}

    /** The facts about a block, or "solid" where nothing is loaded. */
    private at(x: number, y: number, z: number): BlockFacts {
        const chunk = this.world.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk) return SOLID;

        // Outside the world vertically: open above the ceiling, solid below the floor.
        if (y > chunk.getMaxY()) return OPEN;
        if (y < chunk.getMinY()) return SOLID;

        return factsFor(chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf));
    }

    /** How high the collision surface in this cell sits above the cell's own floor. */
    public topAt(x: number, y: number, z: number): number {
        return this.at(x, y, z).top;
    }

    public isPassable(x: number, y: number, z: number): boolean {
        return this.at(x, y, z).passable;
    }

    public isSolid(x: number, y: number, z: number): boolean {
        return !this.at(x, y, z).passable;
    }

    public isLiquid(x: number, y: number, z: number): boolean {
        return this.at(x, y, z).liquid;
    }

    public isHazard(x: number, y: number, z: number): boolean {
        return this.at(x, y, z).harm !== null;
    }

    /**
     * What standing in this block does to something, if anything.
     *
     * The pathfinder only needs {@link isHazard}; the damage code needs to know which kind, since
     * burning and being pricked are different deaths with different rules about armour.
     * @param {number} x - Block x.
     * @param {number} y - Block y.
     * @param {number} z - Block z.
     * @returns {DamageCause | null} What it does, or null for a block that is simply a block.
     */
    public harmAt(x: number, y: number, z: number): DamageCause | null {
        return this.at(x, y, z).harm;
    }

    /**
     * Whether landing in or on this block costs nothing.
     * @param {number} x - Block x.
     * @param {number} y - Block y.
     * @param {number} z - Block z.
     * @returns {boolean} `true` for water, hay, cobweb and the rest.
     */
    public breaksAFall(x: number, y: number, z: number): boolean {
        return this.at(x, y, z).softFall;
    }

    /**
     * The lowest block this column can hold.
     *
     * From the chunk rather than from the world's dimension, so that everything a mob needs to
     * know about where it is comes through one reader. Null where nothing is loaded, which the
     * caller should read as "no idea" rather than as "no floor".
     * @param {number} x - Block x.
     * @param {number} z - Block z.
     * @returns {number | null} The world's floor here, or null if the chunk is not in memory.
     */
    public floorAt(x: number, z: number): number | null {
        return this.world.getLoadedChunk(x >> 4, z >> 4)?.getMinY() ?? null;
    }

    /**
     * Whether nothing but air stands between this block and the sky.
     *
     * What decides whether the morning kills a zombie. Unloaded reads as open, which is the
     * conservative answer for a spawner - it will not put a monster somewhere the sun may reach -
     * and the forgiving one for burning, since nothing should catch fire on the strength of a
     * chunk nobody has loaded.
     * @param {number} x - Block x.
     * @param {number} y - The block to look up from; itself not counted.
     * @param {number} z - Block z.
     * @returns {boolean} `true` if the sky is visible from here.
     */
    public seesSky(x: number, y: number, z: number): boolean {
        const chunk = this.world.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk) return true;

        for (let above = y + 1; above <= chunk.getMaxY(); above++) {
            if (this.isSolid(x, above, z)) return false;
        }

        return true;
    }

    /** Whether the chunk holding a position is in memory at all. */
    public isLoaded(x: number, z: number): boolean {
        return this.world.getLoadedChunk(x >> 4, z >> 4) !== null;
    }

    /**
     * Whether a body of this size, standing here, runs into anything.
     *
     * The continuous form, in world coordinates, and the one the physics asks: every cell the box
     * reaches into is tested against the part of it the block actually fills, so a mob may stand
     * with its feet inside a carpet and its head under a fence rail without either counting.
     * @param {number} x - Centre of the box.
     * @param {number} feet - The bottom of the box, which is where an entity's position is.
     * @param {number} z - Centre of the box.
     * @param {number} width - Blocks across.
     * @param {number} height - Blocks tall.
     * @returns {boolean} Whether anything solid overlaps it.
     */
    public blocksBox(x: number, feet: number, z: number, width: number, height: number): boolean {
        const across = spanOf(x, width);
        const along = spanOf(z, width);
        const head = feet + height;

        const lowest = Math.floor(feet);
        const highest = Math.floor(head - EPSILON);

        for (let blockX = across.min; blockX <= across.max; blockX++) {
            for (let blockZ = along.min; blockZ <= along.max; blockZ++) {
                // A fence is taller than its own cell, so the cell below the box can still reach
                // into it. Nothing here is taller than one extra block, so one is far enough down.
                for (let blockY = lowest - 1; blockY <= highest; blockY++) {
                    const top = this.at(blockX, blockY, blockZ).top;
                    if (top === 0) continue;

                    // Half-open on both sides: a box resting exactly on a surface is not inside it.
                    if (blockY + top > feet + EPSILON && blockY < head - EPSILON) return true;
                }
            }
        }

        return false;
    }

    /**
     * The height of the highest surface under a box, or null if there is none within reach.
     *
     * What a mob lands on, and what tells a step from a wall. Surfaces above the box's feet are
     * ignored: this answers "what is holding it up", not "what is it stuck in".
     * @param {number} x - Centre of the box.
     * @param {number} feet - The bottom of the box, in world coordinates.
     * @param {number} z - Centre of the box.
     * @param {number} width - Blocks across.
     * @param {number} reach - How far down to look, in blocks.
     * @returns {number | null} A world height, not an offset within a cell.
     */
    public groundUnder(x: number, feet: number, z: number, width: number, reach = 4): number | null {
        const across = spanOf(x, width);
        const along = spanOf(z, width);

        let highest: number | null = null;

        for (let blockX = across.min; blockX <= across.max; blockX++) {
            for (let blockZ = along.min; blockZ <= along.max; blockZ++) {
                for (let blockY = Math.floor(feet); blockY >= Math.floor(feet - reach); blockY--) {
                    const top = this.at(blockX, blockY, blockZ).top;
                    if (top === 0) continue;

                    const surface = blockY + top;
                    if (surface > feet + EPSILON) continue;

                    if (highest === null || surface > highest) highest = surface;
                    break;
                }
            }
        }

        return highest;
    }

    /**
     * Whether a mob's body fits standing in this block, ignoring what is underneath.
     *
     * The grid form, for the route planner, which works in whole cells. The cell the feet are in
     * may hold something low enough to step onto - that is what {@link STEP_HEIGHT} is for - and
     * the body is then measured from the top of it, so a mob on a slab still needs its full height
     * of clearance above the slab rather than above the floor.
     * @param {number} x - World x of the cell.
     * @param {number} y - World y of the cell the feet are in.
     * @param {number} z - World z of the cell.
     * @param {number} height - How tall the mob is.
     * @param {number} width - Blocks across; the box is centred in the cell.
     * @returns {boolean} Whether the body fits.
     */
    public hasRoomAt(x: number, y: number, z: number, height = 2, width = 1): boolean {
        const across = spanOf(x + 0.5, width);
        const along = spanOf(z + 0.5, width);

        let feet = y;

        for (let blockX = across.min; blockX <= across.max; blockX++) {
            for (let blockZ = along.min; blockZ <= along.max; blockZ++) {
                const block = this.at(blockX, y, blockZ);
                if (block.harm !== null) return false;

                // Anything in the footprint too tall to step onto is a wall, however open the
                // rest of the cell is.
                if (block.top > STEP_HEIGHT) return false;

                // A fence is taller than its own cell, so the cell above one is not the free space
                // it looks like. Refusing it outright is also the answer that matters: without it
                // the planner reads the top of a fence as somewhere to stand, plans a route over
                // the paddock wall, and sends every animal to press itself against it until it
                // gives up. Mobs do not stand on fences.
                if (y - 1 + this.at(blockX, y - 1, blockZ).top > y + EPSILON) return false;

                feet = Math.max(feet, y + block.top);
            }
        }

        const head = feet + height;
        for (let blockX = across.min; blockX <= across.max; blockX++) {
            for (let blockZ = along.min; blockZ <= along.max; blockZ++) {
                for (let blockY = y + 1; blockY <= Math.floor(head - EPSILON); blockY++) {
                    const block = this.at(blockX, blockY, blockZ);
                    if (block.top > 0 || block.harm !== null) return false;
                }
            }
        }

        return true;
    }

    /**
     * Whether a mob can stand with its feet in this block: clear space for its body, and something
     * solid holding it up.
     * @param {number} x - World x.
     * @param {number} y - World y, where the mob's feet would be.
     * @param {number} z - World z.
     * @param {number} height - How tall the mob is.
     * @param {number} width - How wide the mob is.
     * @returns {boolean} Whether it could stand there.
     */
    public canStandAt(x: number, y: number, z: number, height = 2, width = 1): boolean {
        // Something underfoot, or something in this very cell low enough to rest on - a slab or a
        // layer of snow holds a mob up just as well as the block below it does.
        if (!this.isSolid(x, y - 1, z) && this.topAt(x, y, z) === 0) return false;
        return this.hasRoomAt(x, y, z, height, width);
    }

    /** The block a mob standing here would be swimming in. */
    public isSubmerged(x: number, y: number, z: number): boolean {
        return this.isLiquid(x, y, z);
    }

    /**
     * The first solid ground at or below a position, or null within `limit` blocks.
     * Used to drop a spawn or a wander target onto the floor rather than into the air.
     */
    public groundBelow(x: number, y: number, z: number, limit = 8, height = 2, width = 1): number | null {
        for (let offset = 0; offset <= limit; offset++) {
            const candidate = y - offset;
            if (this.canStandAt(x, candidate, z, height, width)) return candidate;
        }

        return null;
    }

    /** Whether something in this cell is too tall to be jumped, whatever a mob does. */
    public isUnjumpable(x: number, y: number, z: number): boolean {
        return this.at(x, y, z).top >= FENCE_HEIGHT;
    }
}

export default BlockView;
