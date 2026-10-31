/**
 * The nether fortress, Java's `minecraft:fortress` structure type.
 *
 * `NetherFortressStructure.generatePieces` starts a bridge crossing two blocks into the chunk,
 * facing a drawn direction, and grows a graph out of it the way the stronghold does: a piece
 * opens one to three exits, each exit draws a piece type from a weighted table, and a type
 * whose box collides, has hit its limit or was drawn last time is passed over. Two tables are
 * in play. An exit on the open bridges draws from the bridge table until a castle entrance
 * comes up, every exit inside the castle draws from the corridor table, and a balcony is the
 * one corridor piece that may hand an exit back to the bridge table. An exit that draws nothing
 * in five tries, or that sits more than thirty pieces from the start, gets a bridge end filler
 * instead: a short stub whose broken end is drawn from a seed the filler keeps for itself.
 *
 * The whole graph is laid out at y 64 and then moved once, to a drawn height between 48 and 70,
 * which is why a fortress hangs over the lava sea at one level from end to end. The layout reads
 * no terrain. The pillars under the bridges are the one place a fortress reads the world, and
 * they are written while a chunk is placed, down through whatever air and lava is under them.
 *
 * Two quirks of Java's are kept because they decide where pieces land. An exit more than 112
 * blocks from the start draws a bridge end filler, draws its seed, and then drops it without
 * adding it, so that exit stays open. And a weight table whose limited rows are all spent stops
 * offering its unlimited rows too, so a castle that has placed its five corridor crossings and
 * ten turns of each kind grows only fillers from then on.
 *
 * Read from the 26.3 server jar's `NetherFortressPieces` and `NetherFortressStructure` piece by
 * piece, and checked against the pieces Java lays out for the same seeds.
 */
import type { BlockState } from '@jsprismarine/features';
import { HORIZONTAL_DIRECTIONS } from '@jsprismarine/features';
import type { BoundingBox, RandomSource } from '@jsprismarine/structures';
import { createLegacyRandom } from '@jsprismarine/structures';

import type { StructureBuildContext, StructureBuilder, StructureLayout } from './javaStructureStarts';
import { chestFacing, makeBoundingBox, orientBox, orientedState } from './javaStructureStronghold';
import type { StructurePiece, StructureWriter } from './javaStructureWorld';
import { movedBox, unionOf } from './javaStructureWorld';

/** The way a piece was entered, which is the only orientation a fortress piece has. */
type Facing = (typeof HORIZONTAL_DIRECTIONS)[number];

/** The y Java builds the graph at before moving it, Java's `MAGIC_START_Y`. */
const START_Y = 64;

/** How deep the graph may grow before an exit produces only fillers. */
const MAX_DEPTH = 30;

/** How far from the start an exit may sit before its piece is drawn and dropped. */
const MAX_SPREAD = 112;

/** The lowest y a new piece's box may start at, Java's `isOkBox`. */
const LOWEST_Y = 10;

/** The band the finished fortress is moved into, Java's `moveInsideHeights(random, 48, 70)`. */
const SETTLE_MIN_Y = 48;
const SETTLE_MAX_Y = 70;

/** How many draws at the weight table an exit gets before it falls back to a filler. */
const DRAW_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Block states
// ---------------------------------------------------------------------------

const NO_PROPERTIES: Readonly<Record<string, string>> = Object.freeze({});

const blockState = (name: string, properties: Readonly<Record<string, string>> = NO_PROPERTIES): BlockState => ({
    name,
    properties
});

const AIR = blockState('minecraft:air');
const NETHER_BRICKS = blockState('minecraft:nether_bricks');
const SOUL_SAND = blockState('minecraft:soul_sand');
const NETHER_WART = blockState('minecraft:nether_wart');
const LAVA = blockState('minecraft:lava');
const SPAWNER = blockState('minecraft:spawner');

/** A nether brick fence with the named sides connected and the rest left at their default false. */
const fence = (...sides: readonly Facing[]): BlockState =>
    blockState('minecraft:nether_brick_fence', Object.fromEntries(sides.map((side) => [side, 'true'])));

const FENCE = fence();
const FENCE_NS = fence('north', 'south');
const FENCE_WE = fence('west', 'east');
const FENCE_NSW = fence('north', 'south', 'west');
const FENCE_NSE = fence('north', 'south', 'east');
const FENCE_W = fence('west');
const FENCE_E = fence('east');
const FENCE_N_E = fence('north', 'east');
const FENCE_N_W = fence('north', 'west');
const FENCE_S_E = fence('south', 'east');
const FENCE_S_W = fence('south', 'west');

const stairs = (facing: Facing): BlockState => blockState('minecraft:nether_brick_stairs', { facing });

const STAIRS_NORTH = stairs('north');
const STAIRS_SOUTH = stairs('south');
const STAIRS_EAST = stairs('east');
const STAIRS_WEST = stairs('west');

/** The chest a fortress corridor rolls, by the datapack path under `loot_table/chests`. */
const FORTRESS_LOOT = 'minecraft:chests/nether_bridge';

/**
 * Java's `StructurePiece.isReplaceableByStructures`: what a bridge pillar grows down through.
 *
 * Air, any liquid, and the three plants Java names. The pillars under a fortress stop at the
 * first netherrack and go straight through the lava sea.
 */
const REPLACEABLE = new Set([
    'minecraft:air',
    'minecraft:cave_air',
    'minecraft:void_air',
    'minecraft:water',
    'minecraft:lava',
    'minecraft:bubble_column',
    'minecraft:glow_lichen',
    'minecraft:seagrass',
    'minecraft:tall_seagrass'
]);

const boxesIntersect = (a: BoundingBox, b: BoundingBox): boolean =>
    a.maxX >= b.minX &&
    a.minX <= b.maxX &&
    a.maxY >= b.minY &&
    a.minY <= b.maxY &&
    a.maxZ >= b.minZ &&
    a.minZ <= b.maxZ;

// ---------------------------------------------------------------------------
// The piece every part of a fortress is
// ---------------------------------------------------------------------------

/** The piece types Java's `NetherFortressPieces` declares, named after its classes. */
export type FortressPieceKind =
    | 'bridge_straight'
    | 'bridge_crossing'
    | 'bridge_end_filler'
    | 'room_crossing'
    | 'stairs_room'
    | 'monster_throne'
    | 'castle_entrance'
    | 'castle_small_corridor'
    | 'castle_small_corridor_crossing'
    | 'castle_small_corridor_right_turn'
    | 'castle_small_corridor_left_turn'
    | 'castle_corridor_stairs'
    | 'castle_corridor_t_balcony'
    | 'castle_stalk_room';

/** One part of a fortress: a box, the blocks it writes in its own frame, and the exits it opens. */
abstract class FortressPiece implements StructurePiece {
    /** @inheritDoc */
    public boundingBox: BoundingBox;

    protected constructor(
        public readonly kind: FortressPieceKind,
        public readonly genDepth: number,
        boundingBox: BoundingBox,
        public readonly orientation: Facing
    ) {
        this.boundingBox = boundingBox;
    }

    /** @inheritDoc */
    public abstract place(writer: StructureWriter, random: RandomSource): void;

    /** Opens this piece's exits, which is what grows the graph. A filler and a throne open none. */
    public addChildren(_layout: FortressLayout, _random: RandomSource): void {}

    /** Moves the piece, which is how the whole fortress reaches its final height at once. */
    public moveBy(dy: number): void {
        this.boundingBox = movedBox(this.boundingBox, 0, dy, 0);
    }

    protected worldX(x: number, z: number): number {
        switch (this.orientation) {
            case 'north':
            case 'south':
                return this.boundingBox.minX + x;
            case 'west':
                return this.boundingBox.maxX - z;
            case 'east':
                return this.boundingBox.minX + z;
        }
    }

    protected worldY(y: number): number {
        return this.boundingBox.minY + y;
    }

    protected worldZ(x: number, z: number): number {
        switch (this.orientation) {
            case 'north':
                return this.boundingBox.maxZ - z;
            case 'south':
                return this.boundingBox.minZ + z;
            case 'west':
            case 'east':
                return this.boundingBox.minZ + x;
        }
    }

    protected placeBlock(writer: StructureWriter, state: BlockState, x: number, y: number, z: number): void {
        writer.setBlock(this.worldX(x, z), this.worldY(y), this.worldZ(x, z), orientedState(state, this.orientation));
    }

    /**
     * Java's `generateBox` with one state and no air test, which is every box a fortress fills.
     *
     * Every call in `NetherFortressPieces` hands the same state for the shell and the inside and
     * passes `false` for `skipAir`, so the edge test Java makes is never observable here.
     */
    protected fillBox(
        writer: StructureWriter,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        state: BlockState
    ): void {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                for (let z = z0; z <= z1; z++) this.placeBlock(writer, state, x, y, z);
            }
        }
    }

    /**
     * Java's `fillColumnDown`: a pillar from a local position down to the first block that is
     * not air or liquid, stopping one above the dimension floor.
     *
     * The state is written as given, without the piece's turn; nether bricks have nothing to
     * turn. A write that does not land means the column is outside the chunk being placed, and
     * Java returns before writing anything in that case, so the column ends there.
     */
    protected fillColumnDown(writer: StructureWriter, state: BlockState, x: number, y: number, z: number): void {
        const worldX = this.worldX(x, z);
        const worldZ = this.worldZ(x, z);
        const floor = writer.level.minY + 1;
        for (let worldY = this.worldY(y); worldY > floor; worldY--) {
            if (!REPLACEABLE.has(writer.blockAt(worldX, worldY, worldZ).name)) return;
            if (!writer.setBlock(worldX, worldY, worldZ, state)) return;
        }
    }

    /**
     * A mob spawner written straight, as Java writes it, so the block entity lands with it.
     *
     * Java's `SpawnerBlockEntity.setEntityId` draws nothing: a fresh spawner has no spawn
     * potentials to pick between, so the stream is untouched.
     */
    protected spawner(writer: StructureWriter, x: number, y: number, z: number, entity: string): void {
        const worldX = this.worldX(x, z);
        const worldY = this.worldY(y);
        const worldZ = this.worldZ(x, z);
        if (writer.setBlock(worldX, worldY, worldZ, SPAWNER)) {
            writer.setBlockEntity(worldX, worldY, worldZ, { id: 'minecraft:mob_spawner', spawnEntity: entity });
        }
    }

    /**
     * Java's `createChest`: a chest turned to face away from its wall, with a loot table on it.
     *
     * The chest is written straight rather than through {@link FortressPiece.placeBlock}, so the
     * piece's own turn is not applied to it; `reorient` has already answered in world terms. The
     * loot seed draw happens only once the chest has landed, as Java's does.
     */
    protected createChest(writer: StructureWriter, random: RandomSource, x: number, y: number, z: number): void {
        const worldX = this.worldX(x, z);
        const worldY = this.worldY(y);
        const worldZ = this.worldZ(x, z);
        if (writer.blockAt(worldX, worldY, worldZ).name === 'minecraft:chest') return;

        const facing = chestFacing(writer, worldX, worldY, worldZ);
        if (!writer.setBlock(worldX, worldY, worldZ, blockState('minecraft:chest', { facing }))) return;

        writer.setBlockEntity(worldX, worldY, worldZ, { id: 'minecraft:chest', lootTable: FORTRESS_LOOT });
        random.nextLong();
    }

    /** Java's `generateChildForward`: the exit straight ahead. */
    protected childForward(
        layout: FortressLayout,
        random: RandomSource,
        xOff: number,
        yOff: number,
        castle: boolean
    ): void {
        const box = this.boundingBox;
        const depth = this.genDepth;
        switch (this.orientation) {
            case 'north':
                layout.growFrom(random, box.minX + xOff, box.minY + yOff, box.minZ - 1, 'north', depth, castle);
                return;
            case 'south':
                layout.growFrom(random, box.minX + xOff, box.minY + yOff, box.maxZ + 1, 'south', depth, castle);
                return;
            case 'west':
                layout.growFrom(random, box.minX - 1, box.minY + yOff, box.minZ + xOff, 'west', depth, castle);
                return;
            case 'east':
                layout.growFrom(random, box.maxX + 1, box.minY + yOff, box.minZ + xOff, 'east', depth, castle);
        }
    }

    /** Java's `generateChildLeft`: the exit out of the piece's left wall. */
    protected childLeft(
        layout: FortressLayout,
        random: RandomSource,
        yOff: number,
        zOff: number,
        castle: boolean
    ): void {
        const box = this.boundingBox;
        const depth = this.genDepth;
        switch (this.orientation) {
            case 'north':
            case 'south':
                layout.growFrom(random, box.minX - 1, box.minY + yOff, box.minZ + zOff, 'west', depth, castle);
                return;
            case 'west':
            case 'east':
                layout.growFrom(random, box.minX + zOff, box.minY + yOff, box.minZ - 1, 'north', depth, castle);
        }
    }

    /** Java's `generateChildRight`: the exit out of the piece's right wall. */
    protected childRight(
        layout: FortressLayout,
        random: RandomSource,
        yOff: number,
        zOff: number,
        castle: boolean
    ): void {
        const box = this.boundingBox;
        const depth = this.genDepth;
        switch (this.orientation) {
            case 'north':
            case 'south':
                layout.growFrom(random, box.maxX + 1, box.minY + yOff, box.minZ + zOff, 'east', depth, castle);
                return;
            case 'west':
            case 'east':
                layout.growFrom(random, box.minX + zOff, box.minY + yOff, box.maxZ + 1, 'south', depth, castle);
        }
    }

    /** The pillars under a piece's floor, one per column of the given local rectangle. */
    protected pillars(writer: StructureWriter, x0: number, z0: number, x1: number, z1: number): void {
        for (let x = x0; x <= x1; x++) {
            for (let z = z0; z <= z1; z++) this.fillColumnDown(writer, NETHER_BRICKS, x, -1, z);
        }
    }
}

/**
 * The signature of one fortress piece, for a layout comparison against Java.
 *
 * The kind, the facing, the generation depth and the box, in that order and space separated,
 * with the box as six comma separated numbers. Undefined for a piece that is not a fortress's.
 */
export const fortressPieceSignature = (piece: StructurePiece): string | undefined => {
    if (!(piece instanceof FortressPiece)) return undefined;

    const box = piece.boundingBox;
    const corners = [box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ].join(',');
    return `${piece.kind} ${piece.orientation} ${piece.genDepth} ${corners}`;
};

// ---------------------------------------------------------------------------
// The bridge pieces
// ---------------------------------------------------------------------------

/** A straight run of bridge with a railing on each side and a pillar under each end. */
class BridgeStraight extends FortressPiece {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('bridge_straight', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childForward(layout, random, 1, 3, false);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.fillBox(writer, 0, 3, 0, 4, 4, 18, NETHER_BRICKS);
        this.fillBox(writer, 1, 5, 0, 3, 7, 18, AIR);
        this.fillBox(writer, 0, 5, 0, 0, 5, 18, NETHER_BRICKS);
        this.fillBox(writer, 4, 5, 0, 4, 5, 18, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 0, 4, 2, 5, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 13, 4, 2, 18, NETHER_BRICKS);
        this.fillBox(writer, 0, 0, 0, 4, 1, 3, NETHER_BRICKS);
        this.fillBox(writer, 0, 0, 15, 4, 1, 18, NETHER_BRICKS);

        for (let x = 0; x <= 4; x++) {
            for (let z = 0; z <= 2; z++) {
                this.fillColumnDown(writer, NETHER_BRICKS, x, -1, z);
                this.fillColumnDown(writer, NETHER_BRICKS, x, -1, 18 - z);
            }
        }

        this.fillBox(writer, 0, 1, 1, 0, 4, 1, FENCE_NSE);
        this.fillBox(writer, 0, 3, 4, 0, 4, 4, FENCE_NSE);
        this.fillBox(writer, 0, 3, 14, 0, 4, 14, FENCE_NSE);
        this.fillBox(writer, 0, 1, 17, 0, 4, 17, FENCE_NSE);
        this.fillBox(writer, 4, 1, 1, 4, 4, 1, FENCE_NSW);
        this.fillBox(writer, 4, 3, 4, 4, 4, 4, FENCE_NSW);
        this.fillBox(writer, 4, 3, 14, 4, 4, 14, FENCE_NSW);
        this.fillBox(writer, 4, 1, 17, 4, 4, 17, FENCE_NSW);
    }
}

/** Two bridges crossing, which is also the piece every fortress starts from. */
class BridgeCrossing extends FortressPiece {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('bridge_crossing', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childForward(layout, random, 8, 3, false);
        this.childLeft(layout, random, 3, 8, false);
        this.childRight(layout, random, 3, 8, false);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.fillBox(writer, 7, 3, 0, 11, 4, 18, NETHER_BRICKS);
        this.fillBox(writer, 0, 3, 7, 18, 4, 11, NETHER_BRICKS);
        this.fillBox(writer, 8, 5, 0, 10, 7, 18, AIR);
        this.fillBox(writer, 0, 5, 8, 18, 7, 10, AIR);
        this.fillBox(writer, 7, 5, 0, 7, 5, 7, NETHER_BRICKS);
        this.fillBox(writer, 7, 5, 11, 7, 5, 18, NETHER_BRICKS);
        this.fillBox(writer, 11, 5, 0, 11, 5, 7, NETHER_BRICKS);
        this.fillBox(writer, 11, 5, 11, 11, 5, 18, NETHER_BRICKS);
        this.fillBox(writer, 0, 5, 7, 7, 5, 7, NETHER_BRICKS);
        this.fillBox(writer, 11, 5, 7, 18, 5, 7, NETHER_BRICKS);
        this.fillBox(writer, 0, 5, 11, 7, 5, 11, NETHER_BRICKS);
        this.fillBox(writer, 11, 5, 11, 18, 5, 11, NETHER_BRICKS);
        this.fillBox(writer, 7, 2, 0, 11, 2, 5, NETHER_BRICKS);
        this.fillBox(writer, 7, 2, 13, 11, 2, 18, NETHER_BRICKS);
        this.fillBox(writer, 7, 0, 0, 11, 1, 3, NETHER_BRICKS);
        this.fillBox(writer, 7, 0, 15, 11, 1, 18, NETHER_BRICKS);

        for (let x = 7; x <= 11; x++) {
            for (let z = 0; z <= 2; z++) {
                this.fillColumnDown(writer, NETHER_BRICKS, x, -1, z);
                this.fillColumnDown(writer, NETHER_BRICKS, x, -1, 18 - z);
            }
        }

        this.fillBox(writer, 0, 2, 7, 5, 2, 11, NETHER_BRICKS);
        this.fillBox(writer, 13, 2, 7, 18, 2, 11, NETHER_BRICKS);
        this.fillBox(writer, 0, 0, 7, 3, 1, 11, NETHER_BRICKS);
        this.fillBox(writer, 15, 0, 7, 18, 1, 11, NETHER_BRICKS);

        for (let x = 0; x <= 2; x++) {
            for (let z = 7; z <= 11; z++) {
                this.fillColumnDown(writer, NETHER_BRICKS, x, -1, z);
                this.fillColumnDown(writer, NETHER_BRICKS, 18 - x, -1, z);
            }
        }
    }
}

/**
 * The broken end of a bridge, which is what an exit grows when nothing else fits.
 *
 * Java draws the ragged edge from a seed the filler takes at layout and keeps, so the same
 * stub comes out of every chunk it spans; the chunk's own stream is left alone.
 */
class BridgeEndFiller extends FortressPiece {
    private readonly selfSeed: number;

    public constructor(genDepth: number, random: RandomSource, boundingBox: BoundingBox, direction: Facing) {
        super('bridge_end_filler', genDepth, boundingBox, direction);
        this.selfSeed = random.nextInt();
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        const random = createLegacyRandom(this.selfSeed);

        for (let x = 0; x <= 4; x++) {
            for (let y = 3; y <= 4; y++) {
                const reach = random.nextInt(8);
                this.fillBox(writer, x, y, 0, x, y, reach, NETHER_BRICKS);
            }
        }

        let reach = random.nextInt(8);
        this.fillBox(writer, 0, 5, 0, 0, 5, reach, NETHER_BRICKS);
        reach = random.nextInt(8);
        this.fillBox(writer, 4, 5, 0, 4, 5, reach, NETHER_BRICKS);

        for (let x = 0; x <= 4; x++) {
            reach = random.nextInt(5);
            this.fillBox(writer, x, 2, 0, x, 2, reach, NETHER_BRICKS);
        }

        for (let x = 0; x <= 4; x++) {
            for (let y = 0; y <= 1; y++) {
                reach = random.nextInt(3);
                this.fillBox(writer, x, y, 0, x, y, reach, NETHER_BRICKS);
            }
        }
    }
}

/** The square room where four bridges meet, with a fenced window on each wall. */
class RoomCrossing extends FortressPiece {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('room_crossing', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childForward(layout, random, 2, 0, false);
        this.childLeft(layout, random, 0, 2, false);
        this.childRight(layout, random, 0, 2, false);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.fillBox(writer, 0, 0, 0, 6, 1, 6, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 0, 6, 7, 6, AIR);
        this.fillBox(writer, 0, 2, 0, 1, 6, 0, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 6, 1, 6, 6, NETHER_BRICKS);
        this.fillBox(writer, 5, 2, 0, 6, 6, 0, NETHER_BRICKS);
        this.fillBox(writer, 5, 2, 6, 6, 6, 6, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 0, 0, 6, 1, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 5, 0, 6, 6, NETHER_BRICKS);
        this.fillBox(writer, 6, 2, 0, 6, 6, 1, NETHER_BRICKS);
        this.fillBox(writer, 6, 2, 5, 6, 6, 6, NETHER_BRICKS);
        this.fillBox(writer, 2, 6, 0, 4, 6, 0, NETHER_BRICKS);
        this.fillBox(writer, 2, 5, 0, 4, 5, 0, FENCE_WE);
        this.fillBox(writer, 2, 6, 6, 4, 6, 6, NETHER_BRICKS);
        this.fillBox(writer, 2, 5, 6, 4, 5, 6, FENCE_WE);
        this.fillBox(writer, 0, 6, 2, 0, 6, 4, NETHER_BRICKS);
        this.fillBox(writer, 0, 5, 2, 0, 5, 4, FENCE_NS);
        this.fillBox(writer, 6, 6, 2, 6, 6, 4, NETHER_BRICKS);
        this.fillBox(writer, 6, 5, 2, 6, 5, 4, FENCE_NS);
        this.pillars(writer, 0, 0, 6, 6);
    }
}

/** The room with a staircase up to the bridge level, which exits to its right. */
class StairsRoom extends FortressPiece {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('stairs_room', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childRight(layout, random, 6, 2, false);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.fillBox(writer, 0, 0, 0, 6, 1, 6, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 0, 6, 10, 6, AIR);
        this.fillBox(writer, 0, 2, 0, 1, 8, 0, NETHER_BRICKS);
        this.fillBox(writer, 5, 2, 0, 6, 8, 0, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 1, 0, 8, 6, NETHER_BRICKS);
        this.fillBox(writer, 6, 2, 1, 6, 8, 6, NETHER_BRICKS);
        this.fillBox(writer, 1, 2, 6, 5, 8, 6, NETHER_BRICKS);
        this.fillBox(writer, 0, 3, 2, 0, 5, 4, FENCE_NS);
        this.fillBox(writer, 6, 3, 2, 6, 5, 2, FENCE_NS);
        this.fillBox(writer, 6, 3, 4, 6, 5, 4, FENCE_NS);
        this.placeBlock(writer, NETHER_BRICKS, 5, 2, 5);
        this.fillBox(writer, 4, 2, 5, 4, 3, 5, NETHER_BRICKS);
        this.fillBox(writer, 3, 2, 5, 3, 4, 5, NETHER_BRICKS);
        this.fillBox(writer, 2, 2, 5, 2, 5, 5, NETHER_BRICKS);
        this.fillBox(writer, 1, 2, 5, 1, 6, 5, NETHER_BRICKS);
        this.fillBox(writer, 1, 7, 1, 5, 7, 4, NETHER_BRICKS);
        this.fillBox(writer, 6, 8, 2, 6, 8, 4, AIR);
        this.fillBox(writer, 2, 6, 0, 4, 8, 0, NETHER_BRICKS);
        this.fillBox(writer, 2, 5, 0, 4, 5, 0, FENCE_WE);
        this.pillars(writer, 0, 0, 6, 6);
    }
}

/** The blaze spawner platform at the end of a bridge. */
class MonsterThrone extends FortressPiece {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('monster_throne', genDepth, boundingBox, direction);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.fillBox(writer, 0, 2, 0, 6, 7, 7, AIR);
        this.fillBox(writer, 1, 0, 0, 5, 1, 7, NETHER_BRICKS);
        this.fillBox(writer, 1, 2, 1, 5, 2, 7, NETHER_BRICKS);
        this.fillBox(writer, 1, 3, 2, 5, 3, 7, NETHER_BRICKS);
        this.fillBox(writer, 1, 4, 3, 5, 4, 7, NETHER_BRICKS);
        this.fillBox(writer, 1, 2, 0, 1, 4, 2, NETHER_BRICKS);
        this.fillBox(writer, 5, 2, 0, 5, 4, 2, NETHER_BRICKS);
        this.fillBox(writer, 1, 5, 2, 1, 5, 3, NETHER_BRICKS);
        this.fillBox(writer, 5, 5, 2, 5, 5, 3, NETHER_BRICKS);
        this.fillBox(writer, 0, 5, 3, 0, 5, 8, NETHER_BRICKS);
        this.fillBox(writer, 6, 5, 3, 6, 5, 8, NETHER_BRICKS);
        this.fillBox(writer, 1, 5, 8, 5, 5, 8, NETHER_BRICKS);
        this.placeBlock(writer, FENCE_W, 1, 6, 3);
        this.placeBlock(writer, FENCE_E, 5, 6, 3);
        this.placeBlock(writer, FENCE_N_E, 0, 6, 3);
        this.placeBlock(writer, FENCE_N_W, 6, 6, 3);
        this.fillBox(writer, 0, 6, 4, 0, 6, 7, FENCE_NS);
        this.fillBox(writer, 6, 6, 4, 6, 6, 7, FENCE_NS);
        this.placeBlock(writer, FENCE_S_E, 0, 6, 8);
        this.placeBlock(writer, FENCE_S_W, 6, 6, 8);
        this.fillBox(writer, 1, 6, 8, 5, 6, 8, FENCE_WE);
        this.placeBlock(writer, FENCE_E, 1, 7, 8);
        this.fillBox(writer, 2, 7, 8, 4, 7, 8, FENCE_WE);
        this.placeBlock(writer, FENCE_W, 5, 7, 8);
        this.placeBlock(writer, FENCE_E, 2, 8, 8);
        this.placeBlock(writer, FENCE_WE, 3, 8, 8);
        this.placeBlock(writer, FENCE_W, 4, 8, 8);
        this.spawner(writer, 3, 5, 5, 'minecraft:blaze');
        this.pillars(writer, 0, 0, 6, 6);
    }
}

// ---------------------------------------------------------------------------
// The castle pieces
// ---------------------------------------------------------------------------

/**
 * The tall hall both the entrance and the stalk room are built from: a bridge-level floor, two
 * storeys of wall with fenced windows, a roof with a railing, and pillars under the four spans.
 */
abstract class CastleHall extends FortressPiece {
    /** The shell shared by the two halls, which the stalk room fills before writing its floor. */
    protected shell(writer: StructureWriter): void {
        this.fillBox(writer, 0, 3, 0, 12, 4, 12, NETHER_BRICKS);
        this.fillBox(writer, 0, 5, 0, 12, 13, 12, AIR);
        this.fillBox(writer, 0, 5, 0, 1, 12, 12, NETHER_BRICKS);
        this.fillBox(writer, 11, 5, 0, 12, 12, 12, NETHER_BRICKS);
        this.fillBox(writer, 2, 5, 11, 4, 12, 12, NETHER_BRICKS);
        this.fillBox(writer, 8, 5, 11, 10, 12, 12, NETHER_BRICKS);
        this.fillBox(writer, 5, 9, 11, 7, 12, 12, NETHER_BRICKS);
        this.fillBox(writer, 2, 5, 0, 4, 12, 1, NETHER_BRICKS);
        this.fillBox(writer, 8, 5, 0, 10, 12, 1, NETHER_BRICKS);
        this.fillBox(writer, 5, 9, 0, 7, 12, 1, NETHER_BRICKS);
        this.fillBox(writer, 2, 11, 2, 10, 12, 10, NETHER_BRICKS);
    }

    /** The upper windows, the roof railing and the side lanterns' fences. */
    protected roof(writer: StructureWriter): void {
        for (let i = 1; i <= 11; i += 2) {
            this.fillBox(writer, i, 10, 0, i, 11, 0, FENCE_WE);
            this.fillBox(writer, i, 10, 12, i, 11, 12, FENCE_WE);
            this.fillBox(writer, 0, 10, i, 0, 11, i, FENCE_NS);
            this.fillBox(writer, 12, 10, i, 12, 11, i, FENCE_NS);
            this.placeBlock(writer, NETHER_BRICKS, i, 13, 0);
            this.placeBlock(writer, NETHER_BRICKS, i, 13, 12);
            this.placeBlock(writer, NETHER_BRICKS, 0, 13, i);
            this.placeBlock(writer, NETHER_BRICKS, 12, 13, i);
            if (i !== 11) {
                this.placeBlock(writer, FENCE_WE, i + 1, 13, 0);
                this.placeBlock(writer, FENCE_WE, i + 1, 13, 12);
                this.placeBlock(writer, FENCE_NS, 0, 13, i + 1);
                this.placeBlock(writer, FENCE_NS, 12, 13, i + 1);
            }
        }

        this.placeBlock(writer, FENCE_N_E, 0, 13, 0);
        this.placeBlock(writer, FENCE_S_E, 0, 13, 12);
        this.placeBlock(writer, FENCE_S_W, 12, 13, 12);
        this.placeBlock(writer, FENCE_N_W, 12, 13, 0);

        for (let z = 3; z <= 9; z += 2) {
            this.fillBox(writer, 1, 7, z, 1, 8, z, FENCE_NSW);
            this.fillBox(writer, 11, 7, z, 11, 8, z, FENCE_NSE);
        }
    }

    /** The bridge-level floor that crosses the hall, and the pillars under its four spans. */
    protected floor(writer: StructureWriter): void {
        this.fillBox(writer, 4, 2, 0, 8, 2, 12, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 4, 12, 2, 8, NETHER_BRICKS);
        this.fillBox(writer, 4, 0, 0, 8, 1, 3, NETHER_BRICKS);
        this.fillBox(writer, 4, 0, 9, 8, 1, 12, NETHER_BRICKS);
        this.fillBox(writer, 0, 0, 4, 3, 1, 8, NETHER_BRICKS);
        this.fillBox(writer, 9, 0, 4, 12, 1, 8, NETHER_BRICKS);

        for (let x = 4; x <= 8; x++) {
            for (let z = 0; z <= 2; z++) {
                this.fillColumnDown(writer, NETHER_BRICKS, x, -1, z);
                this.fillColumnDown(writer, NETHER_BRICKS, x, -1, 12 - z);
            }
        }

        for (let x = 0; x <= 2; x++) {
            for (let z = 4; z <= 8; z++) {
                this.fillColumnDown(writer, NETHER_BRICKS, x, -1, z);
                this.fillColumnDown(writer, NETHER_BRICKS, 12 - x, -1, z);
            }
        }
    }
}

/** The hall a bridge enters the castle through, with a lava well in the middle of the floor. */
class CastleEntrance extends CastleHall {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('castle_entrance', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childForward(layout, random, 5, 3, true);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.shell(writer);
        this.fillBox(writer, 5, 8, 0, 7, 8, 0, FENCE);
        this.roof(writer);
        this.floor(writer);
        this.fillBox(writer, 5, 5, 5, 7, 5, 7, NETHER_BRICKS);
        this.fillBox(writer, 6, 1, 6, 6, 4, 6, AIR);
        this.placeBlock(writer, NETHER_BRICKS, 6, 0, 6);
        this.placeBlock(writer, LAVA, 6, 5, 6);
    }
}

/** The hall with the nether wart beds and the stairs up to its upper exit. */
class CastleStalkRoom extends CastleHall {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('castle_stalk_room', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childForward(layout, random, 5, 3, true);
        this.childForward(layout, random, 5, 11, true);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.shell(writer);
        this.roof(writer);

        for (let step = 0; step <= 6; step++) {
            const z = step + 4;
            for (let x = 5; x <= 7; x++) this.placeBlock(writer, STAIRS_NORTH, x, 5 + step, z);

            if (z >= 5 && z <= 8) this.fillBox(writer, 5, 5, z, 7, step + 4, z, NETHER_BRICKS);
            else if (z >= 9 && z <= 10) this.fillBox(writer, 5, 8, z, 7, step + 4, z, NETHER_BRICKS);

            if (step >= 1) this.fillBox(writer, 5, 6 + step, z, 7, 9 + step, z, AIR);
        }

        for (let x = 5; x <= 7; x++) this.placeBlock(writer, STAIRS_NORTH, x, 12, 11);

        this.fillBox(writer, 5, 6, 7, 5, 7, 7, FENCE_NSE);
        this.fillBox(writer, 7, 6, 7, 7, 7, 7, FENCE_NSW);
        this.fillBox(writer, 5, 13, 12, 7, 13, 12, AIR);
        this.fillBox(writer, 2, 5, 2, 3, 5, 3, NETHER_BRICKS);
        this.fillBox(writer, 2, 5, 9, 3, 5, 10, NETHER_BRICKS);
        this.fillBox(writer, 2, 5, 4, 2, 5, 8, NETHER_BRICKS);
        this.fillBox(writer, 9, 5, 2, 10, 5, 3, NETHER_BRICKS);
        this.fillBox(writer, 9, 5, 9, 10, 5, 10, NETHER_BRICKS);
        this.fillBox(writer, 10, 5, 4, 10, 5, 8, NETHER_BRICKS);
        this.placeBlock(writer, STAIRS_WEST, 4, 5, 2);
        this.placeBlock(writer, STAIRS_WEST, 4, 5, 3);
        this.placeBlock(writer, STAIRS_WEST, 4, 5, 9);
        this.placeBlock(writer, STAIRS_WEST, 4, 5, 10);
        this.placeBlock(writer, STAIRS_EAST, 8, 5, 2);
        this.placeBlock(writer, STAIRS_EAST, 8, 5, 3);
        this.placeBlock(writer, STAIRS_EAST, 8, 5, 9);
        this.placeBlock(writer, STAIRS_EAST, 8, 5, 10);
        this.fillBox(writer, 3, 4, 4, 4, 4, 8, SOUL_SAND);
        this.fillBox(writer, 8, 4, 4, 9, 4, 8, SOUL_SAND);
        this.fillBox(writer, 3, 5, 4, 4, 5, 8, NETHER_WART);
        this.fillBox(writer, 8, 5, 4, 9, 5, 8, NETHER_WART);
        this.floor(writer);
    }
}

/** A five by five corridor piece: a floor, two storeys of wall, a roof and pillars under it all. */
abstract class CastleCorridor extends FortressPiece {
    /** The floor and the hollow every corridor piece starts from. */
    protected hollow(writer: StructureWriter): void {
        this.fillBox(writer, 0, 0, 0, 4, 1, 4, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 0, 4, 5, 4, AIR);
    }

    /** The roof and the pillars every corridor piece ends with. */
    protected cap(writer: StructureWriter): void {
        this.fillBox(writer, 0, 6, 0, 4, 6, 4, NETHER_BRICKS);
        this.pillars(writer, 0, 0, 4, 4);
    }
}

/** A straight corridor with a fenced window on each side. */
class CastleSmallCorridor extends CastleCorridor {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('castle_small_corridor', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childForward(layout, random, 1, 0, true);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.hollow(writer);
        this.fillBox(writer, 0, 2, 0, 0, 5, 4, NETHER_BRICKS);
        this.fillBox(writer, 4, 2, 0, 4, 5, 4, NETHER_BRICKS);
        this.fillBox(writer, 0, 3, 1, 0, 4, 1, FENCE_NS);
        this.fillBox(writer, 0, 3, 3, 0, 4, 3, FENCE_NS);
        this.fillBox(writer, 4, 3, 1, 4, 4, 1, FENCE_NS);
        this.fillBox(writer, 4, 3, 3, 4, 4, 3, FENCE_NS);
        this.cap(writer);
    }
}

/** A corridor open on all four sides. */
class CastleSmallCorridorCrossing extends CastleCorridor {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('castle_small_corridor_crossing', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childForward(layout, random, 1, 0, true);
        this.childLeft(layout, random, 0, 1, true);
        this.childRight(layout, random, 0, 1, true);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.hollow(writer);
        this.fillBox(writer, 0, 2, 0, 0, 5, 0, NETHER_BRICKS);
        this.fillBox(writer, 4, 2, 0, 4, 5, 0, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 4, 0, 5, 4, NETHER_BRICKS);
        this.fillBox(writer, 4, 2, 4, 4, 5, 4, NETHER_BRICKS);
        this.cap(writer);
    }
}

/**
 * A corridor that turns, which is where a fortress keeps its chests.
 *
 * One turn in three holds a chest, drawn when the piece is laid out. Java drops the flag once
 * the chest is placed; the chest sits in one chunk, so placing it once is the same thing.
 */
class CastleSmallCorridorTurn extends CastleCorridor {
    private readonly needsChest: boolean;

    public constructor(
        genDepth: number,
        random: RandomSource,
        boundingBox: BoundingBox,
        direction: Facing,
        private readonly turnsRight: boolean
    ) {
        super(
            turnsRight ? 'castle_small_corridor_right_turn' : 'castle_small_corridor_left_turn',
            genDepth,
            boundingBox,
            direction
        );
        this.needsChest = random.nextInt(3) === 0;
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        if (this.turnsRight) this.childRight(layout, random, 0, 1, true);
        else this.childLeft(layout, random, 0, 1, true);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.hollow(writer);
        if (this.turnsRight) {
            this.fillBox(writer, 0, 2, 0, 0, 5, 4, NETHER_BRICKS);
            this.fillBox(writer, 0, 3, 1, 0, 4, 1, FENCE_NS);
            this.fillBox(writer, 0, 3, 3, 0, 4, 3, FENCE_NS);
            this.fillBox(writer, 4, 2, 0, 4, 5, 0, NETHER_BRICKS);
            this.fillBox(writer, 1, 2, 4, 4, 5, 4, NETHER_BRICKS);
        } else {
            this.fillBox(writer, 4, 2, 0, 4, 5, 4, NETHER_BRICKS);
            this.fillBox(writer, 4, 3, 1, 4, 4, 1, FENCE_NS);
            this.fillBox(writer, 4, 3, 3, 4, 4, 3, FENCE_NS);
            this.fillBox(writer, 0, 2, 0, 0, 5, 0, NETHER_BRICKS);
            this.fillBox(writer, 0, 2, 4, 3, 5, 4, NETHER_BRICKS);
        }

        this.fillBox(writer, 1, 3, 4, 1, 4, 4, FENCE_WE);
        this.fillBox(writer, 3, 3, 4, 3, 4, 4, FENCE_WE);
        if (this.needsChest) this.createChest(writer, random, this.turnsRight ? 1 : 3, 2, 3);
        this.cap(writer);
    }
}

/** The staircase that takes a corridor down seven blocks. */
class CastleCorridorStairs extends FortressPiece {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('castle_corridor_stairs', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        this.childForward(layout, random, 1, 0, true);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        for (let step = 0; step <= 9; step++) {
            const floor = Math.max(1, 7 - step);
            const ceiling = Math.min(Math.max(floor + 5, 14 - step), 13);
            const z = step;
            this.fillBox(writer, 0, 0, z, 4, floor, z, NETHER_BRICKS);
            this.fillBox(writer, 1, floor + 1, z, 3, ceiling - 1, z, AIR);
            if (step <= 6) {
                this.placeBlock(writer, STAIRS_SOUTH, 1, floor + 1, z);
                this.placeBlock(writer, STAIRS_SOUTH, 2, floor + 1, z);
                this.placeBlock(writer, STAIRS_SOUTH, 3, floor + 1, z);
            }

            this.fillBox(writer, 0, ceiling, z, 4, ceiling, z, NETHER_BRICKS);
            this.fillBox(writer, 0, floor + 1, z, 0, ceiling - 1, z, NETHER_BRICKS);
            this.fillBox(writer, 4, floor + 1, z, 4, ceiling - 1, z, NETHER_BRICKS);
            if ((step & 1) === 0) {
                this.fillBox(writer, 0, floor + 2, z, 0, floor + 3, z, FENCE_NS);
                this.fillBox(writer, 4, floor + 2, z, 4, floor + 3, z, FENCE_NS);
            }

            for (let x = 0; x <= 4; x++) this.fillColumnDown(writer, NETHER_BRICKS, x, -1, z);
        }
    }
}

/**
 * The T-shaped corridor with a balcony, which is where the castle may open back onto a bridge.
 *
 * Each side exit draws from the bridge table one time in eight. The side exits sit at the end
 * of the balcony, and which end that is swaps when the piece's local z runs backwards.
 */
class CastleCorridorTBalcony extends FortressPiece {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super('castle_corridor_t_balcony', genDepth, boundingBox, direction);
    }

    public override addChildren(layout: FortressLayout, random: RandomSource): void {
        const zOff = this.orientation === 'west' || this.orientation === 'north' ? 5 : 1;
        this.childLeft(layout, random, 0, zOff, random.nextInt(8) > 0);
        this.childRight(layout, random, 0, zOff, random.nextInt(8) > 0);
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        this.fillBox(writer, 0, 0, 0, 8, 1, 8, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 0, 8, 5, 8, AIR);
        this.fillBox(writer, 0, 6, 0, 8, 6, 5, NETHER_BRICKS);
        this.fillBox(writer, 0, 2, 0, 2, 5, 0, NETHER_BRICKS);
        this.fillBox(writer, 6, 2, 0, 8, 5, 0, NETHER_BRICKS);
        this.fillBox(writer, 1, 3, 0, 1, 4, 0, FENCE_WE);
        this.fillBox(writer, 7, 3, 0, 7, 4, 0, FENCE_WE);
        this.fillBox(writer, 0, 2, 4, 8, 2, 8, NETHER_BRICKS);
        this.fillBox(writer, 1, 1, 4, 2, 2, 4, AIR);
        this.fillBox(writer, 6, 1, 4, 7, 2, 4, AIR);
        this.fillBox(writer, 1, 3, 8, 7, 3, 8, FENCE_WE);
        this.placeBlock(writer, FENCE_S_E, 0, 3, 8);
        this.placeBlock(writer, FENCE_S_W, 8, 3, 8);
        this.fillBox(writer, 0, 3, 6, 0, 3, 7, FENCE_NS);
        this.fillBox(writer, 8, 3, 6, 8, 3, 7, FENCE_NS);
        this.fillBox(writer, 0, 3, 4, 0, 5, 5, NETHER_BRICKS);
        this.fillBox(writer, 8, 3, 4, 8, 5, 5, NETHER_BRICKS);
        this.fillBox(writer, 1, 3, 5, 2, 5, 5, NETHER_BRICKS);
        this.fillBox(writer, 6, 3, 5, 7, 5, 5, NETHER_BRICKS);
        this.fillBox(writer, 1, 4, 5, 1, 5, 5, FENCE_WE);
        this.fillBox(writer, 7, 4, 5, 7, 5, 5, FENCE_WE);

        for (let z = 0; z <= 5; z++) {
            for (let x = 0; x <= 8; x++) this.fillColumnDown(writer, NETHER_BRICKS, x, -1, z);
        }
    }
}

// ---------------------------------------------------------------------------
// The weighted draw
// ---------------------------------------------------------------------------

/** One row of Java's `BRIDGE_PIECE_WEIGHTS` or `CASTLE_PIECE_WEIGHTS`. */
interface PieceWeight {
    readonly kind: FortressPieceKind;
    readonly weight: number;
    /** How many of the type a fortress may hold, or zero for no limit. */
    readonly limit: number;
    /** Whether the type may be drawn twice in a row. Only the two plain runs may. */
    readonly allowInRow: boolean;
    placed: number;
}

type WeightRow = readonly [FortressPieceKind, number, number, boolean?];

const weightTable = (rows: readonly WeightRow[]): PieceWeight[] =>
    rows.map(([kind, weight, limit, allowInRow = false]) => ({ kind, weight, limit, allowInRow, placed: 0 }));

/** The table an exit on the bridges draws from, fresh for every fortress. */
const bridgeWeights = (): PieceWeight[] =>
    weightTable([
        ['bridge_straight', 30, 0, true],
        ['bridge_crossing', 10, 4],
        ['room_crossing', 10, 4],
        ['stairs_room', 10, 3],
        ['monster_throne', 5, 2],
        ['castle_entrance', 5, 1]
    ]);

/** The table an exit inside the castle draws from, fresh for every fortress. */
const castleWeights = (): PieceWeight[] =>
    weightTable([
        ['castle_small_corridor', 25, 0, true],
        ['castle_small_corridor_crossing', 15, 5],
        ['castle_small_corridor_right_turn', 5, 10],
        ['castle_small_corridor_left_turn', 5, 10],
        ['castle_corridor_stairs', 10, 3, true],
        ['castle_corridor_t_balcony', 7, 2],
        ['castle_stalk_room', 5, 2]
    ]);

/** Java's `PieceWeight.doPlace`, which ignores the depth it is handed. */
const hasRoom = (entry: PieceWeight): boolean => entry.limit === 0 || entry.placed < entry.limit;

/**
 * Java's `updatePieceWeight`: the table's total weight, or -1 once every limited row is spent.
 *
 * An unlimited row does not count as room left, which is the quirk that turns a finished
 * castle into fillers.
 */
const openWeight = (table: readonly PieceWeight[]): number => {
    let total = 0;
    let anyLeft = false;
    for (const entry of table) {
        if (entry.limit > 0 && entry.placed < entry.limit) anyLeft = true;
        total += entry.weight;
    }

    return anyLeft ? total : -1;
};

/** The extent of each piece type's box, as Java's `createPiece` orients it from an exit. */
const PIECE_BOXES: Readonly<
    Record<FortressPieceKind, readonly [offX: number, offY: number, width: number, height: number, depth: number]>
> = {
    bridge_straight: [-1, -3, 5, 10, 19],
    bridge_crossing: [-8, -3, 19, 10, 19],
    bridge_end_filler: [-1, -3, 5, 10, 8],
    room_crossing: [-2, 0, 7, 9, 7],
    stairs_room: [-2, 0, 7, 11, 7],
    monster_throne: [-2, 0, 7, 8, 9],
    castle_entrance: [-5, -3, 13, 14, 13],
    castle_small_corridor: [-1, 0, 5, 7, 5],
    castle_small_corridor_crossing: [-1, 0, 5, 7, 5],
    castle_small_corridor_right_turn: [-1, 0, 5, 7, 5],
    castle_small_corridor_left_turn: [-1, 0, 5, 7, 5],
    castle_corridor_stairs: [-1, -7, 5, 14, 10],
    castle_corridor_t_balcony: [-3, 0, 9, 7, 9],
    castle_stalk_room: [-5, -3, 13, 14, 13]
};

/**
 * Builds one piece of a kind at an exit, or nothing when its box is too low or collides.
 *
 * The box is checked before the piece is built, so a type that draws in its constructor only
 * draws once it is known to fit, as Java's `createPiece` methods do.
 */
const createPiece = (
    kind: FortressPieceKind,
    layout: FortressLayout,
    random: RandomSource,
    footX: number,
    footY: number,
    footZ: number,
    direction: Facing,
    genDepth: number
): FortressPiece | undefined => {
    const [offX, offY, width, height, depth] = PIECE_BOXES[kind];
    const box = orientBox(footX, footY, footZ, offX, offY, 0, width, height, depth, direction);
    if (box.minY <= LOWEST_Y || layout.collidingPiece(box) !== undefined) return undefined;

    switch (kind) {
        case 'bridge_straight':
            return new BridgeStraight(genDepth, box, direction);
        case 'bridge_crossing':
            return new BridgeCrossing(genDepth, box, direction);
        case 'bridge_end_filler':
            return new BridgeEndFiller(genDepth, random, box, direction);
        case 'room_crossing':
            return new RoomCrossing(genDepth, box, direction);
        case 'stairs_room':
            return new StairsRoom(genDepth, box, direction);
        case 'monster_throne':
            return new MonsterThrone(genDepth, box, direction);
        case 'castle_entrance':
            return new CastleEntrance(genDepth, box, direction);
        case 'castle_small_corridor':
            return new CastleSmallCorridor(genDepth, box, direction);
        case 'castle_small_corridor_crossing':
            return new CastleSmallCorridorCrossing(genDepth, box, direction);
        case 'castle_small_corridor_right_turn':
            return new CastleSmallCorridorTurn(genDepth, random, box, direction, true);
        case 'castle_small_corridor_left_turn':
            return new CastleSmallCorridorTurn(genDepth, random, box, direction, false);
        case 'castle_corridor_stairs':
            return new CastleCorridorStairs(genDepth, box, direction);
        case 'castle_corridor_t_balcony':
            return new CastleCorridorTBalcony(genDepth, box, direction);
        case 'castle_stalk_room':
            return new CastleStalkRoom(genDepth, box, direction);
    }
};

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

/** One fortress being laid out: the pieces placed so far and the two tables they draw from. */
class FortressLayout {
    public readonly pieces: FortressPiece[] = [];

    /** The pieces whose own exits have not been opened yet, drained in a drawn order. */
    public readonly pending: FortressPiece[] = [];

    /** The start's box, which is what the spread limit is measured from. */
    public startBox: BoundingBox = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

    private bridge = bridgeWeights();
    private castle = castleWeights();
    private previous: PieceWeight | undefined;

    /** The first piece that overlaps a box, which is what stops a piece being built into another. */
    public collidingPiece(box: BoundingBox): FortressPiece | undefined {
        return this.pieces.find((piece) => boxesIntersect(piece.boundingBox, box));
    }

    /**
     * Java's `generateAndAddPiece`: grows one piece out of an exit.
     *
     * An exit too far from the start draws a filler and drops it, which is Java's behavior and
     * what keeps a fortress inside the eight-chunk window a start may reach into.
     */
    public growFrom(
        random: RandomSource,
        footX: number,
        footY: number,
        footZ: number,
        direction: Facing,
        depth: number,
        castle: boolean
    ): void {
        if (Math.abs(footX - this.startBox.minX) > MAX_SPREAD || Math.abs(footZ - this.startBox.minZ) > MAX_SPREAD) {
            createPiece('bridge_end_filler', this, random, footX, footY, footZ, direction, depth);
            return;
        }

        const table = castle ? this.castle : this.bridge;
        const piece = this.drawPiece(table, random, footX, footY, footZ, direction, depth + 1);
        if (piece === undefined) return;

        this.pieces.push(piece);
        this.pending.push(piece);
    }

    /** Java's `generatePiece`: five tries at the table, then a bridge end filler. */
    private drawPiece(
        table: PieceWeight[],
        random: RandomSource,
        footX: number,
        footY: number,
        footZ: number,
        direction: Facing,
        depth: number
    ): FortressPiece | undefined {
        const total = openWeight(table);
        const open = total > 0 && depth <= MAX_DEPTH;

        for (let attempt = 0; attempt < DRAW_ATTEMPTS && open; attempt++) {
            let selection = random.nextInt(total);
            for (const entry of table) {
                selection -= entry.weight;
                if (selection >= 0) continue;

                // The draw landed on this row. A row that is spent, or that was used last time
                // and may not repeat, ends the attempt. A row whose box did not fit lets the walk
                // carry on, which is how a blocked draw spills onto the rows after it.
                if (!hasRoom(entry)) break;
                if (entry === this.previous && !entry.allowInRow) break;

                const piece = createPiece(entry.kind, this, random, footX, footY, footZ, direction, depth);
                if (piece === undefined) continue;

                entry.placed++;
                this.previous = entry;
                if (!hasRoom(entry)) table.splice(table.indexOf(entry), 1);
                return piece;
            }
        }

        return createPiece('bridge_end_filler', this, random, footX, footY, footZ, direction, depth);
    }
}

/**
 * Java's `StructurePiecesBuilder.moveInsideHeights`: the one move that settles the fortress.
 *
 * The fortress is moved so its floor lands at a drawn y between 48 and 70 less its own height.
 * A fortress taller than the band has no room to draw in and lands at 48.
 */
const settleInsideHeights = (pieces: readonly FortressPiece[], random: RandomSource): void => {
    const box = unionOf(pieces);
    const room = SETTLE_MAX_Y - SETTLE_MIN_Y + 1 - (box.maxY - box.minY + 1);
    const floor = room > 1 ? SETTLE_MIN_Y + random.nextInt(room) : SETTLE_MIN_Y;

    const dy = floor - box.minY;
    for (const piece of pieces) piece.moveBy(dy);
};

/** Java's `getRandomHorizontalDirection`, which draws from north, east, south, west in that order. */
const randomFacing = (random: RandomSource): Facing => HORIZONTAL_DIRECTIONS[random.nextInt(4)]!;

/**
 * Lays out a nether fortress: the bridge crossing near the chunk corner and every piece that
 * grew off it.
 *
 * Java's generation point is the chunk's own world position at y 64, decided before a single
 * piece is drawn, so the whole layout sits behind the biome check.
 */
export const buildNetherFortress: StructureBuilder = (context): StructureLayout => {
    const blockX = context.chunkX * 16;
    const blockZ = context.chunkZ * 16;

    return {
        origin: { x: blockX, y: START_Y, z: blockZ },
        pieces: () => fortressPieces(context, blockX + 2, blockZ + 2)
    };
};

/** The pieces one fortress grew, which is Java's `NetherFortressStructure.generatePieces`. */
const fortressPieces = (context: StructureBuildContext, x: number, z: number): readonly StructurePiece[] => {
    const random = context.random;
    const layout = new FortressLayout();
    const facing = randomFacing(random);
    const start = new BridgeCrossing(0, makeBoundingBox(x, START_Y, z, facing, 19, 10, 19), facing);

    layout.startBox = start.boundingBox;
    layout.pieces.push(start);
    start.addChildren(layout, random);

    while (layout.pending.length > 0) {
        const index = random.nextInt(layout.pending.length);
        layout.pending.splice(index, 1)[0]!.addChildren(layout, random);
    }

    settleInsideHeights(layout.pieces, random);
    return layout.pieces;
};
