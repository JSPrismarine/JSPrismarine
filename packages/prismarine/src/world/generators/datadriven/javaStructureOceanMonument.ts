/**
 * Java's ocean monument, the prismarine building that sits on the deep ocean floor.
 *
 * `OceanMonumentStructure` puts the building at a fixed y 39 and hangs its corner 29 blocks off
 * the start chunk's own corner, so the terrain under it changes nothing. What the layout decides
 * is the floor plan. A 5 by 3 by 5 grid of rooms is wired up, each room then tries to wall off
 * two of its doorways and keeps a wall only when both sides can still reach the entrance, and the
 * rooms left unclaimed are taken by the first room shape that fits them. That is where the seed
 * shows, and the draws below follow Java's order so a seed produces Java's plan.
 *
 * Three things are done differently from Java.
 *
 * Java's `MonumentBuilding.postProcess` writes the shell and then walks its child pieces, skipping
 * the ones whose box misses the chunk. Here each Java piece is its own {@link StructurePiece} with
 * its own box, so a chunk writes the rooms it covers rather than all thirty of them.
 *
 * The simple room's center pillar and the sponge room's sponges are drawn while the monument is
 * laid out rather than while it is written, for the reason `javaStructureLegacyTemplates.ts`
 * gives. Java draws them in `postProcess`, which runs once per chunk a room covers, so a sponge
 * room on a chunk border grows two different patterns. The draws here happen once, after every
 * draw Java makes during layout, so Java's floor plan is untouched and the room is whole.
 *
 * Java's `findGenerationPoint` rejects a monument whose 29-block surroundings are not all in
 * `#minecraft:required_ocean_monument_surrounding`. A builder cannot read a biome tag, so the
 * check is left out and the structure's own biome list is all that holds a monument to deep
 * ocean.
 */
import type { BlockState, Direction } from '@jsprismarine/features';
import { ALL_DIRECTIONS, DIRECTION_STEPS, HORIZONTAL_DIRECTIONS, oppositeDirection } from '@jsprismarine/features';
import type { BoundingBox, RandomSource } from '@jsprismarine/structures';

import type { StructureBuilder, StructureLayout } from './javaStructureStarts';
import type { StructurePiece, StructureWriter } from './javaStructureWorld';
import { boxFromSize, movedBox } from './javaStructureWorld';

// ---------------------------------------------------------------------------
// The blocks a monument is made of
// ---------------------------------------------------------------------------

const block = (name: string): BlockState => ({ name, properties: {} });

/** Java's `BASE_GRAY`. */
const PRISMARINE = block('minecraft:prismarine');

/** Java's `BASE_LIGHT`, which is also the `DOT_DECO_DATA` the wall patterns are picked out in. */
const PRISMARINE_BRICKS = block('minecraft:prismarine_bricks');

/** Java's `BASE_BLACK`. */
const DARK_PRISMARINE = block('minecraft:dark_prismarine');

/** Java's `LAMP_BLOCK`. */
const SEA_LANTERN = block('minecraft:sea_lantern');

const GOLD_BLOCK = block('minecraft:gold_block');
const WET_SPONGE = block('minecraft:wet_sponge');
const WATER = block('minecraft:water');
const AIR = block('minecraft:air');

/** Java's `FILL_KEEP`: what a flood leaves alone. */
const FILL_KEEP: ReadonlySet<string> = new Set([
    'minecraft:ice',
    'minecraft:packed_ice',
    'minecraft:blue_ice',
    'minecraft:water'
]);

/** Java's `StructurePiece.isReplaceableByStructures`, which bounds how far a pillar reaches down. */
const REPLACEABLE: ReadonlySet<string> = new Set([
    'minecraft:air',
    'minecraft:cave_air',
    'minecraft:void_air',
    'minecraft:water',
    'minecraft:lava',
    'minecraft:glow_lichen',
    'minecraft:seagrass',
    'minecraft:tall_seagrass'
]);

// ---------------------------------------------------------------------------
// The frame a monument piece is written in
// ---------------------------------------------------------------------------

/** The direction the monument faces, which is what its local axes are measured against. */
type Orientation = (typeof HORIZONTAL_DIRECTIONS)[number];

/** A position in the world, which is what a piece's local coordinates map onto. */
interface WorldPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** Java's `StructurePiece.makeBoundingBox`: the depth runs along the piece's own facing. */
const orientedBox = (
    x: number,
    y: number,
    z: number,
    orientation: Orientation,
    width: number,
    height: number,
    depth: number
): BoundingBox =>
    orientation === 'north' || orientation === 'south'
        ? boxFromSize(x, y, z, width, height, depth)
        : boxFromSize(x, y, z, depth, height, width);

/** Java's `StructurePiece.getWorldX`. */
const worldX = (box: BoundingBox, orientation: Orientation, x: number, z: number): number =>
    orientation === 'west' ? box.maxX - z : orientation === 'east' ? box.minX + z : box.minX + x;

/** Java's `StructurePiece.getWorldZ`. */
const worldZ = (box: BoundingBox, orientation: Orientation, x: number, z: number): number =>
    orientation === 'north' ? box.maxZ - z : orientation === 'south' ? box.minZ + z : box.minZ + x;

/** Java's `StructurePiece.getWorldPos`. */
const worldPos = (box: BoundingBox, orientation: Orientation, x: number, y: number, z: number): WorldPosition => ({
    x: worldX(box, orientation, x, z),
    y: box.minY + y,
    z: worldZ(box, orientation, x, z)
});

/** Java's `BoundingBox.fromCorners`. */
const boxBetween = (one: WorldPosition, other: WorldPosition): BoundingBox => ({
    minX: Math.min(one.x, other.x),
    minY: Math.min(one.y, other.y),
    minZ: Math.min(one.z, other.z),
    maxX: Math.max(one.x, other.x),
    maxY: Math.max(one.y, other.y),
    maxZ: Math.max(one.z, other.z)
});

/**
 * One piece of a monument, written in Java's own local frame.
 *
 * A subclass names its blocks with `+x` to the monument's right, `+y` up and `+z` into it, and
 * mapping those onto the world is this class's whole job. Every state a monument writes is a full
 * cube with no facing, so Java's mirror and rotation of the state itself have nothing to do here.
 */
abstract class MonumentPiece implements StructurePiece {
    protected constructor(
        public readonly boundingBox: BoundingBox,
        protected readonly orientation: Orientation
    ) {}

    /** Writes the piece's blocks, in Java's own order. */
    public abstract place(writer: StructureWriter): void;

    protected worldX(x: number, z: number): number {
        return worldX(this.boundingBox, this.orientation, x, z);
    }

    protected worldY(y: number): number {
        return this.boundingBox.minY + y;
    }

    protected worldZ(x: number, z: number): number {
        return worldZ(this.boundingBox, this.orientation, x, z);
    }

    /** Java's `StructurePiece.placeBlock`. */
    protected put(writer: StructureWriter, x: number, y: number, z: number, state: BlockState): void {
        writer.setBlock(this.worldX(x, z), this.worldY(y), this.worldZ(x, z), state);
    }

    /** Java's `StructurePiece.getBlock`. */
    protected read(writer: StructureWriter, x: number, y: number, z: number): BlockState {
        return writer.blockAt(this.worldX(x, z), this.worldY(y), this.worldZ(x, z));
    }

    /**
     * Java's `generateBox` with one state.
     *
     * Every monument call passes the same block for the box's edge and its fill, so the two
     * arguments Java carries collapse to one.
     */
    protected fill(
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
                for (let z = z0; z <= z1; z++) this.put(writer, x, y, z, state);
            }
        }
    }

    /**
     * Java's `generateWaterBox`: the sea inside the monument, and air where the sea has ended.
     *
     * Ice and water already in the way are left as they are, which is what keeps a monument from
     * punching a hole through a frozen surface.
     */
    protected flood(
        writer: StructureWriter,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number
    ): void {
        for (let y = y0; y <= y1; y++) {
            const state = this.worldY(y) >= writer.level.seaLevel ? AIR : WATER;
            for (let x = x0; x <= x1; x++) {
                for (let z = z0; z <= z1; z++) {
                    if (FILL_KEEP.has(this.read(writer, x, y, z).name)) continue;

                    this.put(writer, x, y, z, state);
                }
            }
        }
    }

    /** Java's `generateBoxOnFillOnly`: a ceiling poured over the water a room was flooded with. */
    protected fillWater(
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
                for (let z = z0; z <= z1; z++) {
                    if (this.read(writer, x, y, z).name !== WATER.name) continue;

                    this.put(writer, x, y, z, state);
                }
            }
        }
    }

    /** Java's `generateDefaultFloor`: solid, or ringed around a hole down to the room below. */
    protected defaultFloor(writer: StructureWriter, xOff: number, zOff: number, openBelow: boolean): void {
        if (!openBelow) {
            this.fill(writer, xOff, 0, zOff, xOff + 7, 0, zOff + 7, PRISMARINE);
            return;
        }

        this.fill(writer, xOff, 0, zOff, xOff + 2, 0, zOff + 7, PRISMARINE);
        this.fill(writer, xOff + 5, 0, zOff, xOff + 7, 0, zOff + 7, PRISMARINE);
        this.fill(writer, xOff + 3, 0, zOff, xOff + 4, 0, zOff + 2, PRISMARINE);
        this.fill(writer, xOff + 3, 0, zOff + 5, xOff + 4, 0, zOff + 7, PRISMARINE);
        this.fill(writer, xOff + 3, 0, zOff + 2, xOff + 4, 0, zOff + 2, PRISMARINE_BRICKS);
        this.fill(writer, xOff + 3, 0, zOff + 5, xOff + 4, 0, zOff + 5, PRISMARINE_BRICKS);
        this.fill(writer, xOff + 2, 0, zOff + 3, xOff + 2, 0, zOff + 4, PRISMARINE_BRICKS);
        this.fill(writer, xOff + 5, 0, zOff + 3, xOff + 5, 0, zOff + 4, PRISMARINE_BRICKS);
    }

    /**
     * Java's `fillColumnDown`: carries a pillar down until it meets the sea floor.
     *
     * The walk stops as soon as a write is dropped, because the chunk's clip box spans its whole
     * height and so a first dropped write means the column is not in this chunk at all.
     */
    protected columnDown(writer: StructureWriter, state: BlockState, x: number, startY: number, z: number): void {
        const column = { x: this.worldX(x, z), z: this.worldZ(x, z) };
        const floor = writer.level.minY + 1;

        for (let y = this.worldY(startY); y > floor; y--) {
            if (!REPLACEABLE.has(writer.blockAt(column.x, y, column.z).name)) return;
            if (!writer.setBlock(column.x, y, column.z, state)) return;
        }
    }

    /** Java's `spawnElder`, which is the only entity a monument builds around. */
    protected elderGuardian(writer: StructureWriter, x: number, y: number, z: number): void {
        writer.spawnEntity('minecraft:elder_guardian', this.worldX(x, z), this.worldY(y), this.worldZ(x, z), 0);
    }
}

// ---------------------------------------------------------------------------
// The room graph
// ---------------------------------------------------------------------------

/** How many cells the room grid holds: 5 wide, 3 tall and 5 deep. */
const GRID_SIZE = 75;

/** Java's `getRoomIndex`, which is also what a piece reads its grid cell back out of. */
const roomIndexOf = (roomX: number, roomY: number, roomZ: number): number => roomY * 25 + roomZ * 5 + roomX;

const SOURCE_INDEX = roomIndexOf(2, 0, 0);
const TOP_CONNECT_INDEX = roomIndexOf(2, 2, 0);
const LEFT_WING_CONNECT_INDEX = roomIndexOf(0, 1, 0);
const RIGHT_WING_CONNECT_INDEX = roomIndexOf(4, 1, 0);

/** The three rooms that stand outside the grid, which no filler may claim. */
const LEFT_WING_INDEX = 1001;
const RIGHT_WING_INDEX = 1002;
const PENTHOUSE_INDEX = 1003;

const perDirection = <T>(value: T): Record<Direction, T> => ({
    down: value,
    up: value,
    north: value,
    south: value,
    west: value,
    east: value
});

/** One cell of the room grid: who it touches, which of those touches is a doorway, and who owns it. */
class RoomDefinition {
    public readonly connections = perDirection<RoomDefinition | undefined>(undefined);
    public readonly hasOpening = perDirection(false);
    public claimed = false;
    public isSource = false;
    private scanIndex = 0;

    public constructor(public readonly index: number) {}

    /** Java's `setConnection`, which wires both rooms at once. */
    public connect(direction: Direction, other: RoomDefinition): void {
        this.connections[direction] = other;
        other.connections[oppositeDirection(direction)] = this;
    }

    /** Java's `updateOpenings`: every wall a room shares starts out as a doorway. */
    public updateOpenings(): void {
        for (const direction of ALL_DIRECTIONS) this.hasOpening[direction] = this.connections[direction] !== undefined;
    }

    /** Whether the entry room is still reachable through the doorways left open. */
    public findSource(scanIndex: number): boolean {
        if (this.isSource) return true;

        this.scanIndex = scanIndex;
        for (const direction of ALL_DIRECTIONS) {
            const neighbor = this.connections[direction];
            if (neighbor === undefined || !this.hasOpening[direction]) continue;
            if (neighbor.scanIndex !== scanIndex && neighbor.findSource(scanIndex)) return true;
        }

        return false;
    }

    /** Whether the room is one of the two wings or the penthouse rather than a grid cell. */
    public get isSpecial(): boolean {
        return this.index >= GRID_SIZE;
    }

    /** How many doorways the room still has. */
    public countOpenings(): number {
        return ALL_DIRECTIONS.filter((direction) => this.hasOpening[direction]).length;
    }
}

/** What a monument's floor plan came out as. */
interface RoomGraph {
    /** Every room, shuffled the way Java shuffles them, with the three special rooms last. */
    readonly rooms: readonly RoomDefinition[];
    /** The room the entrance opens into, which every other room must stay reachable from. */
    readonly source: RoomDefinition;
    /** The 2 by 2 by 2 block of cells the treasure room fills. */
    readonly core: RoomDefinition;
}

/** Java's `Util.shuffle`, which is `Collections.shuffle`: Fisher-Yates walked from the top down. */
const shuffle = <T>(values: T[], random: RandomSource): void => {
    for (let index = values.length; index > 1; index--) {
        const swap = random.nextInt(index);
        const held = values[index - 1]!;
        values[index - 1] = values[swap]!;
        values[swap] = held;
    }
};

/**
 * Java's `generateRoomGraph`.
 *
 * The grid is wired up, the wings and the penthouse are hung off it, the treasure room claims its
 * eight cells, and then every room in a shuffled order tries up to five times to wall off two of
 * its doorways, keeping a wall only when both sides can still reach the entrance.
 */
const buildRoomGraph = (random: RandomSource): RoomGraph => {
    const grid = Array.from<RoomDefinition | undefined>({ length: GRID_SIZE }).fill(undefined);
    const addRoom = (roomX: number, roomY: number, roomZ: number): void => {
        const index = roomIndexOf(roomX, roomY, roomZ);
        grid[index] = new RoomDefinition(index);
    };

    for (let roomX = 0; roomX < 5; roomX++) {
        for (let roomZ = 0; roomZ < 4; roomZ++) addRoom(roomX, 0, roomZ);
    }
    for (let roomX = 0; roomX < 5; roomX++) {
        for (let roomZ = 0; roomZ < 4; roomZ++) addRoom(roomX, 1, roomZ);
    }
    for (let roomX = 1; roomX < 4; roomX++) {
        for (let roomZ = 0; roomZ < 2; roomZ++) addRoom(roomX, 2, roomZ);
    }

    const source = grid[SOURCE_INDEX]!;

    for (let roomX = 0; roomX < 5; roomX++) {
        for (let roomZ = 0; roomZ < 5; roomZ++) {
            for (let roomY = 0; roomY < 3; roomY++) {
                const room = grid[roomIndexOf(roomX, roomY, roomZ)];
                if (room === undefined) continue;

                for (const direction of ALL_DIRECTIONS) {
                    const [stepX, stepY, stepZ] = DIRECTION_STEPS[direction];
                    const nextX = roomX + stepX;
                    const nextY = roomY + stepY;
                    const nextZ = roomZ + stepZ;
                    if (nextX < 0 || nextX >= 5 || nextZ < 0 || nextZ >= 5 || nextY < 0 || nextY >= 3) continue;

                    const neighbor = grid[roomIndexOf(nextX, nextY, nextZ)];
                    if (neighbor === undefined) continue;

                    // The monument's own depth axis runs against the world's, so a step along z
                    // is wired up as the direction facing the other way.
                    room.connect(nextZ === roomZ ? direction : oppositeDirection(direction), neighbor);
                }
            }
        }
    }

    const penthouse = new RoomDefinition(PENTHOUSE_INDEX);
    const leftWing = new RoomDefinition(LEFT_WING_INDEX);
    const rightWing = new RoomDefinition(RIGHT_WING_INDEX);
    grid[TOP_CONNECT_INDEX]!.connect('up', penthouse);
    grid[LEFT_WING_CONNECT_INDEX]!.connect('south', leftWing);
    grid[RIGHT_WING_CONNECT_INDEX]!.connect('south', rightWing);
    penthouse.claimed = true;
    leftWing.claimed = true;
    rightWing.claimed = true;
    source.isSource = true;

    const core = grid[roomIndexOf(random.nextInt(4), 0, 2)]!;
    claimCoreCells(core);

    const rooms: RoomDefinition[] = [];
    for (const room of grid) {
        if (room === undefined) continue;

        room.updateOpenings();
        rooms.push(room);
    }
    penthouse.updateOpenings();
    shuffle(rooms, random);

    let scanIndex = 1;
    for (const room of rooms) {
        let walled = 0;
        let attempts = 0;

        while (walled < 2 && attempts < 5) {
            attempts++;
            const direction = ALL_DIRECTIONS[random.nextInt(ALL_DIRECTIONS.length)]!;
            if (!room.hasOpening[direction]) continue;

            const back = oppositeDirection(direction);
            const neighbor = room.connections[direction]!;
            room.hasOpening[direction] = false;
            neighbor.hasOpening[back] = false;
            if (room.findSource(scanIndex++) && neighbor.findSource(scanIndex++)) {
                walled++;
            } else {
                room.hasOpening[direction] = true;
                neighbor.hasOpening[back] = true;
            }
        }
    }

    rooms.push(penthouse, leftWing, rightWing);
    return { rooms, source, core };
};

/** The eight cells the treasure room fills, which no other room may be built in. */
const claimCoreCells = (core: RoomDefinition): void => {
    const east = core.connections.east!;
    const north = core.connections.north!;

    core.claimed = true;
    east.claimed = true;
    north.claimed = true;
    east.connections.north!.claimed = true;
    core.connections.up!.claimed = true;
    east.connections.up!.claimed = true;
    north.connections.up!.claimed = true;
    east.connections.north!.connections.up!.claimed = true;
};

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** How far a child room's own frame sits from the monument's corner. */
type RoomOffset = WorldPosition;

/** Java's `OceanMonumentPiece.makeBoundingBox`, in cells rather than blocks. */
const roomBox = (
    orientation: Orientation,
    room: RoomDefinition,
    roomWidth: number,
    roomHeight: number,
    roomDepth: number
): BoundingBox => {
    const cellX = room.index % 5;
    const cellZ = Math.floor(room.index / 5) % 5;
    const cellY = Math.floor(room.index / 25);
    const box = orientedBox(0, 0, 0, orientation, roomWidth * 8, roomHeight * 4, roomDepth * 8);

    switch (orientation) {
        case 'north':
            return movedBox(box, cellX * 8, cellY * 4, -(cellZ + roomDepth) * 8 + 1);
        case 'south':
            return movedBox(box, cellX * 8, cellY * 4, cellZ * 8);
        case 'west':
            return movedBox(box, -(cellZ + roomDepth) * 8 + 1, cellY * 4, cellX * 8);
        default:
            return movedBox(box, cellZ * 8, cellY * 4, cellX * 8);
    }
};

/** A piece that fills one or more cells of the room grid. */
abstract class MonumentRoomPiece extends MonumentPiece {
    protected constructor(
        orientation: Orientation,
        protected readonly room: RoomDefinition,
        roomWidth: number,
        roomHeight: number,
        roomDepth: number,
        offset: RoomOffset
    ) {
        const box = roomBox(orientation, room, roomWidth, roomHeight, roomDepth);
        super(movedBox(box, offset.x, offset.y, offset.z), orientation);
    }

    /** Whether the room stands on another room rather than on the monument's own floor. */
    protected get isUpstairs(): boolean {
        return this.room.index >= 25;
    }
}

/** The room the entrance corridor opens into. */
class EntryRoom extends MonumentRoomPiece {
    public constructor(orientation: Orientation, room: RoomDefinition, offset: RoomOffset) {
        super(orientation, room, 1, 1, 1, offset);
    }

    public place(writer: StructureWriter): void {
        this.fill(writer, 0, 3, 0, 2, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 5, 3, 0, 7, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 2, 0, 1, 2, 7, PRISMARINE_BRICKS);
        this.fill(writer, 6, 2, 0, 7, 2, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 1, 0, 0, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 7, 1, 0, 7, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 1, 7, 7, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 0, 2, 3, 0, PRISMARINE_BRICKS);
        this.fill(writer, 5, 1, 0, 6, 3, 0, PRISMARINE_BRICKS);

        if (this.room.hasOpening.north) this.flood(writer, 3, 1, 7, 4, 2, 7);
        if (this.room.hasOpening.west) this.flood(writer, 0, 1, 3, 1, 2, 4);
        if (this.room.hasOpening.east) this.flood(writer, 6, 1, 3, 7, 2, 4);
    }
}

/** The treasure room: eight gold blocks inside a dark prismarine block, lit from four corners. */
class CoreRoom extends MonumentRoomPiece {
    public constructor(orientation: Orientation, room: RoomDefinition, offset: RoomOffset) {
        super(orientation, room, 2, 2, 2, offset);
    }

    public place(writer: StructureWriter): void {
        this.fillWater(writer, 1, 8, 0, 14, 8, 14, PRISMARINE);
        this.fill(writer, 0, 7, 0, 0, 7, 15, PRISMARINE_BRICKS);
        this.fill(writer, 15, 7, 0, 15, 7, 15, PRISMARINE_BRICKS);
        this.fill(writer, 1, 7, 0, 15, 7, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 7, 15, 14, 7, 15, PRISMARINE_BRICKS);

        for (let y = 1; y <= 6; y++) {
            const banded = y === 2 || y === 6 ? PRISMARINE : PRISMARINE_BRICKS;

            for (let x = 0; x <= 15; x += 15) {
                this.fill(writer, x, y, 0, x, y, 1, banded);
                this.fill(writer, x, y, 6, x, y, 9, banded);
                this.fill(writer, x, y, 14, x, y, 15, banded);
            }

            this.fill(writer, 1, y, 0, 1, y, 0, banded);
            this.fill(writer, 6, y, 0, 9, y, 0, banded);
            this.fill(writer, 14, y, 0, 14, y, 0, banded);
            this.fill(writer, 1, y, 15, 14, y, 15, banded);
        }

        this.fill(writer, 6, 3, 6, 9, 6, 9, DARK_PRISMARINE);
        this.fill(writer, 7, 4, 7, 8, 5, 8, GOLD_BLOCK);

        for (let y = 3; y <= 6; y += 3) {
            for (let x = 6; x <= 9; x += 3) {
                this.put(writer, x, y, 6, SEA_LANTERN);
                this.put(writer, x, y, 9, SEA_LANTERN);
            }
        }

        this.fill(writer, 5, 1, 6, 5, 2, 6, PRISMARINE_BRICKS);
        this.fill(writer, 5, 1, 9, 5, 2, 9, PRISMARINE_BRICKS);
        this.fill(writer, 10, 1, 6, 10, 2, 6, PRISMARINE_BRICKS);
        this.fill(writer, 10, 1, 9, 10, 2, 9, PRISMARINE_BRICKS);
        this.fill(writer, 6, 1, 5, 6, 2, 5, PRISMARINE_BRICKS);
        this.fill(writer, 9, 1, 5, 9, 2, 5, PRISMARINE_BRICKS);
        this.fill(writer, 6, 1, 10, 6, 2, 10, PRISMARINE_BRICKS);
        this.fill(writer, 9, 1, 10, 9, 2, 10, PRISMARINE_BRICKS);
        this.fill(writer, 5, 2, 5, 5, 6, 5, PRISMARINE_BRICKS);
        this.fill(writer, 5, 2, 10, 5, 6, 10, PRISMARINE_BRICKS);
        this.fill(writer, 10, 2, 5, 10, 6, 5, PRISMARINE_BRICKS);
        this.fill(writer, 10, 2, 10, 10, 6, 10, PRISMARINE_BRICKS);
        this.fill(writer, 5, 7, 1, 5, 7, 6, PRISMARINE_BRICKS);
        this.fill(writer, 10, 7, 1, 10, 7, 6, PRISMARINE_BRICKS);
        this.fill(writer, 5, 7, 9, 5, 7, 14, PRISMARINE_BRICKS);
        this.fill(writer, 10, 7, 9, 10, 7, 14, PRISMARINE_BRICKS);
        this.fill(writer, 1, 7, 5, 6, 7, 5, PRISMARINE_BRICKS);
        this.fill(writer, 1, 7, 10, 6, 7, 10, PRISMARINE_BRICKS);
        this.fill(writer, 9, 7, 5, 14, 7, 5, PRISMARINE_BRICKS);
        this.fill(writer, 9, 7, 10, 14, 7, 10, PRISMARINE_BRICKS);
        this.fill(writer, 2, 1, 2, 2, 1, 3, PRISMARINE_BRICKS);
        this.fill(writer, 3, 1, 2, 3, 1, 2, PRISMARINE_BRICKS);
        this.fill(writer, 13, 1, 2, 13, 1, 3, PRISMARINE_BRICKS);
        this.fill(writer, 12, 1, 2, 12, 1, 2, PRISMARINE_BRICKS);
        this.fill(writer, 2, 1, 12, 2, 1, 13, PRISMARINE_BRICKS);
        this.fill(writer, 3, 1, 13, 3, 1, 13, PRISMARINE_BRICKS);
        this.fill(writer, 13, 1, 12, 13, 1, 13, PRISMARINE_BRICKS);
        this.fill(writer, 12, 1, 13, 12, 1, 13, PRISMARINE_BRICKS);
    }
}

/** One of the three patterns a plain room is decorated with. */
class SimpleRoom extends MonumentRoomPiece {
    /** Whether the room grows a pillar in the middle, drawn once while the monument is laid out. */
    private centerPillar = false;

    public constructor(
        orientation: Orientation,
        room: RoomDefinition,
        offset: RoomOffset,
        private readonly design: number
    ) {
        super(orientation, room, 1, 1, 1, offset);
    }

    /** Java's `postProcess` draw, taken here so the pillar is the same in every chunk. */
    public settleDecoration(random: RandomSource): void {
        this.centerPillar =
            this.design !== 0 &&
            random.nextBoolean() &&
            !this.room.hasOpening.down &&
            !this.room.hasOpening.up &&
            this.room.countOpenings() > 1;
    }

    public place(writer: StructureWriter): void {
        if (this.isUpstairs) this.defaultFloor(writer, 0, 0, this.room.hasOpening.down);
        if (this.room.connections.up === undefined) this.fillWater(writer, 1, 4, 1, 6, 4, 6, PRISMARINE);

        if (this.design === 0) this.placeCorners(writer);
        else if (this.design === 1) this.placeLanterns(writer);
        else this.placeBands(writer);

        if (this.centerPillar) {
            this.fill(writer, 3, 1, 3, 4, 1, 4, PRISMARINE_BRICKS);
            this.fill(writer, 3, 2, 3, 4, 2, 4, PRISMARINE);
            this.fill(writer, 3, 3, 3, 4, 3, 4, PRISMARINE_BRICKS);
        }
    }

    /** Java's first design: a lantern tucked into each of the four corners. */
    private placeCorners(writer: StructureWriter): void {
        this.fill(writer, 0, 1, 0, 2, 1, 2, PRISMARINE_BRICKS);
        this.fill(writer, 0, 3, 0, 2, 3, 2, PRISMARINE_BRICKS);
        this.fill(writer, 0, 2, 0, 0, 2, 2, PRISMARINE);
        this.fill(writer, 1, 2, 0, 2, 2, 0, PRISMARINE);
        this.put(writer, 1, 2, 1, SEA_LANTERN);
        this.fill(writer, 5, 1, 0, 7, 1, 2, PRISMARINE_BRICKS);
        this.fill(writer, 5, 3, 0, 7, 3, 2, PRISMARINE_BRICKS);
        this.fill(writer, 7, 2, 0, 7, 2, 2, PRISMARINE);
        this.fill(writer, 5, 2, 0, 6, 2, 0, PRISMARINE);
        this.put(writer, 6, 2, 1, SEA_LANTERN);
        this.fill(writer, 0, 1, 5, 2, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 3, 5, 2, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 2, 5, 0, 2, 7, PRISMARINE);
        this.fill(writer, 1, 2, 7, 2, 2, 7, PRISMARINE);
        this.put(writer, 1, 2, 6, SEA_LANTERN);
        this.fill(writer, 5, 1, 5, 7, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 5, 3, 5, 7, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 7, 2, 5, 7, 2, 7, PRISMARINE);
        this.fill(writer, 5, 2, 7, 6, 2, 7, PRISMARINE);
        this.put(writer, 6, 2, 6, SEA_LANTERN);

        if (this.room.hasOpening.south) {
            this.fill(writer, 3, 3, 0, 4, 3, 0, PRISMARINE_BRICKS);
        } else {
            this.fill(writer, 3, 3, 0, 4, 3, 1, PRISMARINE_BRICKS);
            this.fill(writer, 3, 2, 0, 4, 2, 0, PRISMARINE);
            this.fill(writer, 3, 1, 0, 4, 1, 1, PRISMARINE_BRICKS);
        }

        if (this.room.hasOpening.north) {
            this.fill(writer, 3, 3, 7, 4, 3, 7, PRISMARINE_BRICKS);
        } else {
            this.fill(writer, 3, 3, 6, 4, 3, 7, PRISMARINE_BRICKS);
            this.fill(writer, 3, 2, 7, 4, 2, 7, PRISMARINE);
            this.fill(writer, 3, 1, 6, 4, 1, 7, PRISMARINE_BRICKS);
        }

        if (this.room.hasOpening.west) {
            this.fill(writer, 0, 3, 3, 0, 3, 4, PRISMARINE_BRICKS);
        } else {
            this.fill(writer, 0, 3, 3, 1, 3, 4, PRISMARINE_BRICKS);
            this.fill(writer, 0, 2, 3, 0, 2, 4, PRISMARINE);
            this.fill(writer, 0, 1, 3, 1, 1, 4, PRISMARINE_BRICKS);
        }

        if (this.room.hasOpening.east) {
            this.fill(writer, 7, 3, 3, 7, 3, 4, PRISMARINE_BRICKS);
        } else {
            this.fill(writer, 6, 3, 3, 7, 3, 4, PRISMARINE_BRICKS);
            this.fill(writer, 7, 2, 3, 7, 2, 4, PRISMARINE);
            this.fill(writer, 6, 1, 3, 7, 1, 4, PRISMARINE_BRICKS);
        }
    }

    /** Java's second design: four lantern columns standing clear of the walls. */
    private placeLanterns(writer: StructureWriter): void {
        this.fill(writer, 2, 1, 2, 2, 3, 2, PRISMARINE_BRICKS);
        this.fill(writer, 2, 1, 5, 2, 3, 5, PRISMARINE_BRICKS);
        this.fill(writer, 5, 1, 5, 5, 3, 5, PRISMARINE_BRICKS);
        this.fill(writer, 5, 1, 2, 5, 3, 2, PRISMARINE_BRICKS);
        this.put(writer, 2, 2, 2, SEA_LANTERN);
        this.put(writer, 2, 2, 5, SEA_LANTERN);
        this.put(writer, 5, 2, 5, SEA_LANTERN);
        this.put(writer, 5, 2, 2, SEA_LANTERN);
        this.fill(writer, 0, 1, 0, 1, 3, 0, PRISMARINE_BRICKS);
        this.fill(writer, 0, 1, 1, 0, 3, 1, PRISMARINE_BRICKS);
        this.fill(writer, 0, 1, 7, 1, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 1, 6, 0, 3, 6, PRISMARINE_BRICKS);
        this.fill(writer, 6, 1, 7, 7, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 7, 1, 6, 7, 3, 6, PRISMARINE_BRICKS);
        this.fill(writer, 6, 1, 0, 7, 3, 0, PRISMARINE_BRICKS);
        this.fill(writer, 7, 1, 1, 7, 3, 1, PRISMARINE_BRICKS);
        this.put(writer, 1, 2, 0, PRISMARINE);
        this.put(writer, 0, 2, 1, PRISMARINE);
        this.put(writer, 1, 2, 7, PRISMARINE);
        this.put(writer, 0, 2, 6, PRISMARINE);
        this.put(writer, 6, 2, 7, PRISMARINE);
        this.put(writer, 7, 2, 6, PRISMARINE);
        this.put(writer, 6, 2, 0, PRISMARINE);
        this.put(writer, 7, 2, 1, PRISMARINE);

        if (!this.room.hasOpening.south) {
            this.fill(writer, 1, 3, 0, 6, 3, 0, PRISMARINE_BRICKS);
            this.fill(writer, 1, 2, 0, 6, 2, 0, PRISMARINE);
            this.fill(writer, 1, 1, 0, 6, 1, 0, PRISMARINE_BRICKS);
        }

        if (!this.room.hasOpening.north) {
            this.fill(writer, 1, 3, 7, 6, 3, 7, PRISMARINE_BRICKS);
            this.fill(writer, 1, 2, 7, 6, 2, 7, PRISMARINE);
            this.fill(writer, 1, 1, 7, 6, 1, 7, PRISMARINE_BRICKS);
        }

        if (!this.room.hasOpening.west) {
            this.fill(writer, 0, 3, 1, 0, 3, 6, PRISMARINE_BRICKS);
            this.fill(writer, 0, 2, 1, 0, 2, 6, PRISMARINE);
            this.fill(writer, 0, 1, 1, 0, 1, 6, PRISMARINE_BRICKS);
        }

        if (!this.room.hasOpening.east) {
            this.fill(writer, 7, 3, 1, 7, 3, 6, PRISMARINE_BRICKS);
            this.fill(writer, 7, 2, 1, 7, 2, 6, PRISMARINE);
            this.fill(writer, 7, 1, 1, 7, 1, 6, PRISMARINE_BRICKS);
        }
    }

    /** Java's third design: a dark prismarine band running around the room at head height. */
    private placeBands(writer: StructureWriter): void {
        this.fill(writer, 0, 1, 0, 0, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 7, 1, 0, 7, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 0, 6, 1, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 7, 6, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 2, 0, 0, 2, 7, DARK_PRISMARINE);
        this.fill(writer, 7, 2, 0, 7, 2, 7, DARK_PRISMARINE);
        this.fill(writer, 1, 2, 0, 6, 2, 0, DARK_PRISMARINE);
        this.fill(writer, 1, 2, 7, 6, 2, 7, DARK_PRISMARINE);
        this.fill(writer, 0, 3, 0, 0, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 7, 3, 0, 7, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 0, 6, 3, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 7, 6, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 1, 3, 0, 2, 4, DARK_PRISMARINE);
        this.fill(writer, 7, 1, 3, 7, 2, 4, DARK_PRISMARINE);
        this.fill(writer, 3, 1, 0, 4, 2, 0, DARK_PRISMARINE);
        this.fill(writer, 3, 1, 7, 4, 2, 7, DARK_PRISMARINE);

        if (this.room.hasOpening.south) this.flood(writer, 3, 1, 0, 4, 2, 0);
        if (this.room.hasOpening.north) this.flood(writer, 3, 1, 7, 4, 2, 7);
        if (this.room.hasOpening.west) this.flood(writer, 0, 1, 3, 0, 2, 4);
        if (this.room.hasOpening.east) this.flood(writer, 7, 1, 3, 7, 2, 4);
    }
}

/** The sealed room at the top of a column, whose ceiling grows wet sponges. */
class SimpleTopRoom extends MonumentRoomPiece {
    /** Where the sponges hang, drawn once so the pattern is the same in every chunk. */
    private sponges: readonly (readonly [number, number, number])[] = [];

    public constructor(orientation: Orientation, room: RoomDefinition, offset: RoomOffset) {
        super(orientation, room, 1, 1, 1, offset);
    }

    /** Java's `postProcess` draws, taken here so a room on a chunk border grows one pattern. */
    public settleDecoration(random: RandomSource): void {
        const sponges: [number, number, number][] = [];

        for (let x = 1; x <= 6; x++) {
            for (let z = 1; z <= 6; z++) {
                if (random.nextInt(3) === 0) continue;

                sponges.push([x, 2 + (random.nextInt(4) === 0 ? 0 : 1), z]);
            }
        }

        this.sponges = sponges;
    }

    public place(writer: StructureWriter): void {
        if (this.isUpstairs) this.defaultFloor(writer, 0, 0, this.room.hasOpening.down);
        if (this.room.connections.up === undefined) this.fillWater(writer, 1, 4, 1, 6, 4, 6, PRISMARINE);

        for (const [x, y, z] of this.sponges) this.fill(writer, x, y, z, x, 3, z, WET_SPONGE);

        this.fill(writer, 0, 1, 0, 0, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 7, 1, 0, 7, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 0, 6, 1, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 7, 6, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 2, 0, 0, 2, 7, DARK_PRISMARINE);
        this.fill(writer, 7, 2, 0, 7, 2, 7, DARK_PRISMARINE);
        this.fill(writer, 1, 2, 0, 6, 2, 0, DARK_PRISMARINE);
        this.fill(writer, 1, 2, 7, 6, 2, 7, DARK_PRISMARINE);
        this.fill(writer, 0, 3, 0, 0, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 7, 3, 0, 7, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 0, 6, 3, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 7, 6, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 1, 3, 0, 2, 4, DARK_PRISMARINE);
        this.fill(writer, 7, 1, 3, 7, 2, 4, DARK_PRISMARINE);
        this.fill(writer, 3, 1, 0, 4, 2, 0, DARK_PRISMARINE);
        this.fill(writer, 3, 1, 7, 4, 2, 7, DARK_PRISMARINE);

        if (this.room.hasOpening.south) this.flood(writer, 3, 1, 0, 4, 2, 0);
    }
}

/** Two cells wide: a hall with a lit arch across the middle. */
class DoubleXRoom extends MonumentRoomPiece {
    public constructor(orientation: Orientation, room: RoomDefinition, offset: RoomOffset) {
        super(orientation, room, 2, 1, 1, offset);
    }

    public place(writer: StructureWriter): void {
        const west = this.room;
        const east = west.connections.east!;

        if (this.isUpstairs) {
            this.defaultFloor(writer, 8, 0, east.hasOpening.down);
            this.defaultFloor(writer, 0, 0, west.hasOpening.down);
        }

        if (west.connections.up === undefined) this.fillWater(writer, 1, 4, 1, 7, 4, 6, PRISMARINE);
        if (east.connections.up === undefined) this.fillWater(writer, 8, 4, 1, 14, 4, 6, PRISMARINE);

        this.fill(writer, 0, 3, 0, 0, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 15, 3, 0, 15, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 0, 15, 3, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 7, 14, 3, 7, PRISMARINE_BRICKS);
        this.fill(writer, 0, 2, 0, 0, 2, 7, PRISMARINE);
        this.fill(writer, 15, 2, 0, 15, 2, 7, PRISMARINE);
        this.fill(writer, 1, 2, 0, 15, 2, 0, PRISMARINE);
        this.fill(writer, 1, 2, 7, 14, 2, 7, PRISMARINE);
        this.fill(writer, 0, 1, 0, 0, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 15, 1, 0, 15, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 0, 15, 1, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 7, 14, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 5, 1, 0, 10, 1, 4, PRISMARINE_BRICKS);
        this.fill(writer, 6, 2, 0, 9, 2, 3, PRISMARINE);
        this.fill(writer, 5, 3, 0, 10, 3, 4, PRISMARINE_BRICKS);
        this.put(writer, 6, 2, 3, SEA_LANTERN);
        this.put(writer, 9, 2, 3, SEA_LANTERN);

        if (west.hasOpening.south) this.flood(writer, 3, 1, 0, 4, 2, 0);
        if (west.hasOpening.north) this.flood(writer, 3, 1, 7, 4, 2, 7);
        if (west.hasOpening.west) this.flood(writer, 0, 1, 3, 0, 2, 4);
        if (east.hasOpening.south) this.flood(writer, 11, 1, 0, 12, 2, 0);
        if (east.hasOpening.north) this.flood(writer, 11, 1, 7, 12, 2, 7);
        if (east.hasOpening.east) this.flood(writer, 15, 1, 3, 15, 2, 4);
    }
}

/** Two cells wide and two tall: a gallery with a lit balcony over the floor. */
class DoubleXYRoom extends MonumentRoomPiece {
    public constructor(orientation: Orientation, room: RoomDefinition, offset: RoomOffset) {
        super(orientation, room, 2, 2, 1, offset);
    }

    public place(writer: StructureWriter): void {
        const west = this.room;
        const east = west.connections.east!;
        const westUp = west.connections.up!;
        const eastUp = east.connections.up!;

        if (this.isUpstairs) {
            this.defaultFloor(writer, 8, 0, east.hasOpening.down);
            this.defaultFloor(writer, 0, 0, west.hasOpening.down);
        }

        if (westUp.connections.up === undefined) this.fillWater(writer, 1, 8, 1, 7, 8, 6, PRISMARINE);
        if (eastUp.connections.up === undefined) this.fillWater(writer, 8, 8, 1, 14, 8, 6, PRISMARINE);

        for (let y = 1; y <= 7; y++) {
            const banded = y === 2 || y === 6 ? PRISMARINE : PRISMARINE_BRICKS;
            this.fill(writer, 0, y, 0, 0, y, 7, banded);
            this.fill(writer, 15, y, 0, 15, y, 7, banded);
            this.fill(writer, 1, y, 0, 15, y, 0, banded);
            this.fill(writer, 1, y, 7, 14, y, 7, banded);
        }

        this.fill(writer, 2, 1, 3, 2, 7, 4, PRISMARINE_BRICKS);
        this.fill(writer, 3, 1, 2, 4, 7, 2, PRISMARINE_BRICKS);
        this.fill(writer, 3, 1, 5, 4, 7, 5, PRISMARINE_BRICKS);
        this.fill(writer, 13, 1, 3, 13, 7, 4, PRISMARINE_BRICKS);
        this.fill(writer, 11, 1, 2, 12, 7, 2, PRISMARINE_BRICKS);
        this.fill(writer, 11, 1, 5, 12, 7, 5, PRISMARINE_BRICKS);
        this.fill(writer, 5, 1, 3, 5, 3, 4, PRISMARINE_BRICKS);
        this.fill(writer, 10, 1, 3, 10, 3, 4, PRISMARINE_BRICKS);
        this.fill(writer, 5, 7, 2, 10, 7, 5, PRISMARINE_BRICKS);
        this.fill(writer, 5, 5, 2, 5, 7, 2, PRISMARINE_BRICKS);
        this.fill(writer, 10, 5, 2, 10, 7, 2, PRISMARINE_BRICKS);
        this.fill(writer, 5, 5, 5, 5, 7, 5, PRISMARINE_BRICKS);
        this.fill(writer, 10, 5, 5, 10, 7, 5, PRISMARINE_BRICKS);
        this.put(writer, 6, 6, 2, PRISMARINE_BRICKS);
        this.put(writer, 9, 6, 2, PRISMARINE_BRICKS);
        this.put(writer, 6, 6, 5, PRISMARINE_BRICKS);
        this.put(writer, 9, 6, 5, PRISMARINE_BRICKS);
        this.fill(writer, 5, 4, 3, 6, 4, 4, PRISMARINE_BRICKS);
        this.fill(writer, 9, 4, 3, 10, 4, 4, PRISMARINE_BRICKS);
        this.put(writer, 5, 4, 2, SEA_LANTERN);
        this.put(writer, 5, 4, 5, SEA_LANTERN);
        this.put(writer, 10, 4, 2, SEA_LANTERN);
        this.put(writer, 10, 4, 5, SEA_LANTERN);

        if (west.hasOpening.south) this.flood(writer, 3, 1, 0, 4, 2, 0);
        if (west.hasOpening.north) this.flood(writer, 3, 1, 7, 4, 2, 7);
        if (west.hasOpening.west) this.flood(writer, 0, 1, 3, 0, 2, 4);
        if (east.hasOpening.south) this.flood(writer, 11, 1, 0, 12, 2, 0);
        if (east.hasOpening.north) this.flood(writer, 11, 1, 7, 12, 2, 7);
        if (east.hasOpening.east) this.flood(writer, 15, 1, 3, 15, 2, 4);
        if (westUp.hasOpening.south) this.flood(writer, 3, 5, 0, 4, 6, 0);
        if (westUp.hasOpening.north) this.flood(writer, 3, 5, 7, 4, 6, 7);
        if (westUp.hasOpening.west) this.flood(writer, 0, 5, 3, 0, 6, 4);
        if (eastUp.hasOpening.south) this.flood(writer, 11, 5, 0, 12, 6, 0);
        if (eastUp.hasOpening.north) this.flood(writer, 11, 5, 7, 12, 6, 7);
        if (eastUp.hasOpening.east) this.flood(writer, 15, 5, 3, 15, 6, 4);
    }
}

/** Two cells tall: one room with its floor halfway up, walled or arched on each side. */
class DoubleYRoom extends MonumentRoomPiece {
    public constructor(orientation: Orientation, room: RoomDefinition, offset: RoomOffset) {
        super(orientation, room, 1, 2, 1, offset);
    }

    public place(writer: StructureWriter): void {
        if (this.isUpstairs) this.defaultFloor(writer, 0, 0, this.room.hasOpening.down);

        const above = this.room.connections.up!;
        if (above.connections.up === undefined) this.fillWater(writer, 1, 8, 1, 6, 8, 6, PRISMARINE);

        this.fill(writer, 0, 4, 0, 0, 4, 7, PRISMARINE_BRICKS);
        this.fill(writer, 7, 4, 0, 7, 4, 7, PRISMARINE_BRICKS);
        this.fill(writer, 1, 4, 0, 6, 4, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 4, 7, 6, 4, 7, PRISMARINE_BRICKS);
        this.fill(writer, 2, 4, 1, 2, 4, 2, PRISMARINE_BRICKS);
        this.fill(writer, 1, 4, 2, 1, 4, 2, PRISMARINE_BRICKS);
        this.fill(writer, 5, 4, 1, 5, 4, 2, PRISMARINE_BRICKS);
        this.fill(writer, 6, 4, 2, 6, 4, 2, PRISMARINE_BRICKS);
        this.fill(writer, 2, 4, 5, 2, 4, 6, PRISMARINE_BRICKS);
        this.fill(writer, 1, 4, 5, 1, 4, 5, PRISMARINE_BRICKS);
        this.fill(writer, 5, 4, 5, 5, 4, 6, PRISMARINE_BRICKS);
        this.fill(writer, 6, 4, 5, 6, 4, 5, PRISMARINE_BRICKS);

        let story = this.room;
        for (let y = 1; y <= 5; y += 4) {
            this.placeWall(writer, story.hasOpening.south, y, 0, 'south');
            this.placeWall(writer, story.hasOpening.north, y, 7, 'north');
            this.placeWall(writer, story.hasOpening.west, y, 0, 'west');
            this.placeWall(writer, story.hasOpening.east, y, 7, 'east');
            story = above;
        }
    }

    /** One side of a story: an arch over a doorway, or a banded wall where there is none. */
    private placeWall(writer: StructureWriter, open: boolean, y: number, at: number, side: Direction): void {
        const alongZ = side === 'south' || side === 'north';

        if (open) {
            if (alongZ) {
                this.fill(writer, 2, y, at, 2, y + 2, at, PRISMARINE_BRICKS);
                this.fill(writer, 5, y, at, 5, y + 2, at, PRISMARINE_BRICKS);
                this.fill(writer, 3, y + 2, at, 4, y + 2, at, PRISMARINE_BRICKS);
            } else {
                this.fill(writer, at, y, 2, at, y + 2, 2, PRISMARINE_BRICKS);
                this.fill(writer, at, y, 5, at, y + 2, 5, PRISMARINE_BRICKS);
                this.fill(writer, at, y + 2, 3, at, y + 2, 4, PRISMARINE_BRICKS);
            }

            return;
        }

        if (alongZ) {
            this.fill(writer, 0, y, at, 7, y + 2, at, PRISMARINE_BRICKS);
            this.fill(writer, 0, y + 1, at, 7, y + 1, at, PRISMARINE);
        } else {
            this.fill(writer, at, y, 0, at, y + 2, 7, PRISMARINE_BRICKS);
            this.fill(writer, at, y + 1, 0, at, y + 1, 7, PRISMARINE);
        }
    }
}

/** Two cells tall and two deep: a stairwell lit by a column of lanterns through its middle. */
class DoubleYZRoom extends MonumentRoomPiece {
    public constructor(orientation: Orientation, room: RoomDefinition, offset: RoomOffset) {
        super(orientation, room, 1, 2, 2, offset);
    }

    public place(writer: StructureWriter): void {
        const south = this.room;
        const north = south.connections.north!;
        const northUp = north.connections.up!;
        const southUp = south.connections.up!;

        if (this.isUpstairs) {
            this.defaultFloor(writer, 0, 8, north.hasOpening.down);
            this.defaultFloor(writer, 0, 0, south.hasOpening.down);
        }

        if (southUp.connections.up === undefined) this.fillWater(writer, 1, 8, 1, 6, 8, 7, PRISMARINE);
        if (northUp.connections.up === undefined) this.fillWater(writer, 1, 8, 8, 6, 8, 14, PRISMARINE);

        for (let y = 1; y <= 7; y++) {
            const banded = y === 2 || y === 6 ? PRISMARINE : PRISMARINE_BRICKS;
            this.fill(writer, 0, y, 0, 0, y, 15, banded);
            this.fill(writer, 7, y, 0, 7, y, 15, banded);
            this.fill(writer, 1, y, 0, 6, y, 0, banded);
            this.fill(writer, 1, y, 15, 6, y, 15, banded);
        }

        for (let y = 1; y <= 7; y++) {
            const core = y === 2 || y === 6 ? SEA_LANTERN : DARK_PRISMARINE;
            this.fill(writer, 3, y, 7, 4, y, 8, core);
        }

        if (south.hasOpening.south) this.flood(writer, 3, 1, 0, 4, 2, 0);
        if (south.hasOpening.east) this.flood(writer, 7, 1, 3, 7, 2, 4);
        if (south.hasOpening.west) this.flood(writer, 0, 1, 3, 0, 2, 4);
        if (north.hasOpening.north) this.flood(writer, 3, 1, 15, 4, 2, 15);
        if (north.hasOpening.west) this.flood(writer, 0, 1, 11, 0, 2, 12);
        if (north.hasOpening.east) this.flood(writer, 7, 1, 11, 7, 2, 12);
        if (southUp.hasOpening.south) this.flood(writer, 3, 5, 0, 4, 6, 0);

        if (southUp.hasOpening.east) {
            this.flood(writer, 7, 5, 3, 7, 6, 4);
            this.fill(writer, 5, 4, 2, 6, 4, 5, PRISMARINE_BRICKS);
            this.fill(writer, 6, 1, 2, 6, 3, 2, PRISMARINE_BRICKS);
            this.fill(writer, 6, 1, 5, 6, 3, 5, PRISMARINE_BRICKS);
        }

        if (southUp.hasOpening.west) {
            this.flood(writer, 0, 5, 3, 0, 6, 4);
            this.fill(writer, 1, 4, 2, 2, 4, 5, PRISMARINE_BRICKS);
            this.fill(writer, 1, 1, 2, 1, 3, 2, PRISMARINE_BRICKS);
            this.fill(writer, 1, 1, 5, 1, 3, 5, PRISMARINE_BRICKS);
        }

        if (northUp.hasOpening.north) this.flood(writer, 3, 5, 15, 4, 6, 15);

        if (northUp.hasOpening.west) {
            this.flood(writer, 0, 5, 11, 0, 6, 12);
            this.fill(writer, 1, 4, 10, 2, 4, 13, PRISMARINE_BRICKS);
            this.fill(writer, 1, 1, 10, 1, 3, 10, PRISMARINE_BRICKS);
            this.fill(writer, 1, 1, 13, 1, 3, 13, PRISMARINE_BRICKS);
        }

        if (northUp.hasOpening.east) {
            this.flood(writer, 7, 5, 11, 7, 6, 12);
            this.fill(writer, 5, 4, 10, 6, 4, 13, PRISMARINE_BRICKS);
            this.fill(writer, 6, 1, 10, 6, 3, 10, PRISMARINE_BRICKS);
            this.fill(writer, 6, 1, 13, 6, 3, 13, PRISMARINE_BRICKS);
        }
    }
}

/** Two cells deep: a corridor with a lantern on each side of its waist. */
class DoubleZRoom extends MonumentRoomPiece {
    public constructor(orientation: Orientation, room: RoomDefinition, offset: RoomOffset) {
        super(orientation, room, 1, 1, 2, offset);
    }

    public place(writer: StructureWriter): void {
        const south = this.room;
        const north = south.connections.north!;

        if (this.isUpstairs) {
            this.defaultFloor(writer, 0, 8, north.hasOpening.down);
            this.defaultFloor(writer, 0, 0, south.hasOpening.down);
        }

        if (south.connections.up === undefined) this.fillWater(writer, 1, 4, 1, 6, 4, 7, PRISMARINE);
        if (north.connections.up === undefined) this.fillWater(writer, 1, 4, 8, 6, 4, 14, PRISMARINE);

        this.fill(writer, 0, 3, 0, 0, 3, 15, PRISMARINE_BRICKS);
        this.fill(writer, 7, 3, 0, 7, 3, 15, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 0, 7, 3, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 15, 6, 3, 15, PRISMARINE_BRICKS);
        this.fill(writer, 0, 2, 0, 0, 2, 15, PRISMARINE);
        this.fill(writer, 7, 2, 0, 7, 2, 15, PRISMARINE);
        this.fill(writer, 1, 2, 0, 7, 2, 0, PRISMARINE);
        this.fill(writer, 1, 2, 15, 6, 2, 15, PRISMARINE);
        this.fill(writer, 0, 1, 0, 0, 1, 15, PRISMARINE_BRICKS);
        this.fill(writer, 7, 1, 0, 7, 1, 15, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 0, 7, 1, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 15, 6, 1, 15, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 1, 1, 1, 2, PRISMARINE_BRICKS);
        this.fill(writer, 6, 1, 1, 6, 1, 2, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 1, 1, 3, 2, PRISMARINE_BRICKS);
        this.fill(writer, 6, 3, 1, 6, 3, 2, PRISMARINE_BRICKS);
        this.fill(writer, 1, 1, 13, 1, 1, 14, PRISMARINE_BRICKS);
        this.fill(writer, 6, 1, 13, 6, 1, 14, PRISMARINE_BRICKS);
        this.fill(writer, 1, 3, 13, 1, 3, 14, PRISMARINE_BRICKS);
        this.fill(writer, 6, 3, 13, 6, 3, 14, PRISMARINE_BRICKS);
        this.fill(writer, 2, 1, 6, 2, 3, 6, PRISMARINE_BRICKS);
        this.fill(writer, 5, 1, 6, 5, 3, 6, PRISMARINE_BRICKS);
        this.fill(writer, 2, 1, 9, 2, 3, 9, PRISMARINE_BRICKS);
        this.fill(writer, 5, 1, 9, 5, 3, 9, PRISMARINE_BRICKS);
        this.fill(writer, 3, 2, 6, 4, 2, 6, PRISMARINE_BRICKS);
        this.fill(writer, 3, 2, 9, 4, 2, 9, PRISMARINE_BRICKS);
        this.fill(writer, 2, 2, 7, 2, 2, 8, PRISMARINE_BRICKS);
        this.fill(writer, 5, 2, 7, 5, 2, 8, PRISMARINE_BRICKS);
        this.put(writer, 2, 2, 5, SEA_LANTERN);
        this.put(writer, 5, 2, 5, SEA_LANTERN);
        this.put(writer, 2, 2, 10, SEA_LANTERN);
        this.put(writer, 5, 2, 10, SEA_LANTERN);
        this.put(writer, 2, 3, 5, PRISMARINE_BRICKS);
        this.put(writer, 5, 3, 5, PRISMARINE_BRICKS);
        this.put(writer, 2, 3, 10, PRISMARINE_BRICKS);
        this.put(writer, 5, 3, 10, PRISMARINE_BRICKS);

        if (south.hasOpening.south) this.flood(writer, 3, 1, 0, 4, 2, 0);
        if (south.hasOpening.east) this.flood(writer, 7, 1, 3, 7, 2, 4);
        if (south.hasOpening.west) this.flood(writer, 0, 1, 3, 0, 2, 4);
        if (north.hasOpening.north) this.flood(writer, 3, 1, 15, 4, 2, 15);
        if (north.hasOpening.west) this.flood(writer, 0, 1, 11, 0, 2, 12);
        if (north.hasOpening.east) this.flood(writer, 7, 1, 11, 7, 2, 12);
    }
}

/** The four lit posts standing clear of the first wing's walls. */
const WING_CORNER_POSTS: readonly (readonly [number, number])[] = [
    [4, 4],
    [18, 4],
    [4, 18],
    [18, 18]
];

/** One of the two halls that flank the entrance, each guarded by an elder guardian. */
class WingRoom extends MonumentPiece {
    private readonly design: number;

    public constructor(orientation: Orientation, boundingBox: BoundingBox, drawn: number) {
        super(boundingBox, orientation);
        this.design = drawn & 1;
    }

    public place(writer: StructureWriter): void {
        if (this.design === 0) this.placeOpenHall(writer);
        else this.placeColonnade(writer);
    }

    /** Java's first wing: a stepped roof over an open hall with four lit corner posts. */
    private placeOpenHall(writer: StructureWriter): void {
        for (let step = 0; step < 4; step++) {
            this.fill(writer, 10 - step, 3 - step, 20 - step, 12 + step, 3 - step, 20, PRISMARINE_BRICKS);
        }

        this.fill(writer, 7, 0, 6, 15, 0, 16, PRISMARINE_BRICKS);
        this.fill(writer, 6, 0, 6, 6, 3, 20, PRISMARINE_BRICKS);
        this.fill(writer, 16, 0, 6, 16, 3, 20, PRISMARINE_BRICKS);
        this.fill(writer, 7, 1, 7, 7, 1, 20, PRISMARINE_BRICKS);
        this.fill(writer, 15, 1, 7, 15, 1, 20, PRISMARINE_BRICKS);
        this.fill(writer, 7, 1, 6, 9, 3, 6, PRISMARINE_BRICKS);
        this.fill(writer, 13, 1, 6, 15, 3, 6, PRISMARINE_BRICKS);
        this.fill(writer, 8, 1, 7, 9, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 13, 1, 7, 14, 1, 7, PRISMARINE_BRICKS);
        this.fill(writer, 9, 0, 5, 13, 0, 5, PRISMARINE_BRICKS);
        this.fill(writer, 10, 0, 7, 12, 0, 7, DARK_PRISMARINE);
        this.fill(writer, 8, 0, 10, 8, 0, 12, DARK_PRISMARINE);
        this.fill(writer, 14, 0, 10, 14, 0, 12, DARK_PRISMARINE);

        for (let z = 18; z >= 7; z -= 3) {
            this.put(writer, 6, 3, z, SEA_LANTERN);
            this.put(writer, 16, 3, z, SEA_LANTERN);
        }

        this.put(writer, 10, 0, 10, SEA_LANTERN);
        this.put(writer, 12, 0, 10, SEA_LANTERN);
        this.put(writer, 10, 0, 12, SEA_LANTERN);
        this.put(writer, 12, 0, 12, SEA_LANTERN);
        this.put(writer, 8, 3, 6, SEA_LANTERN);
        this.put(writer, 14, 3, 6, SEA_LANTERN);

        for (const [x, z] of WING_CORNER_POSTS) {
            this.put(writer, x, 2, z, PRISMARINE_BRICKS);
            this.put(writer, x, 1, z, SEA_LANTERN);
            this.put(writer, x, 0, z, PRISMARINE_BRICKS);
        }

        this.put(writer, 9, 7, 20, PRISMARINE_BRICKS);
        this.put(writer, 13, 7, 20, PRISMARINE_BRICKS);
        this.fill(writer, 6, 0, 21, 7, 4, 21, PRISMARINE_BRICKS);
        this.fill(writer, 15, 0, 21, 16, 4, 21, PRISMARINE_BRICKS);
        this.elderGuardian(writer, 11, 2, 16);
    }

    /** Java's second wing: four lantern columns under a flat prismarine ceiling. */
    private placeColonnade(writer: StructureWriter): void {
        this.fill(writer, 9, 3, 18, 13, 3, 20, PRISMARINE_BRICKS);
        this.fill(writer, 9, 0, 18, 9, 2, 18, PRISMARINE_BRICKS);
        this.fill(writer, 13, 0, 18, 13, 2, 18, PRISMARINE_BRICKS);

        for (const x of [9, 13]) {
            this.put(writer, x, 6, 20, PRISMARINE_BRICKS);
            this.put(writer, x, 5, 20, SEA_LANTERN);
            this.put(writer, x, 4, 20, PRISMARINE_BRICKS);
        }

        this.fill(writer, 7, 3, 7, 15, 3, 14, PRISMARINE_BRICKS);

        for (const x of [10, 12]) {
            this.fill(writer, x, 0, 10, x, 6, 10, PRISMARINE_BRICKS);
            this.fill(writer, x, 0, 12, x, 6, 12, PRISMARINE_BRICKS);
            this.put(writer, x, 0, 10, SEA_LANTERN);
            this.put(writer, x, 0, 12, SEA_LANTERN);
            this.put(writer, x, 4, 10, SEA_LANTERN);
            this.put(writer, x, 4, 12, SEA_LANTERN);
        }

        for (const x of [8, 14]) {
            this.fill(writer, x, 0, 7, x, 2, 7, PRISMARINE_BRICKS);
            this.fill(writer, x, 0, 14, x, 2, 14, PRISMARINE_BRICKS);
        }

        this.fill(writer, 8, 3, 8, 8, 3, 13, DARK_PRISMARINE);
        this.fill(writer, 14, 3, 8, 14, 3, 13, DARK_PRISMARINE);
        this.elderGuardian(writer, 11, 5, 13);
    }
}

/** The room on the roof, where the third elder guardian waits. */
class Penthouse extends MonumentPiece {
    public constructor(orientation: Orientation, boundingBox: BoundingBox) {
        super(boundingBox, orientation);
    }

    public place(writer: StructureWriter): void {
        this.fill(writer, 2, -1, 2, 11, -1, 11, PRISMARINE_BRICKS);
        this.fill(writer, 0, -1, 0, 1, -1, 11, PRISMARINE);
        this.fill(writer, 12, -1, 0, 13, -1, 11, PRISMARINE);
        this.fill(writer, 2, -1, 0, 11, -1, 1, PRISMARINE);
        this.fill(writer, 2, -1, 12, 11, -1, 13, PRISMARINE);
        this.fill(writer, 0, 0, 0, 0, 0, 13, PRISMARINE_BRICKS);
        this.fill(writer, 13, 0, 0, 13, 0, 13, PRISMARINE_BRICKS);
        this.fill(writer, 1, 0, 0, 12, 0, 0, PRISMARINE_BRICKS);
        this.fill(writer, 1, 0, 13, 12, 0, 13, PRISMARINE_BRICKS);

        for (let along = 2; along <= 11; along += 3) {
            this.put(writer, 0, 0, along, SEA_LANTERN);
            this.put(writer, 13, 0, along, SEA_LANTERN);
            this.put(writer, along, 0, 0, SEA_LANTERN);
        }

        this.fill(writer, 2, 0, 3, 4, 0, 9, PRISMARINE_BRICKS);
        this.fill(writer, 9, 0, 3, 11, 0, 9, PRISMARINE_BRICKS);
        this.fill(writer, 4, 0, 9, 9, 0, 11, PRISMARINE_BRICKS);
        this.put(writer, 5, 0, 8, PRISMARINE_BRICKS);
        this.put(writer, 8, 0, 8, PRISMARINE_BRICKS);
        this.put(writer, 10, 0, 10, PRISMARINE_BRICKS);
        this.put(writer, 3, 0, 10, PRISMARINE_BRICKS);
        this.fill(writer, 3, 0, 3, 3, 0, 7, DARK_PRISMARINE);
        this.fill(writer, 10, 0, 3, 10, 0, 7, DARK_PRISMARINE);
        this.fill(writer, 6, 0, 10, 7, 0, 10, DARK_PRISMARINE);

        for (const x of [3, 10]) {
            for (let z = 2; z <= 8; z += 3) this.fill(writer, x, 0, z, x, 2, z, PRISMARINE_BRICKS);
        }

        this.fill(writer, 5, 0, 10, 5, 2, 10, PRISMARINE_BRICKS);
        this.fill(writer, 8, 0, 10, 8, 2, 10, PRISMARINE_BRICKS);
        this.fill(writer, 6, -1, 7, 7, -1, 8, DARK_PRISMARINE);
        this.flood(writer, 6, -1, 3, 7, -1, 4);
        this.elderGuardian(writer, 6, 1, 6);
    }
}

// ---------------------------------------------------------------------------
// The building itself
// ---------------------------------------------------------------------------

/** The y Java's `MonumentBuilding` sits at, whatever the sea floor under it does. */
const MONUMENT_Y = 39;

/** The extent Java passes to `makeBoundingBox`. */
const MONUMENT_SIZE = { width: 58, height: 23, depth: 58 } as const;

/** How far the monument reaches from the corner of the chunk it starts in. */
const MONUMENT_REACH = 29;

/**
 * The shell: the base slab, the two wings, the entrance, the roof and the three rings of wall.
 *
 * Java guards each of these with a `chunkIntersects` test and skips the ones that miss the chunk
 * being written. A piece here is not told which chunk it is being written into, so the writes go
 * out and the ones outside the chunk are dropped instead.
 */
class MonumentBuilding extends MonumentPiece {
    public constructor(orientation: Orientation, boundingBox: BoundingBox) {
        super(boundingBox, orientation);
    }

    public place(writer: StructureWriter): void {
        const seaTop = Math.max(writer.level.seaLevel, 64) - this.boundingBox.minY;
        this.flood(writer, 0, 0, 0, 58, seaTop, 58);
        this.placeWing(writer, false, 0);
        this.placeWing(writer, true, 33);
        this.placeEntranceArches(writer);
        this.placeEntranceWall(writer);
        this.placeRoof(writer);
        this.placeLowerWall(writer);
        this.placeMiddleWall(writer);
        this.placeUpperWall(writer);
        this.placePillars(writer);

        for (let ring = 0; ring < 5; ring++) {
            this.flood(writer, -1 - ring, ring * 2, -1 - ring, -1 - ring, 23, 58 + ring);
            this.flood(writer, 58 + ring, ring * 2, -1 - ring, 58 + ring, 23, 58 + ring);
            this.flood(writer, -ring, ring * 2, -1 - ring, 57 + ring, 23, -1 - ring);
            this.flood(writer, -ring, ring * 2, 58 + ring, 57 + ring, 23, 58 + ring);
        }
    }

    /** One of the two stepped halls flanking the entrance, mirrored for the right-hand one. */
    private placeWing(writer: StructureWriter, flipped: boolean, xOff: number): void {
        this.fill(writer, xOff, 0, 0, xOff + 24, 0, 20, PRISMARINE);
        this.flood(writer, xOff, 1, 0, xOff + 24, 10, 20);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, xOff + step, step + 1, step, xOff + step, step + 1, 20, PRISMARINE_BRICKS);
            this.fill(writer, xOff + step + 7, step + 5, step + 7, xOff + step + 7, step + 5, 20, PRISMARINE_BRICKS);
            this.fill(writer, xOff + 17 - step, step + 5, step + 7, xOff + 17 - step, step + 5, 20, PRISMARINE_BRICKS);
            this.fill(writer, xOff + 24 - step, step + 1, step, xOff + 24 - step, step + 1, 20, PRISMARINE_BRICKS);
            this.fill(writer, xOff + step + 1, step + 1, step, xOff + 23 - step, step + 1, step, PRISMARINE_BRICKS);
            this.fill(
                writer,
                xOff + step + 8,
                step + 5,
                step + 7,
                xOff + 16 - step,
                step + 5,
                step + 7,
                PRISMARINE_BRICKS
            );
        }

        this.fill(writer, xOff + 4, 4, 4, xOff + 6, 4, 20, PRISMARINE);
        this.fill(writer, xOff + 7, 4, 4, xOff + 17, 4, 6, PRISMARINE);
        this.fill(writer, xOff + 18, 4, 4, xOff + 20, 4, 20, PRISMARINE);
        this.fill(writer, xOff + 11, 8, 11, xOff + 13, 8, 20, PRISMARINE);
        this.put(writer, xOff + 12, 9, 12, PRISMARINE_BRICKS);
        this.put(writer, xOff + 12, 9, 15, PRISMARINE_BRICKS);
        this.put(writer, xOff + 12, 9, 18, PRISMARINE_BRICKS);

        const near = xOff + (flipped ? 19 : 5);
        const far = xOff + (flipped ? 5 : 19);
        for (let z = 20; z >= 5; z -= 3) this.put(writer, near, 5, z, PRISMARINE_BRICKS);
        for (let z = 19; z >= 7; z -= 3) this.put(writer, far, 5, z, PRISMARINE_BRICKS);
        for (let step = 0; step < 4; step++) {
            this.put(writer, flipped ? xOff + 24 - (17 - step * 3) : xOff + 17 - step * 3, 5, 5, PRISMARINE_BRICKS);
        }

        this.put(writer, far, 5, 5, PRISMARINE_BRICKS);
        this.fill(writer, xOff + 11, 1, 12, xOff + 13, 7, 12, PRISMARINE);
        this.fill(writer, xOff + 12, 1, 11, xOff + 12, 7, 13, PRISMARINE);
    }

    /** The four lit arches the entrance corridor runs under. */
    private placeEntranceArches(writer: StructureWriter): void {
        this.flood(writer, 25, 0, 0, 32, 8, 20);

        for (let arch = 0; arch < 4; arch++) {
            const z = 5 + arch * 4;
            this.fill(writer, 24, 2, z, 24, 4, z, PRISMARINE_BRICKS);
            this.fill(writer, 22, 4, z, 23, 4, z, PRISMARINE_BRICKS);
            this.put(writer, 25, 5, z, PRISMARINE_BRICKS);
            this.put(writer, 26, 6, z, PRISMARINE_BRICKS);
            this.put(writer, 26, 5, z, SEA_LANTERN);
            this.fill(writer, 33, 2, z, 33, 4, z, PRISMARINE_BRICKS);
            this.fill(writer, 34, 4, z, 35, 4, z, PRISMARINE_BRICKS);
            this.put(writer, 32, 5, z, PRISMARINE_BRICKS);
            this.put(writer, 31, 6, z, PRISMARINE_BRICKS);
            this.put(writer, 31, 5, z, SEA_LANTERN);
            this.fill(writer, 27, 6, z, 30, 6, z, PRISMARINE);
        }
    }

    /** The front wall, with the dark prismarine gable over the doorway. */
    private placeEntranceWall(writer: StructureWriter): void {
        this.fill(writer, 15, 0, 21, 42, 0, 21, PRISMARINE);
        this.flood(writer, 26, 1, 21, 31, 3, 21);
        this.fill(writer, 21, 12, 21, 36, 12, 21, PRISMARINE);
        this.fill(writer, 17, 11, 21, 40, 11, 21, PRISMARINE);
        this.fill(writer, 16, 10, 21, 41, 10, 21, PRISMARINE);
        this.fill(writer, 15, 7, 21, 42, 9, 21, PRISMARINE);
        this.fill(writer, 16, 6, 21, 41, 6, 21, PRISMARINE);
        this.fill(writer, 17, 5, 21, 40, 5, 21, PRISMARINE);
        this.fill(writer, 21, 4, 21, 36, 4, 21, PRISMARINE);
        this.fill(writer, 22, 3, 21, 26, 3, 21, PRISMARINE);
        this.fill(writer, 31, 3, 21, 35, 3, 21, PRISMARINE);
        this.fill(writer, 23, 2, 21, 25, 2, 21, PRISMARINE);
        this.fill(writer, 32, 2, 21, 34, 2, 21, PRISMARINE);
        this.fill(writer, 28, 4, 20, 29, 4, 21, PRISMARINE_BRICKS);
        this.put(writer, 27, 3, 21, PRISMARINE_BRICKS);
        this.put(writer, 30, 3, 21, PRISMARINE_BRICKS);
        this.put(writer, 26, 2, 21, PRISMARINE_BRICKS);
        this.put(writer, 31, 2, 21, PRISMARINE_BRICKS);
        this.put(writer, 25, 1, 21, PRISMARINE_BRICKS);
        this.put(writer, 32, 1, 21, PRISMARINE_BRICKS);

        for (let step = 0; step < 7; step++) {
            this.put(writer, 28 - step, 6 + step, 21, DARK_PRISMARINE);
            this.put(writer, 29 + step, 6 + step, 21, DARK_PRISMARINE);
        }

        for (let step = 0; step < 4; step++) {
            this.put(writer, 28 - step, 9 + step, 21, DARK_PRISMARINE);
            this.put(writer, 29 + step, 9 + step, 21, DARK_PRISMARINE);
        }

        this.put(writer, 28, 12, 21, DARK_PRISMARINE);
        this.put(writer, 29, 12, 21, DARK_PRISMARINE);

        for (let step = 0; step < 3; step++) {
            this.put(writer, 22 - step * 2, 8, 21, DARK_PRISMARINE);
            this.put(writer, 22 - step * 2, 9, 21, DARK_PRISMARINE);
            this.put(writer, 35 + step * 2, 8, 21, DARK_PRISMARINE);
            this.put(writer, 35 + step * 2, 9, 21, DARK_PRISMARINE);
        }

        this.flood(writer, 15, 13, 21, 42, 15, 21);
        this.flood(writer, 15, 1, 21, 15, 6, 21);
        this.flood(writer, 16, 1, 21, 16, 5, 21);
        this.flood(writer, 17, 1, 21, 20, 4, 21);
        this.flood(writer, 21, 1, 21, 21, 3, 21);
        this.flood(writer, 22, 1, 21, 22, 2, 21);
        this.flood(writer, 23, 1, 21, 24, 1, 21);
        this.flood(writer, 42, 1, 21, 42, 6, 21);
        this.flood(writer, 41, 1, 21, 41, 5, 21);
        this.flood(writer, 37, 1, 21, 40, 4, 21);
        this.flood(writer, 36, 1, 21, 36, 3, 21);
        this.flood(writer, 33, 1, 21, 34, 1, 21);
        this.flood(writer, 35, 1, 21, 35, 2, 21);
    }

    /** The stepped roof over the middle of the monument, lit at its four corners. */
    private placeRoof(writer: StructureWriter): void {
        this.fill(writer, 21, 0, 22, 36, 0, 36, PRISMARINE);
        this.flood(writer, 21, 1, 22, 36, 23, 36);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, 21 + step, 13 + step, 21 + step, 36 - step, 13 + step, 21 + step, PRISMARINE_BRICKS);
            this.fill(writer, 21 + step, 13 + step, 36 - step, 36 - step, 13 + step, 36 - step, PRISMARINE_BRICKS);
            this.fill(writer, 21 + step, 13 + step, 22 + step, 21 + step, 13 + step, 35 - step, PRISMARINE_BRICKS);
            this.fill(writer, 36 - step, 13 + step, 22 + step, 36 - step, 13 + step, 35 - step, PRISMARINE_BRICKS);
        }

        this.fill(writer, 25, 16, 25, 32, 16, 32, PRISMARINE);
        this.fill(writer, 25, 17, 25, 25, 19, 25, PRISMARINE_BRICKS);
        this.fill(writer, 32, 17, 25, 32, 19, 25, PRISMARINE_BRICKS);
        this.fill(writer, 25, 17, 32, 25, 19, 32, PRISMARINE_BRICKS);
        this.fill(writer, 32, 17, 32, 32, 19, 32, PRISMARINE_BRICKS);
        this.put(writer, 26, 20, 26, PRISMARINE_BRICKS);
        this.put(writer, 27, 21, 27, PRISMARINE_BRICKS);
        this.put(writer, 27, 20, 27, SEA_LANTERN);
        this.put(writer, 26, 20, 31, PRISMARINE_BRICKS);
        this.put(writer, 27, 21, 30, PRISMARINE_BRICKS);
        this.put(writer, 27, 20, 30, SEA_LANTERN);
        this.put(writer, 31, 20, 31, PRISMARINE_BRICKS);
        this.put(writer, 30, 21, 30, PRISMARINE_BRICKS);
        this.put(writer, 30, 20, 30, SEA_LANTERN);
        this.put(writer, 31, 20, 26, PRISMARINE_BRICKS);
        this.put(writer, 30, 21, 27, PRISMARINE_BRICKS);
        this.put(writer, 30, 20, 27, SEA_LANTERN);
        this.fill(writer, 28, 21, 27, 29, 21, 27, PRISMARINE);
        this.fill(writer, 27, 21, 28, 27, 21, 29, PRISMARINE);
        this.fill(writer, 28, 21, 30, 29, 21, 30, PRISMARINE);
        this.fill(writer, 30, 21, 28, 30, 21, 29, PRISMARINE);
    }

    /** The outermost terrace, which runs down both sides and across the back. */
    private placeLowerWall(writer: StructureWriter): void {
        this.fill(writer, 0, 0, 21, 6, 0, 57, PRISMARINE);
        this.flood(writer, 0, 1, 21, 6, 7, 57);
        this.fill(writer, 4, 4, 21, 6, 4, 53, PRISMARINE);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, step, step + 1, 21, step, step + 1, 57 - step, PRISMARINE_BRICKS);
        }

        for (let z = 23; z < 53; z += 3) this.put(writer, 5, 5, z, PRISMARINE_BRICKS);
        this.put(writer, 5, 5, 52, PRISMARINE_BRICKS);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, step, step + 1, 21, step, step + 1, 57 - step, PRISMARINE_BRICKS);
        }

        this.fill(writer, 4, 1, 52, 6, 3, 52, PRISMARINE);
        this.fill(writer, 5, 1, 51, 5, 3, 53, PRISMARINE);

        this.fill(writer, 51, 0, 21, 57, 0, 57, PRISMARINE);
        this.flood(writer, 51, 1, 21, 57, 7, 57);
        this.fill(writer, 51, 4, 21, 53, 4, 53, PRISMARINE);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, 57 - step, step + 1, 21, 57 - step, step + 1, 57 - step, PRISMARINE_BRICKS);
        }

        for (let z = 23; z < 53; z += 3) this.put(writer, 52, 5, z, PRISMARINE_BRICKS);
        this.put(writer, 52, 5, 52, PRISMARINE_BRICKS);
        this.fill(writer, 51, 1, 52, 53, 3, 52, PRISMARINE);
        this.fill(writer, 52, 1, 51, 52, 3, 53, PRISMARINE);

        this.fill(writer, 7, 0, 51, 50, 0, 57, PRISMARINE);
        this.flood(writer, 7, 1, 51, 50, 10, 57);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, step + 1, step + 1, 57 - step, 56 - step, step + 1, 57 - step, PRISMARINE_BRICKS);
        }
    }

    /** The second terrace, which carries the rows of brick dots along the back. */
    private placeMiddleWall(writer: StructureWriter): void {
        this.fill(writer, 7, 0, 21, 13, 0, 50, PRISMARINE);
        this.flood(writer, 7, 1, 21, 13, 10, 50);
        this.fill(writer, 11, 8, 21, 13, 8, 53, PRISMARINE);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, step + 7, step + 5, 21, step + 7, step + 5, 54, PRISMARINE_BRICKS);
        }

        for (let z = 21; z <= 45; z += 3) this.put(writer, 12, 9, z, PRISMARINE_BRICKS);

        this.fill(writer, 44, 0, 21, 50, 0, 50, PRISMARINE);
        this.flood(writer, 44, 1, 21, 50, 10, 50);
        this.fill(writer, 44, 8, 21, 46, 8, 53, PRISMARINE);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, 50 - step, step + 5, 21, 50 - step, step + 5, 54, PRISMARINE_BRICKS);
        }

        for (let z = 21; z <= 45; z += 3) this.put(writer, 45, 9, z, PRISMARINE_BRICKS);

        this.fill(writer, 14, 0, 44, 43, 0, 50, PRISMARINE);
        this.flood(writer, 14, 1, 44, 43, 10, 50);

        for (let x = 12; x <= 45; x += 3) {
            this.put(writer, x, 9, 45, PRISMARINE_BRICKS);
            this.put(writer, x, 9, 52, PRISMARINE_BRICKS);
            if (x !== 12 && x !== 18 && x !== 24 && x !== 33 && x !== 39 && x !== 45) continue;

            this.put(writer, x, 9, 47, PRISMARINE_BRICKS);
            this.put(writer, x, 9, 50, PRISMARINE_BRICKS);
            this.put(writer, x, 10, 45, PRISMARINE_BRICKS);
            this.put(writer, x, 10, 46, PRISMARINE_BRICKS);
            this.put(writer, x, 10, 51, PRISMARINE_BRICKS);
            this.put(writer, x, 10, 52, PRISMARINE_BRICKS);
            this.put(writer, x, 11, 47, PRISMARINE_BRICKS);
            this.put(writer, x, 11, 50, PRISMARINE_BRICKS);
            this.put(writer, x, 12, 48, PRISMARINE_BRICKS);
            this.put(writer, x, 12, 49, PRISMARINE_BRICKS);
        }

        for (let step = 0; step < 3; step++) {
            this.fill(writer, 8 + step, 5 + step, 54, 49 - step, 5 + step, 54, PRISMARINE);
        }

        this.fill(writer, 11, 8, 54, 46, 8, 54, PRISMARINE_BRICKS);
        this.fill(writer, 14, 8, 44, 43, 8, 53, PRISMARINE);
    }

    /** The innermost terrace, the one the roof rises out of. */
    private placeUpperWall(writer: StructureWriter): void {
        this.fill(writer, 14, 0, 21, 20, 0, 43, PRISMARINE);
        this.flood(writer, 14, 1, 22, 20, 14, 43);
        this.fill(writer, 18, 12, 22, 20, 12, 39, PRISMARINE);
        this.fill(writer, 18, 12, 21, 20, 12, 21, PRISMARINE_BRICKS);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, step + 14, step + 9, 21, step + 14, step + 9, 43 - step, PRISMARINE_BRICKS);
        }

        for (let z = 23; z <= 39; z += 3) this.put(writer, 19, 13, z, PRISMARINE_BRICKS);

        this.fill(writer, 37, 0, 21, 43, 0, 43, PRISMARINE);
        this.flood(writer, 37, 1, 22, 43, 14, 43);
        this.fill(writer, 37, 12, 22, 39, 12, 39, PRISMARINE);
        this.fill(writer, 37, 12, 21, 39, 12, 21, PRISMARINE_BRICKS);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, 43 - step, step + 9, 21, 43 - step, step + 9, 43 - step, PRISMARINE_BRICKS);
        }

        for (let z = 23; z <= 39; z += 3) this.put(writer, 38, 13, z, PRISMARINE_BRICKS);

        this.fill(writer, 21, 0, 37, 36, 0, 43, PRISMARINE);
        this.flood(writer, 21, 1, 37, 36, 14, 43);
        this.fill(writer, 21, 12, 37, 36, 12, 39, PRISMARINE);

        for (let step = 0; step < 4; step++) {
            this.fill(writer, 15 + step, step + 9, 43 - step, 42 - step, step + 9, 43 - step, PRISMARINE_BRICKS);
        }

        for (let x = 21; x <= 36; x += 3) this.put(writer, x, 13, 38, PRISMARINE_BRICKS);
    }

    /** The brick feet the monument stands on, each carried down to the sea floor. */
    private placePillars(writer: StructureWriter): void {
        for (let footX = 0; footX < 7; footX++) {
            let footZ = 0;

            while (footZ < 7) {
                if (footZ === 0 && footX === 3) footZ = 6;

                const baseX = footX * 9;
                const baseZ = footZ * 9;
                for (let x = 0; x < 4; x++) {
                    for (let z = 0; z < 4; z++) {
                        this.put(writer, baseX + x, 0, baseZ + z, PRISMARINE_BRICKS);
                        this.columnDown(writer, PRISMARINE_BRICKS, baseX + x, -1, baseZ + z);
                    }
                }

                if (footX !== 0 && footX !== 6) footZ += 6;
                else footZ++;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Laying the monument out
// ---------------------------------------------------------------------------

/** A room with a decoration pattern that is drawn once rather than once per chunk. */
interface DecoratedRoom {
    settleDecoration(random: RandomSource): void;
}

const isDecorated = (piece: MonumentPiece): piece is MonumentPiece & DecoratedRoom => 'settleDecoration' in piece;

/** The open doorway a room has in a direction, or undefined when there is none. */
const openTo = (room: RoomDefinition, direction: Direction): RoomDefinition | undefined =>
    room.hasOpening[direction] ? room.connections[direction] : undefined;

/**
 * Java's `MonumentRoomFitter` list, tried in Java's order.
 *
 * The first shape that fits claims the room and every other cell it covers, so the order decides
 * which rooms a monument ends up with.
 */
const fitRoom = (
    orientation: Orientation,
    room: RoomDefinition,
    random: RandomSource,
    offset: RoomOffset
): MonumentPiece => {
    const east = openTo(room, 'east');
    const north = openTo(room, 'north');
    const up = openTo(room, 'up');

    if (east !== undefined && !east.claimed && up !== undefined && !up.claimed) {
        const eastUp = openTo(east, 'up');
        if (eastUp !== undefined && !eastUp.claimed) {
            room.claimed = true;
            east.claimed = true;
            up.claimed = true;
            eastUp.claimed = true;
            return new DoubleXYRoom(orientation, room, offset);
        }
    }

    if (north !== undefined && !north.claimed && up !== undefined && !up.claimed) {
        const northUp = openTo(north, 'up');
        if (northUp !== undefined && !northUp.claimed) {
            room.claimed = true;
            north.claimed = true;
            up.claimed = true;
            northUp.claimed = true;
            return new DoubleYZRoom(orientation, room, offset);
        }
    }

    if (north !== undefined && !north.claimed) {
        room.claimed = true;
        north.claimed = true;
        return new DoubleZRoom(orientation, room, offset);
    }

    if (east !== undefined && !east.claimed) {
        room.claimed = true;
        east.claimed = true;
        return new DoubleXRoom(orientation, room, offset);
    }

    if (up !== undefined && !up.claimed) {
        room.claimed = true;
        up.claimed = true;
        return new DoubleYRoom(orientation, room, offset);
    }

    if (
        !room.hasOpening.west &&
        !room.hasOpening.east &&
        !room.hasOpening.north &&
        !room.hasOpening.south &&
        !room.hasOpening.up
    ) {
        room.claimed = true;
        return new SimpleTopRoom(orientation, room, offset);
    }

    room.claimed = true;
    return new SimpleRoom(orientation, room, offset, random.nextInt(3));
};

/** Java's `MonumentBuilding` constructor: the shell, the rooms it holds and the three it hangs on. */
const layOutMonument = (
    random: RandomSource,
    west: number,
    north: number,
    orientation: Orientation
): StructurePiece[] => {
    const box = orientedBox(
        west,
        MONUMENT_Y,
        north,
        orientation,
        MONUMENT_SIZE.width,
        MONUMENT_SIZE.height,
        MONUMENT_SIZE.depth
    );
    const graph = buildRoomGraph(random);
    const offset = worldPos(box, orientation, 9, 0, 22);

    graph.source.claimed = true;
    const rooms: MonumentPiece[] = [
        new EntryRoom(orientation, graph.source, offset),
        new CoreRoom(orientation, graph.core, offset)
    ];

    for (const room of graph.rooms) {
        if (room.claimed || room.isSpecial) continue;

        rooms.push(fitRoom(orientation, room, random, offset));
    }

    const leftWing = boxBetween(worldPos(box, orientation, 1, 1, 1), worldPos(box, orientation, 23, 8, 21));
    const rightWing = boxBetween(worldPos(box, orientation, 34, 1, 1), worldPos(box, orientation, 56, 8, 21));
    const penthouse = boxBetween(worldPos(box, orientation, 22, 13, 22), worldPos(box, orientation, 35, 17, 35));
    const drawn = random.nextInt();

    rooms.push(
        new WingRoom(orientation, leftWing, drawn),
        new WingRoom(orientation, rightWing, drawn + 1),
        new Penthouse(orientation, penthouse)
    );

    // Java draws these inside `postProcess`, once per chunk the room covers. Drawing them here,
    // after every draw Java makes during layout, leaves Java's floor plan alone and gives a room
    // on a chunk border one pattern rather than two.
    for (const room of rooms) {
        if (isDecorated(room)) room.settleDecoration(random);
    }

    return [new MonumentBuilding(orientation, box), ...rooms];
};

/**
 * Lays out an ocean monument: one prismarine building, at a fixed y 39 on the deep ocean floor.
 *
 * @returns The building and its rooms, with the generation point Java takes in the middle of the
 *   start chunk, one block into the sea floor.
 */
export const buildOceanMonument: StructureBuilder = (context): StructureLayout | undefined => {
    const x = context.chunkX * 16 + 8;
    const z = context.chunkZ * 16 + 8;

    return {
        // Java's `getFirstOccupiedHeight` is the heightmap minus one, which is the topmost block
        // of the sea floor rather than the water above it.
        origin: { x, y: context.level.baseHeight(x, z, 'OCEAN_FLOOR_WG') - 1, z },
        pieces: () => {
            const orientation = HORIZONTAL_DIRECTIONS[context.random.nextInt(HORIZONTAL_DIRECTIONS.length)]!;
            return layOutMonument(
                context.random,
                context.chunkX * 16 - MONUMENT_REACH,
                context.chunkZ * 16 - MONUMENT_REACH,
                orientation
            );
        }
    };
};
