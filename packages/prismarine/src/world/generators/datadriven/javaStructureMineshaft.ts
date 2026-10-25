/**
 * The abandoned mineshaft, Java's `minecraft:mineshaft` structure type.
 *
 * Java builds this one in code rather than from templates. A room is placed in the start chunk,
 * corridors, crossings and stairs chain off it until the graph is eight pieces deep or 80 blocks
 * wide, and each piece writes its own blocks: rails, wooden supports, cobwebs, a cave spider
 * spawner in a spider corridor, and the chests the abandoned mineshaft loot table fills. The
 * mesa variant swaps oak for dark oak and settles between sea level and the terrain above it,
 * which is why a badlands mineshaft is so often open to the air.
 *
 * Two things differ from Java.
 *
 * The y is settled while the structure is laid out, which is where Java settles it too. What
 * differs is the level it reads: the mesa variant takes its terrain height from
 * `StructureLevel.baseHeight` rather than from a loaded chunk. The whole shaft lands at one
 * height either way.
 *
 * A chest minecart has no seam. Where Java parks one on a rail, this puts a chest on the floor
 * in its place, with the same loot table, and still makes both of Java's draws.
 */
import type { BlockState } from '@jsprismarine/features';
import type { BoundingBox, RandomSource } from '@jsprismarine/structures';

import type { StructureBuildContext, StructureBuilder, StructureLayout } from './javaStructureStarts';
import type { StructurePiece, StructureWriter } from './javaStructureWorld';
import { movedBox, unionOf } from './javaStructureWorld';

/** The y the whole shaft is built at before it is settled, Java's `MAGIC_START_Y`. */
const LAYOUT_Y = 50;

/** How many pieces a branch may chain before Java stops extending it. */
const MAX_DEPTH = 8;

/** How far from the room's corner a piece may start, on either horizontal axis. */
const MAX_SPREAD = 80;

/** How far a support pillar may reach down for a floor. */
const MAX_PILLAR_HEIGHT = 20;

/** How far a support chain may reach up for a ceiling. */
const MAX_CHAIN_HEIGHT = 50;

/** How far below sea level the normal variant's ceiling is pushed. */
const SEA_LEVEL_CLEARANCE = 10;

/** The four horizontal directions a piece can face, spelled as Java spells a `Direction`. */
type Horizontal = 'north' | 'south' | 'west' | 'east';

/** Which of the two mineshafts is being built, from the structure document's `mineshaft_type`. */
type MineshaftVariant = 'normal' | 'mesa';

const block = (name: string, properties: Readonly<Record<string, string>> = {}): BlockState => ({ name, properties });

const CAVE_AIR = block('minecraft:cave_air');
const DIRT = block('minecraft:dirt');
const COBWEB = block('minecraft:cobweb');
const CHAIN = block('minecraft:chain');
const SPAWNER = block('minecraft:spawner');
const CHEST = block('minecraft:chest');
const RAIL = block('minecraft:rail', { shape: 'north_south' });
const TORCH_NORTH = block('minecraft:wall_torch', { facing: 'north' });
const TORCH_SOUTH = block('minecraft:wall_torch', { facing: 'south' });

/** The loot a mineshaft chest rolls. */
const MINESHAFT_LOOT = 'minecraft:chests/abandoned_mineshaft';

/** The wood a variant builds with: Java's `MineshaftStructure.Type` carries these three blocks. */
interface MineshaftWood {
    readonly log: BlockState;
    readonly planks: BlockState;
    readonly fence: BlockState;
    /** The fence Java puts on a support's left post, connected toward west. */
    readonly fenceWest: BlockState;
    /** The fence Java puts on a support's right post, connected toward east. */
    readonly fenceEast: BlockState;
}

const woodOf = (kind: string): MineshaftWood => ({
    log: block(`minecraft:${kind}_log`),
    planks: block(`minecraft:${kind}_planks`),
    fence: block(`minecraft:${kind}_fence`),
    fenceWest: block(`minecraft:${kind}_fence`, { west: 'true' }),
    fenceEast: block(`minecraft:${kind}_fence`, { east: 'true' })
});

const WOODS: Readonly<Record<MineshaftVariant, MineshaftWood>> = {
    normal: woodOf('oak'),
    mesa: woodOf('dark_oak')
};

const AIR_NAMES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);
const LIQUID_NAMES = new Set(['minecraft:water', 'minecraft:lava', 'minecraft:bubble_column']);

const isAir = (state: BlockState): boolean => AIR_NAMES.has(state.name);
const isLiquid = (state: BlockState): boolean => LIQUID_NAMES.has(state.name);

/**
 * Whether a block can carry a pillar, a plank floor or a rail.
 *
 * Java asks the state for a sturdy top face. Nothing on the writer answers that, so a block that
 * is neither air, nor a fluid, nor in `#minecraft:replaceable` counts as solid.
 */
const isSolidFloor = (writer: StructureWriter, state: BlockState): boolean =>
    !isAir(state) && !isLiquid(state) && !writer.hasTag(state.name, 'minecraft:replaceable');

/** Whether two inclusive boxes share a block, which is Java's `BoundingBox.intersects`. */
const intersects = (a: BoundingBox, b: BoundingBox): boolean =>
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ;

/** How many blocks a box covers along each axis, which is Java's `getXSpan` and its siblings. */
const spanX = (box: BoundingBox): number => box.maxX - box.minX + 1;
const spanY = (box: BoundingBox): number => box.maxY - box.minY + 1;
const spanZ = (box: BoundingBox): number => box.maxZ - box.minZ + 1;

/**
 * Where each horizontal direction ends up once a piece's own turn is applied.
 *
 * Java turns a piece by mirroring it left to right and rotating, then runs every state it places
 * through the same transform. A piece facing north is left alone because its local z already
 * runs backwards.
 */
const TURNS: Readonly<Record<Horizontal, Readonly<Record<Horizontal, Horizontal>>>> = {
    north: { north: 'north', south: 'south', west: 'west', east: 'east' },
    south: { north: 'south', south: 'north', west: 'west', east: 'east' },
    west: { north: 'west', south: 'east', west: 'north', east: 'south' },
    east: { north: 'east', south: 'west', west: 'south', east: 'north' }
};

const isHorizontal = (value: string): value is Horizontal =>
    value === 'north' || value === 'south' || value === 'west' || value === 'east';

/** The axis each straight rail shape runs along. Mineshafts lay no curved or sloped rail. */
const RAIL_AXES: Readonly<Record<string, Horizontal>> = { north_south: 'north', east_west: 'east' };

/**
 * A state turned the way its piece is turned.
 *
 * Only three kinds of property move: a rail's shape, a wall torch's facing and a fence's
 * connections. Everything else, and every state with no properties at all, is returned
 * untouched so that filling a corridor with air allocates nothing.
 */
const turnedState = (state: BlockState, orientation: Horizontal | undefined): BlockState => {
    if (orientation === undefined || orientation === 'north') return state;

    const turn = TURNS[orientation];
    const turned: Record<string, string> = {};
    let moved = false;

    for (const [name, value] of Object.entries(state.properties)) {
        const axis = name === 'shape' ? RAIL_AXES[value] : undefined;

        if (isHorizontal(name)) {
            turned[turn[name]] = value;
            moved ||= turn[name] !== name;
        } else if (name === 'facing' && isHorizontal(value)) {
            turned[name] = turn[value];
            moved ||= turn[value] !== value;
        } else if (axis !== undefined) {
            const along = turn[axis];
            const shape = along === 'north' || along === 'south' ? 'north_south' : 'east_west';
            turned[name] = shape;
            moved ||= shape !== value;
        } else {
            turned[name] = value;
        }
    }

    return moved ? { name: state.name, properties: turned } : state;
};

/** The pieces laid out so far, and what the recursion needs to keep extending them. */
interface MineshaftGraph {
    /** The room every spread limit is measured from, which is Java's start piece. */
    readonly start: MineshaftPiece;
    readonly variant: MineshaftVariant;
    readonly pieces: MineshaftPiece[];
}

/** The first laid-out piece a box runs into, which is what rejects an overlapping candidate. */
const findCollision = (graph: MineshaftGraph, box: BoundingBox): MineshaftPiece | undefined =>
    graph.pieces.find((piece) => intersects(piece.boundingBox, box));

/**
 * One part of a mineshaft, which is Java's `MineShaftPiece`.
 *
 * The four subclasses write through the local coordinate helpers here: a piece that faces east
 * writes the same local box as one that faces north, and the helpers turn it. Pieces with no
 * orientation, the room and the crossing, write in world coordinates and the helpers pass them
 * through.
 */
abstract class MineshaftPiece implements StructurePiece {
    /** Java's `genDepth`: how many pieces this one is from the room. The room is zero. */
    public readonly depth: number;

    protected readonly wood: MineshaftWood;
    protected box: BoundingBox;

    protected constructor(
        depth: number,
        box: BoundingBox,
        protected readonly variant: MineshaftVariant,
        protected readonly orientation: Horizontal | undefined
    ) {
        this.depth = depth;
        this.box = box;
        this.wood = WOODS[variant];
    }

    /** The box the piece occupies, which moves once when the shaft settles. */
    public get boundingBox(): BoundingBox {
        return this.box;
    }

    /** Writes the piece's blocks, which is Java's `postProcess`. */
    public abstract place(writer: StructureWriter, random: RandomSource): void;

    /** Chains the pieces that lead off this one, which is Java's `addChildren`. */
    public addChildren(_graph: MineshaftGraph, _random: RandomSource): void {
        // A piece with nothing leading off it, such as a corridor that ran out of depth.
    }

    /** Moves the piece up or down, which is how the whole shaft settles to one height. */
    public moveVertically(dy: number): void {
        this.box = movedBox(this.box, 0, dy, 0);
    }

    protected worldX(x: number, z: number): number {
        switch (this.orientation) {
            case undefined:
                return x;
            case 'west':
                return this.box.maxX - z;
            case 'east':
                return this.box.minX + z;
            default:
                return this.box.minX + x;
        }
    }

    protected worldY(y: number): number {
        return this.orientation === undefined ? y : this.box.minY + y;
    }

    protected worldZ(x: number, z: number): number {
        switch (this.orientation) {
            case undefined:
                return z;
            case 'north':
                return this.box.maxZ - z;
            case 'south':
                return this.box.minZ + z;
            default:
                return this.box.minZ + x;
        }
    }

    /** A state turned the way this piece is turned. Hold the result rather than turning per block. */
    protected turned(state: BlockState): BlockState {
        return turnedState(state, this.orientation);
    }

    /** The block already at a local position. Anything outside the chunk being written reads as air. */
    protected blockAt(writer: StructureWriter, x: number, y: number, z: number): BlockState {
        return writer.blockAt(this.worldX(x, z), this.worldY(y), this.worldZ(x, z));
    }

    /** Writes an already-turned state at a local position. Returns whether it landed in the chunk. */
    protected setBlock(writer: StructureWriter, state: BlockState, x: number, y: number, z: number): boolean {
        return writer.setBlock(this.worldX(x, z), this.worldY(y), this.worldZ(x, z), state);
    }

    /**
     * Java's `generateBox`: the shell of the box takes `boundary` and anything strictly inside
     * takes `inside`.
     *
     * @param existingOnly - When true, a cell that is already air is left alone.
     */
    protected fillBox(
        writer: StructureWriter,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        boundary: BlockState,
        inside: BlockState,
        existingOnly: boolean
    ): void {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                for (let z = z0; z <= z1; z++) {
                    if (existingOnly && isAir(this.blockAt(writer, x, y, z))) continue;

                    const shell = y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1;
                    this.setBlock(writer, shell ? boundary : inside, x, y, z);
                }
            }
        }
    }

    /** Carves a box of cave air, which is most of what a mineshaft writes. */
    protected fillAir(
        writer: StructureWriter,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number
    ): void {
        this.fillBox(writer, x0, y0, z0, x1, y1, z1, CAVE_AIR, CAVE_AIR, false);
    }

    /**
     * Java's `generateMaybeBox`: one draw per cell, and the cells that pass take the state.
     *
     * The draw happens for every cell whether or not the cell is written, which is what keeps a
     * ragged corridor ceiling reproducible.
     */
    protected maybeFillBox(
        writer: StructureWriter,
        random: RandomSource,
        chance: number,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        state: BlockState,
        existingOnly: boolean,
        interiorOnly: boolean
    ): void {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                for (let z = z0; z <= z1; z++) {
                    if (random.nextFloat() > chance) continue;
                    if (existingOnly && isAir(this.blockAt(writer, x, y, z))) continue;
                    if (interiorOnly && !this.isInterior(writer, x, y, z)) continue;

                    this.setBlock(writer, state, x, y, z);
                }
            }
        }
    }

    /** Java's `maybeGenerateBlock`: one draw, and the block goes in when it passes. */
    protected maybeBlock(
        writer: StructureWriter,
        random: RandomSource,
        chance: number,
        x: number,
        y: number,
        z: number,
        state: BlockState
    ): void {
        if (random.nextFloat() < chance) this.setBlock(writer, state, x, y, z);
    }

    /**
     * Java's `isInterior`: whether the block above a local position is still under the terrain.
     *
     * Java also requires the position to be inside the chunk being written. The writer does not
     * expose that box, so this answers from the terrain alone.
     */
    protected isInterior(writer: StructureWriter, x: number, y: number, z: number): boolean {
        return this.worldY(y + 1) < writer.heightAt('OCEAN_FLOOR_WG', this.worldX(x, z), this.worldZ(x, z));
    }

    /**
     * Java's `isInInvalidLocation`: a piece with a fluid against any face of its box is dropped,
     * which is what keeps a mineshaft from draining an aquifer into itself.
     *
     * Java also drops a piece in a `#minecraft:mineshaft_blocking` biome, the deep dark. The
     * writer answers no biomes, so that check is left out and a mineshaft can reach into an
     * ancient city's biome.
     */
    protected isInInvalidLocation(writer: StructureWriter): boolean {
        const minX = this.box.minX - 1;
        const maxX = this.box.maxX + 1;
        const minZ = this.box.minZ - 1;
        const maxZ = this.box.maxZ + 1;
        const minY = Math.max(this.box.minY - 1, writer.level.minY);
        const maxY = Math.min(this.box.maxY + 1, writer.level.minY + writer.level.height - 1);

        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (isLiquid(writer.blockAt(x, minY, z)) || isLiquid(writer.blockAt(x, maxY, z))) return true;
            }
        }

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                if (isLiquid(writer.blockAt(x, y, minZ)) || isLiquid(writer.blockAt(x, y, maxZ))) return true;
            }
        }

        for (let z = minZ; z <= maxZ; z++) {
            for (let y = minY; y <= maxY; y++) {
                if (isLiquid(writer.blockAt(minX, y, z)) || isLiquid(writer.blockAt(maxX, y, z))) return true;
            }
        }

        return false;
    }

    /**
     * Java's `setPlanksBlock`: a plank goes under the floor wherever the terrain has nothing to
     * stand on, which is how a corridor bridges a cave it crosses.
     */
    protected setPlanksBlock(writer: StructureWriter, planks: BlockState, x: number, y: number, z: number): void {
        if (!this.isInterior(writer, x, y, z)) return;
        if (isSolidFloor(writer, this.blockAt(writer, x, y, z))) return;

        this.setBlock(writer, planks, x, y, z);
    }

    /**
     * Java's `fillPillarDownOrChainUp`: a support reaches down for a floor to stand a log on, or
     * up for a ceiling to hang a fence and a chain from, and does nothing when it finds neither.
     */
    protected fillPillarDownOrChainUp(
        writer: StructureWriter,
        state: BlockState,
        x: number,
        y: number,
        z: number
    ): void {
        const worldX = this.worldX(x, z);
        const worldZ = this.worldZ(x, z);
        const worldY = this.worldY(y);
        const floorY = writer.level.minY + 1;
        const ceilingY = writer.level.minY + writer.level.height - 1;

        let searchDown = true;
        let searchUp = true;

        for (let distance = 1; searchDown || searchUp; distance++) {
            if (searchDown) {
                const probeY = worldY - distance;
                const probe = writer.blockAt(worldX, probeY, worldZ);
                if (isSolidFloor(writer, probe)) {
                    for (let fill = probeY + 1; fill <= worldY; fill++) writer.setBlock(worldX, fill, worldZ, state);
                    return;
                }

                // Lava ends the search rather than being stood on.
                const lava = probe.name === 'minecraft:lava';
                searchDown = distance <= MAX_PILLAR_HEIGHT && !lava && probeY > floorY;
            }

            if (searchUp) {
                const probeY = worldY + distance;
                if (isSolidFloor(writer, writer.blockAt(worldX, probeY, worldZ))) {
                    writer.setBlock(worldX, worldY + 1, worldZ, this.wood.fence);
                    for (let fill = worldY + 2; fill < probeY; fill++) writer.setBlock(worldX, fill, worldZ, CHAIN);
                    return;
                }

                searchUp = distance <= MAX_CHAIN_HEIGHT && probeY < ceilingY;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Corridor
// ---------------------------------------------------------------------------

/** How long one corridor section is. A corridor runs two, three or four of them. */
const CORRIDOR_SECTION = 5;

/** The corridor's unmoved box for each direction, before it is shifted onto its start position. */
const corridorBox = (direction: Horizontal, length: number): BoundingBox => {
    switch (direction) {
        case 'south':
            return { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: length - 1 };
        case 'west':
            return { minX: -(length - 1), minY: 0, minZ: 0, maxX: 0, maxY: 2, maxZ: 2 };
        case 'east':
            return { minX: 0, minY: 0, minZ: 0, maxX: length - 1, maxY: 2, maxZ: 2 };
        default:
            return { minX: 0, minY: 0, minZ: -(length - 1), maxX: 2, maxY: 2, maxZ: 0 };
    }
};

/**
 * Java's `MineShaftCorridor.findCorridorSize`: the drawn length, or the longest shorter one that
 * does not run into a piece already laid out.
 */
const findCorridor = (
    graph: MineshaftGraph,
    random: RandomSource,
    x: number,
    y: number,
    z: number,
    direction: Horizontal
): BoundingBox | undefined => {
    for (let sections = random.nextInt(3) + 2; sections > 0; sections--) {
        const box = movedBox(corridorBox(direction, sections * CORRIDOR_SECTION), x, y, z);
        if (findCollision(graph, box) === undefined) return box;
    }

    return undefined;
};

/** A length of mineshaft tunnel: the rails, the supports, the cobwebs and the chests. */
class MineshaftCorridor extends MineshaftPiece {
    private readonly hasRails: boolean;
    private readonly spiderCorridor: boolean;
    private readonly sections: number;
    private placedSpawner = false;

    public constructor(
        depth: number,
        random: RandomSource,
        box: BoundingBox,
        orientation: Horizontal,
        variant: MineshaftVariant
    ) {
        super(depth, box, variant, orientation);
        this.hasRails = random.nextInt(3) === 0;
        this.spiderCorridor = !this.hasRails && random.nextInt(23) === 0;
        const alongZ = orientation === 'north' || orientation === 'south';
        this.sections = Math.trunc((alongZ ? spanZ(box) : spanX(box)) / CORRIDOR_SECTION);
    }

    public override addChildren(graph: MineshaftGraph, random: RandomSource): void {
        const depth = this.depth;
        const box = this.box;
        const branch = random.nextInt(4);

        // Java draws the next piece's y drop inside the call it makes, so only the branch it
        // takes draws it.
        const drop = (): number => box.minY - 1 + random.nextInt(3);

        switch (this.orientation) {
            case 'south':
                if (branch <= 1) generateAndAddPiece(graph, random, box.minX, drop(), box.maxZ + 1, 'south', depth);
                else if (branch === 2)
                    generateAndAddPiece(graph, random, box.minX - 1, drop(), box.maxZ - 3, 'west', depth);
                else generateAndAddPiece(graph, random, box.maxX + 1, drop(), box.maxZ - 3, 'east', depth);
                break;
            case 'west':
                if (branch <= 1) generateAndAddPiece(graph, random, box.minX - 1, drop(), box.minZ, 'west', depth);
                else if (branch === 2)
                    generateAndAddPiece(graph, random, box.minX, drop(), box.minZ - 1, 'north', depth);
                else generateAndAddPiece(graph, random, box.minX, drop(), box.maxZ + 1, 'south', depth);
                break;
            case 'east':
                if (branch <= 1) generateAndAddPiece(graph, random, box.maxX + 1, drop(), box.minZ, 'east', depth);
                else if (branch === 2)
                    generateAndAddPiece(graph, random, box.maxX - 3, drop(), box.minZ - 1, 'north', depth);
                else generateAndAddPiece(graph, random, box.maxX - 3, drop(), box.maxZ + 1, 'south', depth);
                break;
            default:
                if (branch <= 1) generateAndAddPiece(graph, random, box.minX, drop(), box.minZ - 1, 'north', depth);
                else if (branch === 2)
                    generateAndAddPiece(graph, random, box.minX - 1, drop(), box.minZ, 'west', depth);
                else generateAndAddPiece(graph, random, box.maxX + 1, drop(), box.minZ, 'east', depth);
        }

        if (depth >= MAX_DEPTH) return;

        // Every fifth block along the corridor's own axis is a chance of a side tunnel.
        if (this.orientation === 'north' || this.orientation === 'south') {
            for (let z = box.minZ + 3; z + 3 <= box.maxZ; z += CORRIDOR_SECTION) {
                const side = random.nextInt(5);
                if (side === 0) generateAndAddPiece(graph, random, box.minX - 1, box.minY, z, 'west', depth + 1);
                else if (side === 1) generateAndAddPiece(graph, random, box.maxX + 1, box.minY, z, 'east', depth + 1);
            }
            return;
        }

        for (let x = box.minX + 3; x + 3 <= box.maxX; x += CORRIDOR_SECTION) {
            const side = random.nextInt(5);
            if (side === 0) generateAndAddPiece(graph, random, x, box.minY, box.minZ - 1, 'north', depth + 1);
            else if (side === 1) generateAndAddPiece(graph, random, x, box.minY, box.maxZ + 1, 'south', depth + 1);
        }
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        if (this.isInInvalidLocation(writer)) return;

        const far = this.sections * CORRIDOR_SECTION - 1;
        const planks = this.turned(this.wood.planks);
        const log = this.turned(this.wood.log);
        const rail = this.turned(RAIL);
        const cobweb = this.turned(COBWEB);

        this.fillAir(writer, 0, 0, 0, 2, 1, far);
        this.maybeFillBox(writer, random, 0.8, 0, 2, 0, 2, 2, far, CAVE_AIR, false, false);
        if (this.spiderCorridor) {
            this.maybeFillBox(writer, random, 0.6, 0, 0, 0, 2, 1, far, cobweb, false, true);
        }

        for (let section = 0; section < this.sections; section++) {
            const z = 2 + section * CORRIDOR_SECTION;
            this.placeSupport(writer, random, z);
            this.placeCobweb(writer, random, cobweb, 0.1, 0, 2, z - 1);
            this.placeCobweb(writer, random, cobweb, 0.1, 2, 2, z - 1);
            this.placeCobweb(writer, random, cobweb, 0.1, 0, 2, z + 1);
            this.placeCobweb(writer, random, cobweb, 0.1, 2, 2, z + 1);
            this.placeCobweb(writer, random, cobweb, 0.05, 0, 2, z - 2);
            this.placeCobweb(writer, random, cobweb, 0.05, 2, 2, z - 2);
            this.placeCobweb(writer, random, cobweb, 0.05, 0, 2, z + 2);
            this.placeCobweb(writer, random, cobweb, 0.05, 2, 2, z + 2);

            if (random.nextInt(100) === 0) this.createChest(writer, random, 2, 0, z - 1);
            if (random.nextInt(100) === 0) this.createChest(writer, random, 0, 0, z + 1);

            if (this.spiderCorridor && !this.placedSpawner) this.placeSpawner(writer, random, z);
        }

        for (let x = 0; x <= 2; x++) {
            for (let z = 0; z <= far; z++) this.setPlanksBlock(writer, planks, x, -1, z);
        }

        this.placeDoubleSupport(writer, log, planks, 2);
        if (this.sections > 1) this.placeDoubleSupport(writer, log, planks, far - 2);

        if (!this.hasRails) return;

        for (let z = 0; z <= far; z++) {
            if (!isSolidFloor(writer, this.blockAt(writer, 1, -1, z))) continue;

            // Rails are laid thinner where the corridor is open to the air above it.
            const chance = this.isInterior(writer, 1, 0, z) ? 0.7 : 0.9;
            this.maybeBlock(writer, random, chance, 1, 0, z, rail);
        }
    }

    /** Java's `placeSupport`: two fence posts, a beam across them and sometimes a pair of torches. */
    private placeSupport(writer: StructureWriter, random: RandomSource, z: number): void {
        if (!this.isSupportingBox(writer, z)) return;

        const planks = this.turned(this.wood.planks);
        this.fillBox(writer, 0, 0, z, 0, 1, z, this.turned(this.wood.fenceWest), CAVE_AIR, false);
        this.fillBox(writer, 2, 0, z, 2, 1, z, this.turned(this.wood.fenceEast), CAVE_AIR, false);

        if (random.nextInt(4) === 0) {
            this.fillBox(writer, 0, 2, z, 0, 2, z, planks, CAVE_AIR, false);
            this.fillBox(writer, 2, 2, z, 2, 2, z, planks, CAVE_AIR, false);
            return;
        }

        this.fillBox(writer, 0, 2, z, 2, 2, z, planks, CAVE_AIR, false);
        this.maybeBlock(writer, random, 0.05, 1, 2, z - 1, this.turned(TORCH_NORTH));
        this.maybeBlock(writer, random, 0.05, 1, 2, z + 1, this.turned(TORCH_SOUTH));
    }

    /** Java's `isSupportingBox`: a support needs something above all three of its columns. */
    private isSupportingBox(writer: StructureWriter, z: number): boolean {
        for (let x = 0; x <= 2; x++) {
            if (isAir(this.blockAt(writer, x, 3, z))) return false;
        }

        return true;
    }

    /** Java's `placeCobWeb`: a web only hangs where the corridor is under the terrain. */
    private placeCobweb(
        writer: StructureWriter,
        random: RandomSource,
        cobweb: BlockState,
        chance: number,
        x: number,
        y: number,
        z: number
    ): void {
        if (this.isInterior(writer, x, y, z)) this.maybeBlock(writer, random, chance, x, y, z, cobweb);
    }

    /** The one cave spider spawner a spider corridor holds, drawn near one of its supports. */
    private placeSpawner(writer: StructureWriter, random: RandomSource, z: number): void {
        const spawnerZ = z - 1 + random.nextInt(3);
        if (!this.isInterior(writer, 1, 0, spawnerZ)) return;
        // Java guards this with the chunk clip so a neighboring chunk cannot claim the spawner.
        // The write's own answer says the same thing.
        if (!this.setBlock(writer, SPAWNER, 1, 0, spawnerZ)) return;

        this.placedSpawner = true;
        writer.setBlockEntity(this.worldX(1, spawnerZ), this.worldY(0), this.worldZ(1, spawnerZ), {
            id: 'minecraft:mob_spawner',
            spawnEntity: 'minecraft:cave_spider'
        });
    }

    /** Java's `placeDoubleLowerOrUpperSupport`: both ends of a plank floor get carried. */
    private placeDoubleSupport(writer: StructureWriter, log: BlockState, planks: BlockState, z: number): void {
        if (this.blockAt(writer, 0, -1, z).name === planks.name) this.fillPillarDownOrChainUp(writer, log, 0, -1, z);
        if (this.blockAt(writer, 2, -1, z).name === planks.name) this.fillPillarDownOrChainUp(writer, log, 2, -1, z);
    }

    /**
     * Java's `createChest`: a chest minecart parked on a rail.
     *
     * There is no seam for an entity's loot table, so the chest goes on the floor where the
     * minecart would stand, instead of the rail under it. Both of Java's draws still happen, so
     * whatever draws next draws what it draws in Java.
     */
    private createChest(writer: StructureWriter, random: RandomSource, x: number, y: number, z: number): void {
        if (!isAir(this.blockAt(writer, x, y, z))) return;
        if (isAir(this.blockAt(writer, x, y - 1, z))) return;

        random.nextBoolean();
        random.nextLong();

        this.setBlock(writer, CHEST, x, y, z);
        writer.setBlockEntity(this.worldX(x, z), this.worldY(y), this.worldZ(x, z), {
            id: 'minecraft:chest',
            lootTable: MINESHAFT_LOOT
        });
    }
}

// ---------------------------------------------------------------------------
// Crossing
// ---------------------------------------------------------------------------

/** The crossing's unmoved box. A tall one gets a second floor. */
const crossingBox = (direction: Horizontal, height: number): BoundingBox => {
    switch (direction) {
        case 'south':
            return { minX: -1, minY: 0, minZ: 0, maxX: 3, maxY: height, maxZ: 4 };
        case 'west':
            return { minX: -4, minY: 0, minZ: -1, maxX: 0, maxY: height, maxZ: 3 };
        case 'east':
            return { minX: 0, minY: 0, minZ: -1, maxX: 4, maxY: height, maxZ: 3 };
        default:
            return { minX: -1, minY: 0, minZ: -4, maxX: 3, maxY: height, maxZ: 0 };
    }
};

/** Java's `MineShaftCrossing.findCrossing`, where one crossing in four is two floors tall. */
const findCrossing = (
    graph: MineshaftGraph,
    random: RandomSource,
    x: number,
    y: number,
    z: number,
    direction: Horizontal
): BoundingBox | undefined => {
    const height = random.nextInt(4) === 0 ? 6 : 2;
    const box = movedBox(crossingBox(direction, height), x, y, z);
    return findCollision(graph, box) === undefined ? box : undefined;
};

/** Where tunnels meet: a plank floor, four pillars, and sometimes a second storey. */
class MineshaftCrossing extends MineshaftPiece {
    private readonly direction: Horizontal;
    private readonly twoFloored: boolean;

    public constructor(depth: number, box: BoundingBox, direction: Horizontal, variant: MineshaftVariant) {
        // Java leaves a crossing unoriented, so it writes in world coordinates.
        super(depth, box, variant, undefined);
        this.direction = direction;
        this.twoFloored = spanY(box) > 3;
    }

    public override addChildren(graph: MineshaftGraph, random: RandomSource): void {
        const depth = this.depth;
        const box = this.box;

        switch (this.direction) {
            case 'south':
                generateAndAddPiece(graph, random, box.minX + 1, box.minY, box.maxZ + 1, 'south', depth);
                generateAndAddPiece(graph, random, box.minX - 1, box.minY, box.minZ + 1, 'west', depth);
                generateAndAddPiece(graph, random, box.maxX + 1, box.minY, box.minZ + 1, 'east', depth);
                break;
            case 'west':
                generateAndAddPiece(graph, random, box.minX + 1, box.minY, box.minZ - 1, 'north', depth);
                generateAndAddPiece(graph, random, box.minX + 1, box.minY, box.maxZ + 1, 'south', depth);
                generateAndAddPiece(graph, random, box.minX - 1, box.minY, box.minZ + 1, 'west', depth);
                break;
            case 'east':
                generateAndAddPiece(graph, random, box.minX + 1, box.minY, box.minZ - 1, 'north', depth);
                generateAndAddPiece(graph, random, box.minX + 1, box.minY, box.maxZ + 1, 'south', depth);
                generateAndAddPiece(graph, random, box.maxX + 1, box.minY, box.minZ + 1, 'east', depth);
                break;
            default:
                generateAndAddPiece(graph, random, box.minX + 1, box.minY, box.minZ - 1, 'north', depth);
                generateAndAddPiece(graph, random, box.minX - 1, box.minY, box.minZ + 1, 'west', depth);
                generateAndAddPiece(graph, random, box.maxX + 1, box.minY, box.minZ + 1, 'east', depth);
        }

        if (!this.twoFloored) return;

        const upper = box.minY + 4;
        if (random.nextBoolean()) generateAndAddPiece(graph, random, box.minX + 1, upper, box.minZ - 1, 'north', depth);
        if (random.nextBoolean()) generateAndAddPiece(graph, random, box.minX - 1, upper, box.minZ + 1, 'west', depth);
        if (random.nextBoolean()) generateAndAddPiece(graph, random, box.maxX + 1, upper, box.minZ + 1, 'east', depth);
        if (random.nextBoolean()) generateAndAddPiece(graph, random, box.minX + 1, upper, box.maxZ + 1, 'south', depth);
    }

    public place(writer: StructureWriter): void {
        if (this.isInInvalidLocation(writer)) return;

        const box = this.box;

        if (this.twoFloored) {
            const lower = box.minY + 2;
            this.fillAir(writer, box.minX + 1, box.minY, box.minZ, box.maxX - 1, lower, box.maxZ);
            this.fillAir(writer, box.minX, box.minY, box.minZ + 1, box.maxX, lower, box.maxZ - 1);
            this.fillAir(writer, box.minX + 1, box.maxY - 2, box.minZ, box.maxX - 1, box.maxY, box.maxZ);
            this.fillAir(writer, box.minX, box.maxY - 2, box.minZ + 1, box.maxX, box.maxY, box.maxZ - 1);
            this.fillAir(writer, box.minX + 1, box.minY + 3, box.minZ + 1, box.maxX - 1, box.minY + 3, box.maxZ - 1);
        } else {
            this.fillAir(writer, box.minX + 1, box.minY, box.minZ, box.maxX - 1, box.maxY, box.maxZ);
            this.fillAir(writer, box.minX, box.minY, box.minZ + 1, box.maxX, box.maxY, box.maxZ - 1);
        }

        this.placePillar(writer, box.minX + 1, box.minZ + 1);
        this.placePillar(writer, box.minX + 1, box.maxZ - 1);
        this.placePillar(writer, box.maxX - 1, box.minZ + 1);
        this.placePillar(writer, box.maxX - 1, box.maxZ - 1);

        const floorY = box.minY - 1;
        for (let x = box.minX; x <= box.maxX; x++) {
            for (let z = box.minZ; z <= box.maxZ; z++) this.setPlanksBlock(writer, this.wood.planks, x, floorY, z);
        }
    }

    /** Java's `placeSupportPillar`: a plank column, but only where there is a ceiling to hold up. */
    private placePillar(writer: StructureWriter, x: number, z: number): void {
        if (isAir(this.blockAt(writer, x, this.box.maxY + 1, z))) return;

        for (let y = this.box.minY; y <= this.box.maxY; y++) this.setBlock(writer, this.wood.planks, x, y, z);
    }
}

// ---------------------------------------------------------------------------
// Stairs
// ---------------------------------------------------------------------------

/** The stairwell's unmoved box: eight blocks along, five down. */
const stairsBox = (direction: Horizontal): BoundingBox => {
    switch (direction) {
        case 'south':
            return { minX: 0, minY: -5, minZ: 0, maxX: 2, maxY: 2, maxZ: 8 };
        case 'west':
            return { minX: -8, minY: -5, minZ: 0, maxX: 0, maxY: 2, maxZ: 2 };
        case 'east':
            return { minX: 0, minY: -5, minZ: 0, maxX: 8, maxY: 2, maxZ: 2 };
        default:
            return { minX: 0, minY: -5, minZ: -8, maxX: 2, maxY: 2, maxZ: 0 };
    }
};

/** Java's `MineShaftStairs.findStairs`, which has one candidate and takes it or nothing. */
const findStairs = (
    graph: MineshaftGraph,
    x: number,
    y: number,
    z: number,
    direction: Horizontal
): BoundingBox | undefined => {
    const box = movedBox(stairsBox(direction), x, y, z);
    return findCollision(graph, box) === undefined ? box : undefined;
};

/** The sloping shaft that carries a tunnel down a level. It carves air and places nothing. */
class MineshaftStairs extends MineshaftPiece {
    public constructor(depth: number, box: BoundingBox, orientation: Horizontal, variant: MineshaftVariant) {
        super(depth, box, variant, orientation);
    }

    public override addChildren(graph: MineshaftGraph, random: RandomSource): void {
        const box = this.box;
        switch (this.orientation) {
            case 'south':
                generateAndAddPiece(graph, random, box.minX, box.minY, box.maxZ + 1, 'south', this.depth);
                break;
            case 'west':
                generateAndAddPiece(graph, random, box.minX - 1, box.minY, box.minZ, 'west', this.depth);
                break;
            case 'east':
                generateAndAddPiece(graph, random, box.maxX + 1, box.minY, box.minZ, 'east', this.depth);
                break;
            default:
                generateAndAddPiece(graph, random, box.minX, box.minY, box.minZ - 1, 'north', this.depth);
        }
    }

    public place(writer: StructureWriter): void {
        if (this.isInInvalidLocation(writer)) return;

        this.fillAir(writer, 0, 5, 0, 2, 7, 1);
        this.fillAir(writer, 0, 0, 7, 2, 2, 8);

        for (let step = 0; step < 5; step++) {
            const bottom = 5 - step - (step < 4 ? 1 : 0);
            this.fillAir(writer, 0, bottom, 2 + step, 2, 7 - step, 2 + step);
        }
    }
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

/** The cavern a mineshaft starts from. Everything else chains off its four walls. */
class MineshaftRoom extends MineshaftPiece {
    private entrances: BoundingBox[] = [];

    public constructor(depth: number, random: RandomSource, x: number, z: number, variant: MineshaftVariant) {
        super(
            depth,
            {
                minX: x,
                minY: LAYOUT_Y,
                minZ: z,
                maxX: x + 7 + random.nextInt(6),
                maxY: 54 + random.nextInt(6),
                maxZ: z + 7 + random.nextInt(6)
            },
            variant,
            undefined
        );
    }

    public override moveVertically(dy: number): void {
        super.moveVertically(dy);
        this.entrances = this.entrances.map((entrance) => movedBox(entrance, 0, dy, 0));
    }

    public override addChildren(graph: MineshaftGraph, random: RandomSource): void {
        const box = this.box;
        const lift = Math.max(spanY(box) - 4, 1);
        const tunnelY = (): number => box.minY + random.nextInt(lift) + 1;

        this.walkWall(random, spanX(box), (offset) => {
            const piece = generateAndAddPiece(
                graph,
                random,
                box.minX + offset,
                tunnelY(),
                box.minZ - 1,
                'north',
                this.depth
            );
            if (piece === undefined) return;

            const child = piece.boundingBox;
            this.entrances.push({
                minX: child.minX,
                minY: child.minY,
                minZ: box.minZ,
                maxX: child.maxX,
                maxY: child.maxY,
                maxZ: box.minZ + 1
            });
        });

        this.walkWall(random, spanX(box), (offset) => {
            const piece = generateAndAddPiece(
                graph,
                random,
                box.minX + offset,
                tunnelY(),
                box.maxZ + 1,
                'south',
                this.depth
            );
            if (piece === undefined) return;

            const child = piece.boundingBox;
            this.entrances.push({
                minX: child.minX,
                minY: child.minY,
                minZ: box.maxZ - 1,
                maxX: child.maxX,
                maxY: child.maxY,
                maxZ: box.maxZ
            });
        });

        this.walkWall(random, spanZ(box), (offset) => {
            const piece = generateAndAddPiece(
                graph,
                random,
                box.minX - 1,
                tunnelY(),
                box.minZ + offset,
                'west',
                this.depth
            );
            if (piece === undefined) return;

            const child = piece.boundingBox;
            this.entrances.push({
                minX: box.minX,
                minY: child.minY,
                minZ: child.minZ,
                maxX: box.minX + 1,
                maxY: child.maxY,
                maxZ: child.maxZ
            });
        });

        this.walkWall(random, spanZ(box), (offset) => {
            const piece = generateAndAddPiece(
                graph,
                random,
                box.maxX + 1,
                tunnelY(),
                box.minZ + offset,
                'east',
                this.depth
            );
            if (piece === undefined) return;

            const child = piece.boundingBox;
            this.entrances.push({
                minX: box.maxX - 1,
                minY: child.minY,
                minZ: child.minZ,
                maxX: box.maxX,
                maxY: child.maxY,
                maxZ: child.maxZ
            });
        });
    }

    public place(writer: StructureWriter): void {
        if (this.isInInvalidLocation(writer)) return;

        const box = this.box;
        this.fillBox(writer, box.minX, box.minY, box.minZ, box.maxX, box.minY, box.maxZ, DIRT, DIRT, true);
        this.fillAir(writer, box.minX, box.minY + 1, box.minZ, box.maxX, Math.min(box.minY + 3, box.maxY), box.maxZ);

        for (const entrance of this.entrances) {
            const { minX, minZ, maxX, maxY, maxZ } = entrance;
            this.fillAir(writer, minX, maxY - 2, minZ, maxX, maxY, maxZ);
        }

        this.fillUpperHalfSphere(writer, box.minY + 4);
    }

    /**
     * Java's room walk: step a random distance along a wall, open a tunnel if three blocks are
     * left, and step four more. The draw happens even on the step that breaks the loop.
     */
    private walkWall(random: RandomSource, span: number, open: (offset: number) => void): void {
        let offset = 0;
        while (offset < span) {
            offset += random.nextInt(span);
            if (offset + 3 > span) return;

            open(offset);
            offset += 4;
        }
    }

    /** Java's `generateUpperHalfSphere`: the domed ceiling the room is hollowed out under. */
    private fillUpperHalfSphere(writer: StructureWriter, fromY: number): void {
        const box = this.box;
        const width = spanX(box);
        const depth = spanZ(box);
        const height = box.maxY - fromY + 1;
        const centerX = box.minX + width / 2;
        const centerZ = box.minZ + depth / 2;

        for (let y = fromY; y <= box.maxY; y++) {
            const dy = (y - fromY) / height;
            for (let x = box.minX; x <= box.maxX; x++) {
                const dx = (x - centerX) / (width * 0.5);
                for (let z = box.minZ; z <= box.maxZ; z++) {
                    const dz = (z - centerZ) / (depth * 0.5);
                    if (dx * dx + dy * dy + dz * dz <= 1.05) this.setBlock(writer, CAVE_AIR, x, y, z);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The piece graph
// ---------------------------------------------------------------------------

/**
 * Java's `createRandomShaftPiece`: one draw in a hundred picks the kind, and the piece is
 * dropped when its box runs into something already laid out.
 */
const createRandomShaftPiece = (
    graph: MineshaftGraph,
    random: RandomSource,
    x: number,
    y: number,
    z: number,
    direction: Horizontal,
    depth: number
): MineshaftPiece | undefined => {
    const roll = random.nextInt(100);

    if (roll >= 80) {
        const box = findCrossing(graph, random, x, y, z, direction);
        return box === undefined ? undefined : new MineshaftCrossing(depth, box, direction, graph.variant);
    }

    if (roll >= 70) {
        const box = findStairs(graph, x, y, z, direction);
        return box === undefined ? undefined : new MineshaftStairs(depth, box, direction, graph.variant);
    }

    const box = findCorridor(graph, random, x, y, z, direction);
    return box === undefined ? undefined : new MineshaftCorridor(depth, random, box, direction, graph.variant);
};

/**
 * Java's `generateAndAddPiece`: builds the next piece, records it and lets it chain its own.
 *
 * The recursion stops at the depth limit and at 80 blocks from the room's corner, which is what
 * bounds a mineshaft to the window a structure start is allowed to reach into.
 */
const generateAndAddPiece = (
    graph: MineshaftGraph,
    random: RandomSource,
    x: number,
    y: number,
    z: number,
    direction: Horizontal,
    depth: number
): MineshaftPiece | undefined => {
    if (depth > MAX_DEPTH) return undefined;

    const room = graph.start.boundingBox;
    if (Math.abs(x - room.minX) > MAX_SPREAD || Math.abs(z - room.minZ) > MAX_SPREAD) return undefined;

    const piece = createRandomShaftPiece(graph, random, x, y, z, direction, depth + 1);
    if (piece === undefined) return undefined;

    graph.pieces.push(piece);
    piece.addChildren(graph, random);
    return piece;
};

/**
 * How far the finished shaft moves to reach its final height.
 *
 * The normal variant drops its ceiling to a drawn level ten or more blocks under the sea, which
 * is Java's `moveBelowSeaLevel`. The mesa variant lifts its center to a drawn level between the
 * sea and the terrain over it, which is what leaves a badlands mineshaft in the open.
 */
const settleShift = (graph: MineshaftGraph, context: StructureBuildContext): number => {
    const box = unionOf(graph.pieces);
    const seaLevel = context.level.seaLevel;

    if (graph.variant === 'mesa') {
        const centerX = box.minX + Math.trunc(spanX(box) / 2);
        const centerY = box.minY + Math.trunc(spanY(box) / 2);
        const centerZ = box.minZ + Math.trunc(spanZ(box) / 2);
        const surface = context.level.baseHeight(centerX, centerZ, 'WORLD_SURFACE_WG');
        const target = surface <= seaLevel ? seaLevel : seaLevel + context.random.nextInt(surface - seaLevel + 1);
        return target - centerY;
    }

    const ceiling = seaLevel - SEA_LEVEL_CLEARANCE;
    let top = spanY(box) + context.level.minY + 1;
    if (top < ceiling) top += context.random.nextInt(ceiling - top);
    return top - box.maxY;
};

/**
 * How far a laid-out piece is from the room it chained off, or undefined for a piece some other
 * structure produced. The room is zero and nothing Java builds goes past nine.
 */
export const mineshaftPieceDepth = (piece: StructurePiece): number | undefined =>
    piece instanceof MineshaftPiece ? piece.depth : undefined;

/**
 * Lays out an abandoned mineshaft: a room in the start chunk, the tunnels that chain off it, and
 * the one vertical move that settles all of them together.
 *
 * This is the one structure Java also assembles before it checks the biome, and for the same
 * reason: the settling move the tunnels make is what decides the generation point's own y, so
 * there is nothing to check until the tunnels exist. `MineshaftStructure.findGenerationPoint`
 * answers with `Either.right` of a built pieces list rather than a consumer.
 */
export const buildMineshaft: StructureBuilder = (context): StructureLayout | undefined => {
    const variant: MineshaftVariant = context.definition.mineshaft_type === 'mesa' ? 'mesa' : 'normal';

    // Java draws and discards one double before it touches the chunk, left over from the days
    // when the structure decided its own frequency. Dropping it would shift every draw after it.
    context.random.nextDouble();

    const room = new MineshaftRoom(0, context.random, context.chunkX * 16 + 2, context.chunkZ * 16 + 2, variant);
    const graph: MineshaftGraph = { start: room, variant, pieces: [room] };
    room.addChildren(graph, context.random);

    const shift = settleShift(graph, context);
    for (const piece of graph.pieces) piece.moveVertically(shift);

    return {
        origin: { x: context.chunkX * 16 + 8, y: LAYOUT_Y + shift, z: context.chunkZ * 16 + 8 },
        pieces: () => graph.pieces
    };
};
