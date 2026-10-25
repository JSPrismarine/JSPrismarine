/**
 * The four structures Java builds block by block in code, with no template behind them.
 *
 * The desert pyramid, the jungle temple and the swamp hut are Java's `ScatteredFeaturePiece`
 * subclasses, and buried treasure is the one-block piece that hides a chest under the sea floor.
 * None of them reads an `.nbt` template, so each has a piece class here whose `place` writes the
 * blocks the Java class writes.
 *
 * Java builds a scattered piece in its own frame. The piece is given one of the four horizontal
 * directions, `getWorldX`, `getWorldY` and `getWorldZ` map its local coordinates into the world,
 * and `Mirror.LEFT_RIGHT` plus a quarter turn carry the block states along with them. That frame
 * is reproduced below, so a pyramid can face any of the four directions rather than only north.
 *
 * One thing is done differently from Java, for the reason `javaStructureLegacyTemplates.ts`
 * gives. Java settles a scattered feature onto the terrain inside `postProcess`, which runs once
 * per chunk the piece covers and draws that chunk's own random. A pyramid that spans a chunk
 * border can sink by a different amount on each side. The height is settled here while the
 * structure is laid out, so the whole of it lands at one y. Laying out sees only the bare noise
 * terrain, so the average is taken over `WORLD_SURFACE_WG` where Java's
 * `updateAverageGroundHeight` reads `MOTION_BLOCKING_NO_LEAVES` off a chunk whose surface rules
 * have already run. Buried treasure settles the same way: Java walks down from the sea floor
 * inside `postProcess`, and the walk happens here against `StructureLevel.baseBlock` instead.
 *
 * The swamp hut and buried treasure are complete. The pyramid's and the temple's interiors are
 * reconstructions rather than block-exact copies of Java's classes. The comment on each piece
 * marks what is taken from Java and what is not.
 */
import type { BlockState, Direction } from '@jsprismarine/features';
import { DIRECTION_STEPS } from '@jsprismarine/features';
import type { BoundingBox, RandomSource } from '@jsprismarine/structures';
import { rotateDirection } from '@jsprismarine/structures';

import { rotationOf } from './javaStructureJigsaw';
import type { StructureBuildContext, StructureBuilder, StructureLayout } from './javaStructureStarts';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';
import { boxFromSize } from './javaStructureWorld';

// ---------------------------------------------------------------------------
// The frame a scattered piece is written in
// ---------------------------------------------------------------------------

/** The four horizontal directions, in the order `Direction.Plane.HORIZONTAL` lists them. */
const HORIZONTAL_DIRECTIONS = ['north', 'east', 'south', 'west'] as const;

/** The direction a piece's local `+z` axis points along, which Java calls its orientation. */
type PieceFacing = (typeof HORIZONTAL_DIRECTIONS)[number];

const DIRECTION_NAMES: ReadonlySet<string> = new Set(Object.keys(DIRECTION_STEPS));

const isDirection = (value: string): value is Direction => DIRECTION_NAMES.has(value);

const isPieceFacing = (value: string): value is PieceFacing =>
    HORIZONTAL_DIRECTIONS.some((candidate) => candidate === value);

/** Java's `Direction.Plane.HORIZONTAL.getRandomDirection`: one draw over four faces. */
const randomHorizontal = (random: RandomSource): PieceFacing =>
    HORIZONTAL_DIRECTIONS[random.nextInt(HORIZONTAL_DIRECTIONS.length)] ?? 'north';

/** The mirror and turn Java's `StructurePiece.setOrientation` derives from an orientation. */
interface StateTransform {
    /** Whether `Mirror.LEFT_RIGHT` runs first, which inverts the z axis. */
    readonly mirrored: boolean;
    /** The quarter turns applied after the mirror. */
    readonly quarterTurns: number;
}

const STATE_TRANSFORMS: Readonly<Record<PieceFacing, StateTransform>> = {
    north: { mirrored: false, quarterTurns: 0 },
    east: { mirrored: false, quarterTurns: 1 },
    south: { mirrored: true, quarterTurns: 0 },
    west: { mirrored: true, quarterTurns: 1 }
};

/** Java's `Mirror.LEFT_RIGHT`: north and south swap, the other four faces stay. */
const mirrorAcrossZ = (direction: Direction): Direction =>
    direction === 'north' ? 'south' : direction === 'south' ? 'north' : direction;

/** A facing, mirrored and then turned, which is the order `mirror` and `rotate` run in. */
const turnFacing = (direction: Direction, transform: StateTransform): Direction =>
    rotateDirection(transform.mirrored ? mirrorAcrossZ(direction) : direction, rotationOf(transform.quarterTurns));

/** A quarter turn swaps the two horizontal axes of a pillar. */
const turnAxis = (axis: string, transform: StateTransform): string =>
    transform.quarterTurns % 2 === 0 ? axis : axis === 'x' ? 'z' : axis === 'z' ? 'x' : axis;

/** A mirror swaps the left and right corners of a stair; a turn leaves the corner alone. */
const MIRRORED_SHAPES: Readonly<Record<string, string>> = {
    inner_left: 'inner_right',
    inner_right: 'inner_left',
    outer_left: 'outer_right',
    outer_right: 'outer_left'
};

/**
 * A block state carried into the piece's orientation.
 *
 * The three property shapes a scattered piece writes all move: `facing` and `axis` turn, `shape`
 * flips under the mirror, and the per-side booleans a vine or a tripwire carries move to the
 * side they end up on.
 */
const turnState = (state: BlockState, transform: StateTransform): BlockState => {
    if (!transform.mirrored && transform.quarterTurns === 0) return state;

    const properties: Record<string, string> = {};
    for (const [name, value] of Object.entries(state.properties)) {
        if (name === 'facing' && isDirection(value)) properties[name] = turnFacing(value, transform);
        else if (name === 'axis') properties[name] = turnAxis(value, transform);
        else if (name === 'shape' && transform.mirrored) properties[name] = MIRRORED_SHAPES[value] ?? value;
        else if (isPieceFacing(name)) properties[turnFacing(name, transform)] = value;
        else properties[name] = value;
    }

    return { name: state.name, properties };
};

/** Java's `StructurePiece.makeBoundingBox`: the depth runs along the piece's own facing. */
const scatteredBox = (
    x: number,
    y: number,
    z: number,
    facing: PieceFacing,
    width: number,
    height: number,
    depth: number
): BoundingBox =>
    facing === 'north' || facing === 'south'
        ? boxFromSize(x, y, z, width, height, depth)
        : boxFromSize(x, y, z, depth, height, width);

/**
 * Java's `ScatteredFeaturePiece.updateAverageGroundHeight`, taken against the bare terrain.
 *
 * @returns The mean terrain height under the box's footprint, truncated the way Java's integer
 *   division truncates.
 */
const averageGroundHeight = (level: StructureLevel, box: BoundingBox): number => {
    let total = 0;
    let count = 0;
    for (let z = box.minZ; z <= box.maxZ; z++) {
        for (let x = box.minX; x <= box.maxX; x++) {
            total += level.baseHeight(x, z, 'WORLD_SURFACE_WG');
            count++;
        }
    }

    return count === 0 ? level.seaLevel : Math.trunc(total / count);
};

/** The box a scattered piece ends up in, already settled onto the terrain. */
const settledScatteredBox = (
    context: StructureBuildContext,
    facing: PieceFacing,
    width: number,
    height: number,
    depth: number
): BoundingBox => {
    const footprint = scatteredBox(context.chunkX * 16, 0, context.chunkZ * 16, facing, width, height, depth);
    const ground = averageGroundHeight(context.level, footprint);
    return { ...footprint, minY: ground, maxY: ground + height - 1 };
};

/** The middle of a chunk, which is where `Structure.onTopOfChunkCenter` takes its sample. */
const chunkCenter = (chunkX: number, chunkZ: number): { x: number; z: number } => ({
    x: chunkX * 16 + 8,
    z: chunkZ * 16 + 8
});

/**
 * The shape every scattered structure shares: a generation point on top of the chunk's middle,
 * and one piece turned a drawn quarter turn and settled onto the terrain under it.
 *
 * Java's `SinglePieceStructure.findGenerationPoint` reads the one column the generation point
 * sits on and hands the piece itself to `onTopOfChunkCenter` as a consumer, so the facing draw
 * and the settling happen behind the biome check. Settling is the expensive half: it averages
 * the terrain over the piece's whole footprint, which for a desert pyramid is 441 columns
 * against the generation point's one.
 */
const scatteredLayout = (
    context: StructureBuildContext,
    heightmap: 'WORLD_SURFACE_WG' | 'OCEAN_FLOOR_WG',
    assemble: () => readonly StructurePiece[]
): StructureLayout => {
    const center = chunkCenter(context.chunkX, context.chunkZ);
    return {
        origin: { x: center.x, y: context.level.baseHeight(center.x, center.z, heightmap), z: center.z },
        pieces: assemble
    };
};

/** One scattered piece, turned a drawn quarter turn and settled onto the terrain under it. */
const settledScatteredPiece = <T>(
    context: StructureBuildContext,
    extent: { readonly width: number; readonly height: number; readonly depth: number },
    construct: (box: BoundingBox, facing: PieceFacing) => T
): readonly T[] => {
    const facing = randomHorizontal(context.random);
    return [construct(settledScatteredBox(context, facing, extent.width, extent.height, extent.depth), facing)];
};

/** A block state, spelled the way Java's `defaultBlockState` with explicit values would be. */
const block = (name: string, properties: Readonly<Record<string, string>> = {}): BlockState => ({ name, properties });

const AIR = block('minecraft:air');
const CAVE_AIR = block('minecraft:cave_air');
const SAND = block('minecraft:sand');
const SANDSTONE = block('minecraft:sandstone');
const CHISELED_SANDSTONE = block('minecraft:chiseled_sandstone');
const CUT_SANDSTONE = block('minecraft:cut_sandstone');
const ORANGE_TERRACOTTA = block('minecraft:orange_terracotta');
const BLUE_TERRACOTTA = block('minecraft:blue_terracotta');
const TNT = block('minecraft:tnt');
const STONE_PRESSURE_PLATE = block('minecraft:stone_pressure_plate');
const COBBLESTONE = block('minecraft:cobblestone');
const MOSSY_COBBLESTONE = block('minecraft:mossy_cobblestone');
const REDSTONE_WIRE = block('minecraft:redstone_wire');
const CHEST = block('minecraft:chest');
const SPRUCE_PLANKS = block('minecraft:spruce_planks');
const OAK_LOG = block('minecraft:oak_log', { axis: 'y' });
const OAK_FENCE = block('minecraft:oak_fence');
const CAULDRON = block('minecraft:cauldron');
const CRAFTING_TABLE = block('minecraft:crafting_table');
const POTTED_RED_MUSHROOM = block('minecraft:potted_red_mushroom');

/** The states a column may be filled through, which is Java's air-or-fluid test. */
const PASSABLE_COLUMN: ReadonlySet<string> = new Set([
    'minecraft:air',
    'minecraft:cave_air',
    'minecraft:void_air',
    'minecraft:water',
    'minecraft:lava'
]);

/**
 * A piece written in Java's scattered-feature frame.
 *
 * Everything a subclass writes is in local coordinates with `+x` to the piece's right, `+y` up
 * and `+z` into it, and the mapping into the world is this class's whole job.
 */
abstract class ScatteredPiece implements StructurePiece {
    private readonly transform: StateTransform;

    protected constructor(
        public readonly boundingBox: BoundingBox,
        private readonly facing: PieceFacing
    ) {
        this.transform = STATE_TRANSFORMS[facing];
    }

    /** Writes the piece's blocks, in Java's own order so the random stream matches. */
    public abstract place(writer: StructureWriter, random: RandomSource): void;

    /** Java's `StructurePiece.getWorldX`. */
    protected worldX(x: number, z: number): number {
        if (this.facing === 'west') return this.boundingBox.maxX - z;
        if (this.facing === 'east') return this.boundingBox.minX + z;
        return this.boundingBox.minX + x;
    }

    /** Java's `StructurePiece.getWorldY`. */
    protected worldY(y: number): number {
        return this.boundingBox.minY + y;
    }

    /** Java's `StructurePiece.getWorldZ`. */
    protected worldZ(x: number, z: number): number {
        if (this.facing === 'north') return this.boundingBox.maxZ - z;
        if (this.facing === 'south') return this.boundingBox.minZ + z;
        return this.boundingBox.minZ + x;
    }

    /** Java's `StructurePiece.placeBlock`. */
    protected put(writer: StructureWriter, x: number, y: number, z: number, state: BlockState): void {
        writer.setBlock(this.worldX(x, z), this.worldY(y), this.worldZ(x, z), turnState(state, this.transform));
    }

    /** Attaches block entity data to a block the piece already wrote. */
    protected attach(
        writer: StructureWriter,
        x: number,
        y: number,
        z: number,
        request: { id: string; lootTable?: string; spawnEntity?: string }
    ): void {
        writer.setBlockEntity(this.worldX(x, z), this.worldY(y), this.worldZ(x, z), request);
    }

    /** Java's `StructurePiece.createChest`, without the `reorient` pass over the neighbors. */
    protected chest(writer: StructureWriter, x: number, y: number, z: number, lootTable: string): void {
        this.put(writer, x, y, z, CHEST);
        this.attach(writer, x, y, z, { id: 'minecraft:chest', lootTable });
    }

    /** Java's `StructurePiece.createDispenser`. */
    protected dispenser(
        writer: StructureWriter,
        x: number,
        y: number,
        z: number,
        facing: Direction,
        lootTable: string
    ): void {
        this.put(writer, x, y, z, block('minecraft:dispenser', { facing, triggered: 'false' }));
        this.attach(writer, x, y, z, { id: 'minecraft:dispenser', lootTable });
    }

    /** Java's `StructurePiece.generateBox` with one state, which walks y, then x, then z. */
    protected fill(
        writer: StructureWriter,
        x1: number,
        y1: number,
        z1: number,
        x2: number,
        y2: number,
        z2: number,
        state: BlockState
    ): void {
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                for (let z = z1; z <= z2; z++) this.put(writer, x, y, z, state);
            }
        }
    }

    /**
     * Java's `generateBox` with a `BlockSelector`.
     *
     * The selector draws for every position in the range, whether or not the position lands in
     * the chunk being written, which is what keeps the stream the same in every chunk the piece
     * covers.
     */
    protected fillSelected(
        writer: StructureWriter,
        random: RandomSource,
        x1: number,
        y1: number,
        z1: number,
        x2: number,
        y2: number,
        z2: number,
        select: (random: RandomSource) => BlockState
    ): void {
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                for (let z = z1; z <= z2; z++) this.put(writer, x, y, z, select(random));
            }
        }
    }

    /**
     * Java's `StructurePiece.fillColumnDown`: carries a block down until it meets ground.
     *
     * The walk stops as soon as a write is dropped, because the clip box spans the chunk's whole
     * height and so a first dropped write means the column is not in this chunk at all.
     */
    protected fillColumnDown(writer: StructureWriter, state: BlockState, x: number, y: number, z: number): void {
        const worldX = this.worldX(x, z);
        const worldZ = this.worldZ(x, z);
        const floor = writer.level.minY + 1;

        for (let worldY = this.worldY(y); worldY > floor; worldY--) {
            if (!PASSABLE_COLUMN.has(writer.blockAt(worldX, worldY, worldZ).name)) return;
            if (!writer.setBlock(worldX, worldY, worldZ, turnState(state, this.transform))) return;
        }
    }
}

// ---------------------------------------------------------------------------
// Desert pyramid
// ---------------------------------------------------------------------------

/** The extent of Java's `DesertPyramidPiece`, which it passes to `ScatteredFeaturePiece`. */
const DESERT_PYRAMID = { width: 21, height: 15, depth: 21 } as const;

/** The four corners of the hidden chamber a chest stands in. */
const DESERT_CHAMBER_CHESTS: readonly (readonly [number, number])[] = [
    [9, 9],
    [11, 9],
    [9, 11],
    [11, 11]
];

/**
 * Java's `DesertPyramidPiece`.
 *
 * The outer shell is Java's: the buried slab, the nine stepped rings, the columns carried down
 * to the ground, the two front towers with their four sandstone stairs and the entrance arch.
 * The floor mosaic and the sealed chamber under it are a reconstruction. The chamber holds the
 * blue terracotta, the stone pressure plate, the nine TNT under the floor and the four chests
 * that make a desert pyramid what it is, but their exact local coordinates are not checked
 * against Java's source.
 *
 * Java's suspicious sand, which 1.20 added to the four corridors, is left out: it needs the
 * archaeology loot tables and a brushable block entity, neither of which this seam carries.
 */
class DesertPyramidPiece extends ScatteredPiece {
    public constructor(boundingBox: BoundingBox, facing: PieceFacing) {
        super(boundingBox, facing);
    }

    public place(writer: StructureWriter): void {
        const width = DESERT_PYRAMID.width;
        const depth = DESERT_PYRAMID.depth;

        this.fill(writer, 0, -4, 0, width - 1, 0, depth - 1, SANDSTONE);

        for (let step = 1; step <= 9; step++) {
            this.fill(writer, step, step, step, width - 1 - step, step, depth - 1 - step, SANDSTONE);
            this.fill(writer, step + 1, step, step + 1, width - 2 - step, step, depth - 2 - step, AIR);
        }

        for (let x = 0; x < width; x++) {
            for (let z = 0; z < depth; z++) this.fillColumnDown(writer, SANDSTONE, x, -5, z);
        }

        this.placeTowers(writer, width);
        this.placeEntrance(writer, width);
        this.placeMosaic(writer);
        this.placeChamber(writer);
    }

    /** The two towers at the front corners, each capped and ringed with sandstone stairs. */
    private placeTowers(writer: StructureWriter, width: number): void {
        const north = block('minecraft:sandstone_stairs', { facing: 'north' });
        const south = block('minecraft:sandstone_stairs', { facing: 'south' });
        const east = block('minecraft:sandstone_stairs', { facing: 'east' });
        const west = block('minecraft:sandstone_stairs', { facing: 'west' });

        this.fill(writer, 0, 0, 0, 4, 9, 4, SANDSTONE);
        this.fill(writer, 1, 10, 1, 3, 10, 3, SANDSTONE);
        this.put(writer, 2, 10, 0, north);
        this.put(writer, 2, 10, 4, south);
        this.put(writer, 0, 10, 2, east);
        this.put(writer, 4, 10, 2, west);

        this.fill(writer, width - 5, 0, 0, width - 1, 9, 4, SANDSTONE);
        this.fill(writer, width - 4, 10, 1, width - 2, 10, 3, SANDSTONE);
        this.put(writer, width - 3, 10, 0, north);
        this.put(writer, width - 3, 10, 4, south);
        this.put(writer, width - 5, 10, 2, east);
        this.put(writer, width - 1, 10, 2, west);
    }

    /** The entrance between the towers, with the chiseled sandstone frame around the doorway. */
    private placeEntrance(writer: StructureWriter, width: number): void {
        this.fill(writer, 8, 0, 0, 12, 4, 4, SANDSTONE);
        this.fill(writer, 9, 1, 0, 11, 3, 4, CAVE_AIR);
        this.put(writer, 9, 1, 1, CHISELED_SANDSTONE);
        this.put(writer, 9, 2, 1, CUT_SANDSTONE);
        this.put(writer, 9, 3, 1, CHISELED_SANDSTONE);
        this.put(writer, 10, 3, 1, CUT_SANDSTONE);
        this.put(writer, 11, 3, 1, CHISELED_SANDSTONE);
        this.put(writer, 11, 2, 1, CUT_SANDSTONE);
        this.put(writer, 11, 1, 1, CHISELED_SANDSTONE);

        // The two corridors that run from the entrance to the inner room.
        this.fill(writer, 4, 1, 1, 8, 3, 3, SANDSTONE);
        this.fill(writer, 4, 1, 2, 8, 2, 2, CAVE_AIR);
        this.fill(writer, width - 9, 1, 1, width - 5, 3, 3, SANDSTONE);
        this.fill(writer, width - 9, 1, 2, width - 5, 2, 2, CAVE_AIR);
    }

    /** The floor pattern over the chamber: an orange border, a blue square, an orange middle. */
    private placeMosaic(writer: StructureWriter): void {
        this.fill(writer, 8, 0, 8, 12, 0, 12, ORANGE_TERRACOTTA);
        this.fill(writer, 9, 0, 9, 11, 0, 11, BLUE_TERRACOTTA);
        this.put(writer, 10, 0, 10, ORANGE_TERRACOTTA);
    }

    /** The sealed chamber: four chests in the corners, a pressure plate over nine TNT. */
    private placeChamber(writer: StructureWriter): void {
        this.fill(writer, 8, -15, 8, 12, -10, 12, SANDSTONE);
        this.fill(writer, 9, -12, 9, 11, -11, 11, CAVE_AIR);
        this.fill(writer, 9, -14, 9, 11, -14, 11, TNT);
        this.put(writer, 10, -13, 10, BLUE_TERRACOTTA);
        this.put(writer, 10, -12, 10, STONE_PRESSURE_PLATE);

        for (const [x, z] of DESERT_CHAMBER_CHESTS) this.chest(writer, x, -12, z, 'minecraft:chests/desert_pyramid');
    }
}

/** Lays out a desert pyramid: one piece, turned, settled onto the sand. */
export const buildDesertPyramid: StructureBuilder = (context): StructureLayout | undefined =>
    scatteredLayout(context, 'WORLD_SURFACE_WG', () =>
        settledScatteredPiece(context, DESERT_PYRAMID, (box, facing) => new DesertPyramidPiece(box, facing))
    );

// ---------------------------------------------------------------------------
// Jungle temple
// ---------------------------------------------------------------------------

/** The extent of Java's `JungleTemplePiece`. */
const JUNGLE_TEMPLE = { width: 12, height: 10, depth: 15 } as const;

/** Java's `JungleTemplePiece.MossStoneSelector`: two draws in five come out plain cobblestone. */
const mossStone = (random: RandomSource): BlockState => (random.nextFloat() < 0.4 ? COBBLESTONE : MOSSY_COBBLESTONE);

/** The four corner spires of the temple roof. */
const JUNGLE_TEMPLE_SPIRES: readonly (readonly [number, number])[] = [
    [2, 2],
    [9, 2],
    [2, 12],
    [9, 12]
];

/** The four studs that sit one layer under the roof's ridge. */
const JUNGLE_TEMPLE_STUDS: readonly (readonly [number, number])[] = [
    [4, 4],
    [7, 4],
    [4, 10],
    [7, 10]
];

/**
 * Java's `JungleTemplePiece`.
 *
 * The shell boxes are Java's: the sunken base, the two floors, the pillared facade, the stepped
 * roof and the cobblestone stairs on top. The basement is a reconstruction. It keeps the two
 * arrow traps, each a tripwire run between two hooks wired to a dispenser, the three-lever
 * puzzle and the two chests, but the redstone is wired by hand rather than copied from Java's
 * `postProcess`, so the puzzle is a likeness and not a working circuit.
 */
class JungleTemplePiece extends ScatteredPiece {
    public constructor(boundingBox: BoundingBox, facing: PieceFacing) {
        super(boundingBox, facing);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.placeShell(writer, random);
        this.placeRoof(writer, random);
        this.placeBasement(writer, random);
        this.placeTraps(writer);
        this.placePuzzle(writer);
    }

    /** The base, the two floors and the walls, all drawn from the moss selector. */
    private placeShell(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, -4, 0, 11, 0, 14, mossStone);
        this.fillSelected(writer, random, 2, 1, 2, 9, 2, 2, mossStone);
        this.fillSelected(writer, random, 2, 1, 12, 9, 2, 12, mossStone);
        this.fillSelected(writer, random, 2, 1, 3, 2, 2, 11, mossStone);
        this.fillSelected(writer, random, 9, 1, 3, 9, 2, 11, mossStone);
        this.fillSelected(writer, random, 1, 3, 1, 10, 6, 1, mossStone);
        this.fillSelected(writer, random, 1, 3, 13, 10, 6, 13, mossStone);
        this.fillSelected(writer, random, 1, 3, 2, 1, 6, 12, mossStone);
        this.fillSelected(writer, random, 10, 3, 2, 10, 6, 12, mossStone);
        this.fillSelected(writer, random, 2, 3, 2, 9, 3, 12, mossStone);
        this.fillSelected(writer, random, 2, 6, 2, 9, 6, 12, mossStone);

        this.fill(writer, 3, 1, 3, 8, 2, 11, CAVE_AIR);
        this.fill(writer, 4, 3, 6, 7, 3, 9, CAVE_AIR);
        this.fill(writer, 2, 4, 2, 9, 5, 12, CAVE_AIR);
        this.fill(writer, 4, 6, 5, 7, 6, 9, CAVE_AIR);
        this.fill(writer, 5, 1, 2, 6, 2, 2, CAVE_AIR);
        this.fill(writer, 5, 2, 12, 6, 2, 12, CAVE_AIR);
        this.fill(writer, 5, 5, 1, 6, 5, 1, CAVE_AIR);
        this.fill(writer, 5, 5, 13, 6, 5, 13, CAVE_AIR);
        this.put(writer, 1, 5, 5, CAVE_AIR);
        this.put(writer, 10, 5, 5, CAVE_AIR);
        this.put(writer, 1, 5, 9, CAVE_AIR);
        this.put(writer, 10, 5, 9, CAVE_AIR);

        // The pillars on the front and back faces, and the ones along the two sides.
        for (const z of [0, 14]) {
            for (const x of [2, 4, 7, 9]) this.fillSelected(writer, random, x, 4, z, x, 5, z, mossStone);
        }
        this.fillSelected(writer, random, 5, 6, 0, 6, 6, 0, mossStone);

        for (const x of [0, 11]) {
            for (let z = 2; z <= 12; z += 2) this.fillSelected(writer, random, x, 4, z, x, 5, z, mossStone);
            this.fillSelected(writer, random, x, 6, 5, x, 6, 5, mossStone);
            this.fillSelected(writer, random, x, 6, 9, x, 6, 9, mossStone);
        }
    }

    /** The stepped roof and the four corner spires. */
    private placeRoof(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 3, 7, 3, 8, 7, 11, mossStone);
        this.fillSelected(writer, random, 4, 8, 4, 7, 8, 10, mossStone);
        this.fill(writer, 5, 7, 6, 6, 7, 8, CAVE_AIR);

        for (const [x, z] of JUNGLE_TEMPLE_SPIRES) this.fillSelected(writer, random, x, 7, z, x, 9, z, mossStone);
        for (const [x, z] of JUNGLE_TEMPLE_STUDS) this.fillSelected(writer, random, x, 9, z, x, 9, z, mossStone);

        this.fillSelected(writer, random, 5, 9, 7, 6, 9, 7, mossStone);
        const east = block('minecraft:cobblestone_stairs', { facing: 'east' });
        const west = block('minecraft:cobblestone_stairs', { facing: 'west' });
        this.put(writer, 5, 9, 6, west);
        this.put(writer, 6, 9, 6, west);
        this.put(writer, 5, 9, 8, east);
        this.put(writer, 6, 9, 8, east);
    }

    /** The corridors under the temple, cut out of the base slab. */
    private placeBasement(writer: StructureWriter, random: RandomSource): void {
        this.fill(writer, 1, -3, 12, 10, -1, 13, CAVE_AIR);
        this.fill(writer, 1, -3, 1, 3, -1, 13, CAVE_AIR);
        this.fill(writer, 1, -3, 1, 9, -1, 5, CAVE_AIR);

        for (let z = 1; z <= 13; z += 2) this.fillSelected(writer, random, 1, -3, z, 1, -2, z, mossStone);
        for (let z = 2; z <= 12; z += 2) this.fillSelected(writer, random, 1, -1, z, 3, -1, z, mossStone);

        this.fillSelected(writer, random, 2, -2, 1, 5, -2, 1, mossStone);
        this.fillSelected(writer, random, 7, -2, 1, 9, -2, 1, mossStone);
        this.fillSelected(writer, random, 6, -3, 1, 6, -3, 1, mossStone);
        this.fillSelected(writer, random, 6, -1, 1, 6, -1, 1, mossStone);

        // The staircase from the ground floor down into the basement.
        const stairs = block('minecraft:cobblestone_stairs', { facing: 'north' });
        for (let step = 0; step < 3; step++) this.put(writer, 8, -1 - step, 11 - step, stairs);
    }

    /** The two arrow traps: a tripwire between two hooks, wired to a dispenser in the wall. */
    private placeTraps(writer: StructureWriter): void {
        const dispenserLoot = 'minecraft:chests/jungle_temple_dispenser';

        // The west corridor, tripped by walking along it.
        this.put(writer, 1, -3, 8, block('minecraft:tripwire_hook', { facing: 'east', attached: 'true' }));
        this.put(writer, 4, -3, 8, block('minecraft:tripwire_hook', { facing: 'west', attached: 'true' }));
        for (const x of [2, 3]) {
            this.put(writer, x, -3, 8, block('minecraft:tripwire', { attached: 'true', east: 'true', west: 'true' }));
        }
        this.put(writer, 0, -3, 8, REDSTONE_WIRE);
        this.dispenser(writer, 0, -2, 8, 'east', dispenserLoot);

        // The north corridor, which runs across the first one.
        this.put(writer, 7, -3, 1, block('minecraft:tripwire_hook', { facing: 'south', attached: 'true' }));
        this.put(writer, 7, -3, 5, block('minecraft:tripwire_hook', { facing: 'north', attached: 'true' }));
        for (const z of [2, 3, 4]) {
            this.put(writer, 7, -3, z, block('minecraft:tripwire', { attached: 'true', north: 'true', south: 'true' }));
        }
        this.put(writer, 8, -3, 3, REDSTONE_WIRE);
        this.dispenser(writer, 9, -2, 3, 'west', dispenserLoot);

        this.chest(writer, 2, -3, 10, 'minecraft:chests/jungle_temple');
    }

    /** The three levers and the pistons they drive, with the hidden chest behind them. */
    private placePuzzle(writer: StructureWriter): void {
        const lever = block('minecraft:lever', { face: 'wall', facing: 'south', powered: 'false' });
        for (const x of [8, 9, 10]) this.put(writer, x, -2, 12, lever);

        const piston = block('minecraft:sticky_piston', { facing: 'up', extended: 'false' });
        for (const x of [8, 9, 10]) this.put(writer, x, -3, 11, piston);

        this.chest(writer, 9, -3, 13, 'minecraft:chests/jungle_temple');
    }
}

/** Lays out a jungle temple: one piece, turned, settled onto the jungle floor. */
export const buildJungleTemple: StructureBuilder = (context): StructureLayout | undefined =>
    scatteredLayout(context, 'WORLD_SURFACE_WG', () =>
        settledScatteredPiece(context, JUNGLE_TEMPLE, (box, facing) => new JungleTemplePiece(box, facing))
    );

// ---------------------------------------------------------------------------
// Swamp hut
// ---------------------------------------------------------------------------

/** The extent of Java's `SwampHutPiece`. */
const SWAMP_HUT = { width: 7, height: 7, depth: 9 } as const;

/**
 * Java's `SwampHutPiece`, block for block.
 *
 * Java spawns the witch and the black cat as entities inside `postProcess` and marks them
 * persistent. Both are recorded through `StructureWriter.spawnEntity` here, which carries a type
 * and a position and nothing else, so the cat's black coat and the witch's persistence flag do
 * not come along.
 */
class SwampHutPiece extends ScatteredPiece {
    public constructor(boundingBox: BoundingBox, facing: PieceFacing) {
        super(boundingBox, facing);
    }

    public place(writer: StructureWriter): void {
        this.fill(writer, 1, 1, 1, 5, 1, 7, SPRUCE_PLANKS);
        this.fill(writer, 1, 4, 2, 5, 4, 7, SPRUCE_PLANKS);
        this.fill(writer, 2, 1, 0, 4, 1, 0, SPRUCE_PLANKS);
        this.fill(writer, 2, 2, 2, 3, 3, 2, SPRUCE_PLANKS);
        this.fill(writer, 1, 2, 3, 1, 3, 6, SPRUCE_PLANKS);
        this.fill(writer, 5, 2, 3, 5, 3, 6, SPRUCE_PLANKS);
        this.fill(writer, 2, 2, 7, 4, 3, 7, SPRUCE_PLANKS);

        this.fill(writer, 1, 0, 2, 1, 3, 2, OAK_LOG);
        this.fill(writer, 5, 0, 2, 5, 3, 2, OAK_LOG);
        this.fill(writer, 1, 0, 7, 1, 3, 7, OAK_LOG);
        this.fill(writer, 5, 0, 7, 5, 3, 7, OAK_LOG);

        this.put(writer, 2, 3, 2, OAK_FENCE);
        this.put(writer, 3, 3, 7, OAK_FENCE);
        this.put(writer, 1, 3, 4, AIR);
        this.put(writer, 5, 3, 4, AIR);
        this.put(writer, 5, 3, 5, AIR);
        this.put(writer, 1, 3, 5, POTTED_RED_MUSHROOM);
        this.put(writer, 3, 2, 6, CRAFTING_TABLE);
        this.put(writer, 4, 2, 6, CAULDRON);
        this.put(writer, 1, 2, 1, OAK_FENCE);
        this.put(writer, 5, 2, 1, OAK_FENCE);

        this.placeRoof(writer);

        for (let z = 2; z <= 7; z += 5) {
            for (let x = 1; x <= 5; x += 4) this.fillColumnDown(writer, OAK_LOG, x, -1, z);
        }

        // Java creates the witch and the cat at the same spot and lets them scatter on their own.
        const standX = this.worldX(2, 5) + 0.5;
        const standZ = this.worldZ(2, 5) + 0.5;
        writer.spawnEntity('minecraft:witch', standX, this.worldY(2), standZ, 0);
        writer.spawnEntity('minecraft:cat', standX, this.worldY(2), standZ, 0);
    }

    /** The spruce stair roof, with an outer corner at each of the four ends. */
    private placeRoof(writer: StructureWriter): void {
        const north = block('minecraft:spruce_stairs', { facing: 'north', shape: 'straight' });
        const south = block('minecraft:spruce_stairs', { facing: 'south', shape: 'straight' });
        const east = block('minecraft:spruce_stairs', { facing: 'east', shape: 'straight' });
        const west = block('minecraft:spruce_stairs', { facing: 'west', shape: 'straight' });

        this.fill(writer, 0, 4, 1, 6, 4, 1, north);
        this.fill(writer, 0, 4, 2, 0, 4, 7, east);
        this.fill(writer, 6, 4, 2, 6, 4, 7, west);
        this.fill(writer, 0, 4, 8, 6, 4, 8, south);

        this.put(writer, 0, 4, 1, block('minecraft:spruce_stairs', { facing: 'north', shape: 'outer_right' }));
        this.put(writer, 6, 4, 1, block('minecraft:spruce_stairs', { facing: 'north', shape: 'outer_left' }));
        this.put(writer, 0, 4, 8, block('minecraft:spruce_stairs', { facing: 'south', shape: 'outer_left' }));
        this.put(writer, 6, 4, 8, block('minecraft:spruce_stairs', { facing: 'south', shape: 'outer_right' }));
    }
}

/** Lays out a swamp hut: one piece on stilts, turned, settled onto the swamp. */
export const buildSwampHut: StructureBuilder = (context): StructureLayout | undefined =>
    scatteredLayout(context, 'WORLD_SURFACE_WG', () =>
        settledScatteredPiece(context, SWAMP_HUT, (box, facing) => new SwampHutPiece(box, facing))
    );

// ---------------------------------------------------------------------------
// Buried treasure
// ---------------------------------------------------------------------------

/** Where in its chunk Java's `BuriedTreasureStructure` puts the chest, as a block offset. */
const BURIED_TREASURE_OFFSET = 9;

/** The blocks Java accepts as the bed a buried treasure chest is set on. */
const BURIED_TREASURE_BED: ReadonlySet<string> = new Set([
    'minecraft:sandstone',
    'minecraft:stone',
    'minecraft:andesite',
    'minecraft:granite',
    'minecraft:diorite'
]);

/** Java's `BuriedTreasurePiece.isLiquid`, which the sand fill checks the chest's own block for. */
const isLiquid = (state: BlockState): boolean =>
    state.name === 'minecraft:water' || state.name === 'minecraft:lava' || state.properties.waterlogged === 'true';

/**
 * The y Java's `BuriedTreasurePiece` walks down to, found against the bare terrain.
 *
 * @returns The first y below the sea floor whose block below is one Java buries into, or
 *   undefined when the column holds none, which is the case Java's loop falls out of.
 */
const buriedTreasureDepth = (level: StructureLevel, x: number, z: number): number | undefined => {
    for (let y = level.baseHeight(x, z, 'OCEAN_FLOOR_WG'); y > level.minY; y--) {
        if (BURIED_TREASURE_BED.has(level.baseBlock(x, y - 1, z).name)) return y;
    }

    return undefined;
};

/**
 * Java's `BuriedTreasurePiece`: one chest, and sand packed into the air around it.
 *
 * Java takes no orientation, so the piece writes in world coordinates and the chest keeps its
 * default facing.
 */
class BuriedTreasurePiece implements StructurePiece {
    public readonly boundingBox: BoundingBox;

    public constructor(
        private readonly x: number,
        private readonly y: number,
        private readonly z: number
    ) {
        this.boundingBox = boxFromSize(x, y, z, 1, 1, 1);
    }

    /** Writes the chest and attaches the buried treasure loot table to it. */
    public place(writer: StructureWriter): void {
        const existing = writer.blockAt(this.x, this.y, this.z);
        const filler = existing.name !== 'minecraft:air' && !isLiquid(existing) ? existing : SAND;

        for (const [stepX, stepY, stepZ] of Object.values(DIRECTION_STEPS)) {
            const x = this.x + stepX;
            const y = this.y + stepY;
            const z = this.z + stepZ;
            if (writer.blockAt(x, y, z).name !== 'minecraft:air') continue;
            if (writer.blockAt(x, y - 1, z).name === 'minecraft:air') continue;

            writer.setBlock(x, y, z, filler);
        }

        writer.setBlock(this.x, this.y, this.z, CHEST);
        writer.setBlockEntity(this.x, this.y, this.z, {
            id: 'minecraft:chest',
            lootTable: 'minecraft:chests/buried_treasure'
        });
    }
}

/**
 * Lays out a buried treasure: one chest, nine blocks into the chunk and under the sea floor.
 *
 * Java walks down from the sea floor inside `postProcess`, so the chest's depth is decided once
 * per chunk; the walk happens here instead, against the bare terrain, for the reason the module
 * comment gives. The piece's box is therefore the chest's own block rather than Java's marker
 * at y 90.
 */
export const buildBuriedTreasure: StructureBuilder = (context): StructureLayout | undefined =>
    scatteredLayout(context, 'OCEAN_FLOOR_WG', () => {
        const x = context.chunkX * 16 + BURIED_TREASURE_OFFSET;
        const z = context.chunkZ * 16 + BURIED_TREASURE_OFFSET;
        const y = buriedTreasureDepth(context.level, x, z);

        // A column with no sea floor to bury the chest under holds no treasure, which the empty
        // piece list reports the same way Java's `StructureStart.isValid` does.
        return y === undefined ? [] : [new BuriedTreasurePiece(x, y, z)];
    });
