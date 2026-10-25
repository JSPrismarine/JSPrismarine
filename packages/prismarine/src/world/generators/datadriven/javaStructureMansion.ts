/**
 * The woodland mansion, which Java draws as a floor plan before it builds anything.
 *
 * `MansionGrid` fills an 11 by 11 grid of 8 block cells. Corridors grow west from the entrance,
 * the cells beside them become rooms, neighboring room cells merge into rooms of one, two or four
 * cells, each room is given one door onto a corridor, and one two-cell room is promoted to a
 * staircase up to a small third floor. `MansionPiecePlacer` then walks that plan and names a
 * template for the entrance, every outer wall segment and corner, the roof, the corridor floors
 * and their carpets, the inner walls and doors, and the rooms themselves.
 *
 * Each of those names is one `.nbt` file stamped at a position under a rotation and a mirror,
 * which is what {@link TemplatePiece} already does, so what is left here is the floor plan and
 * the arithmetic that turns a grid cell into a block position.
 *
 * Two things Java does are left out. Its `afterPlace` drops cobblestone pillars from the mansion
 * down to the first solid block under every column it covers, which is terrain repair rather than
 * a piece and has no seam here. Its generation point is also refused early when no allowed biome
 * could exist anywhere in the column; this server makes the one biome check every structure makes,
 * at the generation point, which is the weaker of the two tests.
 */
import type { Mirror, Placement, RandomSource, Rotation, TemplatePosition } from '@jsprismarine/structures';

import { rotationOf } from './javaStructureJigsaw';
import type { StructureBuildContext, StructureBuilder, StructureLayout } from './javaStructureStarts';
import type { DataMarker } from './javaStructureTemplatePiece';
import { TemplatePiece, pivotedCorner } from './javaStructureTemplatePiece';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';

/** Where in its chunk a mansion starts, Java's `START_OFFSET_IN_CHUNK`. */
const START_OFFSET_IN_CHUNK = 7;

/** The lowest terrain a mansion accepts. Below it the site is refused and nothing is laid out. */
const LOWEST_SURFACE = 60;

/** The floor plan is 11 cells square, and one cell is one 8 block room. */
const GRID_SIZE = 11;

/** The cell the entrance hall sits on, which every other cell is measured from. */
const ENTRANCE_X = 7;
const ENTRANCE_Y = 4;

/** What one cell of a floor plan holds. */
const CLEAR = 0;
const CORRIDOR = 1;
const ROOM = 2;
const START_ROOM = 3;
/** A value Java's `isHouse` accepts and its generator never writes. */
const TEST_ROOM = 4;
const BLOCKED = 5;

/** How large the room a cell belongs to is. */
const ROOM_1x1 = 0x10000;
const ROOM_1x2 = 0x20000;
const ROOM_2x2 = 0x40000;
const ROOM_TYPE_MASK = 0xf0000;

/** The cell a room is measured from, which is also the cell its door is cut into. */
const ROOM_ORIGIN = 0x100000;
/** The room has a door onto a corridor rather than being reachable only from below. */
const ROOM_DOOR = 0x200000;
/** The room holds the staircase to the third floor. */
const ROOM_STAIRS = 0x400000;
/** The cell is corridor as far as the walls and carpets are concerned. */
const ROOM_CORRIDOR = 0x800000;
/** Which room of a floor a cell belongs to. */
const ROOM_ID_MASK = 0xffff;

/** The first room identifier `identifyRooms` hands out. */
const FIRST_ROOM_ID = 10;

/** Java's four horizontal directions, in `Direction.Plane.HORIZONTAL` order and clockwise. */
const HORIZONTAL = ['north', 'east', 'south', 'west'] as const;

/** One of Java's horizontal directions. */
type Horizontal = (typeof HORIZONTAL)[number];

/** The way into a room, or `up` for one reached only through the floor below it. */
type DoorDirection = Horizontal | 'up';

/** How far one step in a direction moves. */
const STEP: Readonly<Record<Horizontal, { readonly x: number; readonly z: number }>> = {
    north: { x: 0, z: -1 },
    east: { x: 1, z: 0 },
    south: { x: 0, z: 1 },
    west: { x: -1, z: 0 }
};

/** Java's `Direction.from2DDataValue`, which is the order a corridor draws its next heading in. */
const BY_2D_DATA = ['south', 'west', 'north', 'east'] as const;

/** Java's quarter turns, in the order `Rotation.values()` lists them. */
const ROTATIONS = ['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'] as const;

const quarterTurnsOf = (rotation: Rotation): number => ROTATIONS.indexOf(rotation);

/** Java's `Rotation.getRotated`: one turn followed by another. */
const rotated = (rotation: Rotation, by: Rotation): Rotation =>
    rotationOf(quarterTurnsOf(rotation) + quarterTurnsOf(by));

const clockwiseOf = (facing: Horizontal): Horizontal => HORIZONTAL[(HORIZONTAL.indexOf(facing) + 1) % 4]!;

const counterClockwiseOf = (facing: Horizontal): Horizontal => HORIZONTAL[(HORIZONTAL.indexOf(facing) + 3) % 4]!;

const oppositeOf = (facing: Horizontal): Horizontal => HORIZONTAL[(HORIZONTAL.indexOf(facing) + 2) % 4]!;

/** Java's `Rotation.rotate(Direction)`: where a direction points once the mansion is turned. */
const turned = (facing: Horizontal, rotation: Rotation): Horizontal =>
    HORIZONTAL[(HORIZONTAL.indexOf(facing) + quarterTurnsOf(rotation)) % 4]!;

/** A block position. Every helper here returns a new one, because Java's `BlockPos` is immutable. */
interface Spot {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

const relative = (spot: Spot, facing: Horizontal, distance: number): Spot => ({
    x: spot.x + STEP[facing].x * distance,
    y: spot.y,
    z: spot.z + STEP[facing].z * distance
});

const above = (spot: Spot, distance: number): Spot => ({ x: spot.x, y: spot.y + distance, z: spot.z });

/** Java's `SimpleGrid`: a rectangle of numbers that answers one fixed value outside itself. */
class SimpleGrid {
    private readonly cells: Int32Array;

    public constructor(
        public readonly width: number,
        public readonly height: number,
        private readonly outside: number
    ) {
        this.cells = new Int32Array(width * height);
    }

    /** The cell's value, or the outside value for a position off the grid. */
    public get(x: number, y: number): number {
        return x >= 0 && x < this.width && y >= 0 && y < this.height ? this.cells[x * this.height + y]! : this.outside;
    }

    /** Writes one cell, ignoring a position off the grid. */
    public set(x: number, y: number, value: number): void {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.cells[x * this.height + y] = value;
    }

    /** Writes every cell of an inclusive rectangle, which may run off the grid. */
    public fill(x0: number, y0: number, x1: number, y1: number, value: number): void {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) this.set(x, y, value);
        }
    }

    /** Writes one cell only when it currently holds an expected value. */
    public setIf(x: number, y: number, expected: number, value: number): void {
        if (this.get(x, y) === expected) this.set(x, y, value);
    }

    /** Whether any of the four cells around a position holds a value. */
    public edgesTo(x: number, y: number, value: number): boolean {
        return (
            this.get(x - 1, y) === value ||
            this.get(x + 1, y) === value ||
            this.get(x, y + 1) === value ||
            this.get(x, y - 1) === value
        );
    }
}

/** Whether a cell is part of the building rather than ground around it. */
const isHouse = (grid: SimpleGrid, x: number, y: number): boolean => {
    const value = grid.get(x, y);
    return value === CORRIDOR || value === ROOM || value === START_ROOM || value === TEST_ROOM;
};

/** Java's `Util.shuffle`, which draws one index per entry from the end of the list down. */
const shuffle = <T>(values: T[], random: RandomSource): void => {
    for (let size = values.length; size > 1; size--) {
        const index = random.nextInt(size);
        const last = values[size - 1]!;
        values[size - 1] = values[index]!;
        values[index] = last;
    }
};

/** Which floor a room grid belongs to. */
type FloorIndex = 0 | 1 | 2;

/** The three floors, in the order they are laid out. */
const FLOORS = [0, 1, 2] as const;

/**
 * The mansion's floor plan: which cells are corridor, which are room, and which room each cell
 * belongs to on each of the three floors.
 */
class MansionGrid {
    /** The plan the first two floors share. */
    public readonly baseGrid = new SimpleGrid(GRID_SIZE, GRID_SIZE, BLOCKED);

    /** The much smaller plan of the third floor, which is mostly blocked. */
    public readonly thirdFloorGrid = new SimpleGrid(GRID_SIZE, GRID_SIZE, BLOCKED);

    /** The rooms of each floor: a size, an identifier and the door flags, packed into one number. */
    public readonly floorRooms: readonly [SimpleGrid, SimpleGrid, SimpleGrid] = [
        new SimpleGrid(GRID_SIZE, GRID_SIZE, BLOCKED),
        new SimpleGrid(GRID_SIZE, GRID_SIZE, BLOCKED),
        new SimpleGrid(GRID_SIZE, GRID_SIZE, BLOCKED)
    ];

    public constructor(private readonly random: RandomSource) {
        const base = this.baseGrid;
        base.fill(ENTRANCE_X, ENTRANCE_Y, ENTRANCE_X + 1, ENTRANCE_Y + 1, START_ROOM);
        base.fill(ENTRANCE_X - 1, ENTRANCE_Y, ENTRANCE_X - 1, ENTRANCE_Y + 1, ROOM);
        base.fill(ENTRANCE_X + 2, ENTRANCE_Y - 2, ENTRANCE_X + 3, ENTRANCE_Y + 3, BLOCKED);
        base.fill(ENTRANCE_X + 1, ENTRANCE_Y - 2, ENTRANCE_X + 1, ENTRANCE_Y - 1, CORRIDOR);
        base.fill(ENTRANCE_X + 1, ENTRANCE_Y + 2, ENTRANCE_X + 1, ENTRANCE_Y + 3, CORRIDOR);
        base.set(ENTRANCE_X - 1, ENTRANCE_Y - 1, CORRIDOR);
        base.set(ENTRANCE_X - 1, ENTRANCE_Y + 2, CORRIDOR);
        base.fill(0, 0, GRID_SIZE, 1, BLOCKED);
        base.fill(0, 9, GRID_SIZE, GRID_SIZE, BLOCKED);

        this.recursiveCorridor(base, ENTRANCE_X, ENTRANCE_Y - 2, 'west', 6);
        this.recursiveCorridor(base, ENTRANCE_X, ENTRANCE_Y + 3, 'west', 6);
        this.recursiveCorridor(base, ENTRANCE_X - 2, ENTRANCE_Y - 1, 'west', 3);
        this.recursiveCorridor(base, ENTRANCE_X - 2, ENTRANCE_Y + 2, 'west', 3);
        this.settleEdges(base);

        // The two lower floors share a plan but draw their rooms separately, so the same cell is
        // a bedroom downstairs and a library upstairs.
        this.identifyRooms(base, this.floorRooms[0]);
        this.identifyRooms(base, this.floorRooms[1]);
        this.floorRooms[0].fill(ENTRANCE_X + 1, ENTRANCE_Y, ENTRANCE_X + 1, ENTRANCE_Y + 1, ROOM_CORRIDOR);
        this.floorRooms[1].fill(ENTRANCE_X + 1, ENTRANCE_Y, ENTRANCE_X + 1, ENTRANCE_Y + 1, ROOM_CORRIDOR);

        this.setupThirdFloor();
        this.identifyRooms(this.thirdFloorGrid, this.floorRooms[2]);
    }

    /** Whether a cell belongs to one room of one floor. */
    public isRoomId(x: number, y: number, floor: FloorIndex, roomId: number): boolean {
        return (this.floorRooms[floor].get(x, y) & ROOM_ID_MASK) === roomId;
    }

    /** Which way the other half of a 1x2 room lies, or undefined when the room has no other half. */
    public roomDirectionOf(x: number, y: number, floor: FloorIndex, roomId: number): Horizontal | undefined {
        return HORIZONTAL.find((facing) => this.isRoomId(x + STEP[facing].x, y + STEP[facing].z, floor, roomId));
    }

    /**
     * Grows one corridor and the rooms that hang off it.
     *
     * The corridor runs one cell at a time and turns at most once per cell, trying eight headings
     * before it gives up and ends. East is drawn against a coin flip, which is what keeps the
     * corridors running away from the entrance rather than back into it.
     */
    private recursiveCorridor(grid: SimpleGrid, x: number, y: number, heading: Horizontal, depth: number): void {
        if (depth <= 0) return;

        grid.set(x, y, CORRIDOR);
        grid.setIf(x + STEP[heading].x, y + STEP[heading].z, CLEAR, CORRIDOR);

        for (let attempt = 0; attempt < 8; attempt++) {
            const next = BY_2D_DATA[this.random.nextInt(4)]!;
            if (next === oppositeOf(heading) || (next === 'east' && this.random.nextBoolean())) continue;

            const aheadX = x + STEP[heading].x;
            const aheadY = y + STEP[heading].z;
            if (grid.get(aheadX + STEP[next].x, aheadY + STEP[next].z) !== CLEAR) continue;
            if (grid.get(aheadX + STEP[next].x * 2, aheadY + STEP[next].z * 2) !== CLEAR) continue;

            this.recursiveCorridor(grid, aheadX + STEP[next].x, aheadY + STEP[next].z, next, depth - 1);
            break;
        }

        const right = clockwiseOf(heading);
        const left = counterClockwiseOf(heading);
        grid.setIf(x + STEP[right].x, y + STEP[right].z, CLEAR, ROOM);
        grid.setIf(x + STEP[left].x, y + STEP[left].z, CLEAR, ROOM);
        grid.setIf(x + STEP[heading].x + STEP[right].x, y + STEP[heading].z + STEP[right].z, CLEAR, ROOM);
        grid.setIf(x + STEP[heading].x + STEP[left].x, y + STEP[heading].z + STEP[left].z, CLEAR, ROOM);
        grid.setIf(x + STEP[heading].x * 2, y + STEP[heading].z * 2, CLEAR, ROOM);
        grid.setIf(x + STEP[right].x * 2, y + STEP[right].z * 2, CLEAR, ROOM);
        grid.setIf(x + STEP[left].x * 2, y + STEP[left].z * 2, CLEAR, ROOM);
    }

    /**
     * Fills the dents in the plan's outline, so the outer wall has no one-cell notches.
     *
     * @returns Whether a cell changed, which is why the caller runs it until it reports nothing.
     */
    private cleanEdges(grid: SimpleGrid): boolean {
        let touched = false;
        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
                if (grid.get(x, y) !== CLEAR) continue;

                const sides =
                    Number(isHouse(grid, x + 1, y)) +
                    Number(isHouse(grid, x - 1, y)) +
                    Number(isHouse(grid, x, y + 1)) +
                    Number(isHouse(grid, x, y - 1));
                if (sides >= 3) {
                    grid.set(x, y, ROOM);
                    touched = true;
                    continue;
                }
                if (sides !== 2) continue;

                const corners =
                    Number(isHouse(grid, x + 1, y + 1)) +
                    Number(isHouse(grid, x - 1, y + 1)) +
                    Number(isHouse(grid, x + 1, y - 1)) +
                    Number(isHouse(grid, x - 1, y - 1));
                if (corners > 1) continue;

                grid.set(x, y, ROOM);
                touched = true;
            }
        }

        return touched;
    }

    /**
     * Picks the 1x2 room the staircase rises through and draws the third floor around it.
     *
     * The third floor is the two cells of that room plus a short corridor off it. When there is
     * no room to take, or nowhere for the corridor to go, the mansion keeps two floors.
     */
    private setupThirdFloor(): void {
        const second = this.floorRooms[1];
        const blockAll = (): void => this.thirdFloorGrid.fill(0, 0, GRID_SIZE, GRID_SIZE, BLOCKED);

        const candidates: { x: number; y: number }[] = [];
        for (let y = 0; y < this.thirdFloorGrid.height; y++) {
            for (let x = 0; x < this.thirdFloorGrid.width; x++) {
                const room = second.get(x, y);
                if ((room & ROOM_TYPE_MASK) !== ROOM_1x2 || (room & ROOM_DOOR) !== ROOM_DOOR) continue;

                candidates.push({ x, y });
            }
        }
        if (candidates.length === 0) {
            blockAll();
            return;
        }

        const chosen = candidates[this.random.nextInt(candidates.length)]!;
        const room = second.get(chosen.x, chosen.y);
        second.set(chosen.x, chosen.y, room | ROOM_STAIRS);

        const roomDirection = this.roomDirectionOf(chosen.x, chosen.y, 1, room & ROOM_ID_MASK);
        if (roomDirection === undefined) {
            // A 1x2 room always has a second cell carrying its identifier, so this never happens.
            blockAll();
            return;
        }

        const landingX = chosen.x + STEP[roomDirection].x;
        const landingY = chosen.y + STEP[roomDirection].z;
        for (let y = 0; y < this.thirdFloorGrid.height; y++) {
            for (let x = 0; x < this.thirdFloorGrid.width; x++) {
                if (!isHouse(this.baseGrid, x, y)) {
                    this.thirdFloorGrid.set(x, y, BLOCKED);
                    continue;
                }
                if (x === chosen.x && y === chosen.y) {
                    this.thirdFloorGrid.set(x, y, START_ROOM);
                    continue;
                }
                if (x !== landingX || y !== landingY) continue;

                this.thirdFloorGrid.set(x, y, START_ROOM);
                this.floorRooms[2].set(x, y, ROOM_CORRIDOR);
            }
        }

        const ways = HORIZONTAL.filter(
            (facing) => this.thirdFloorGrid.get(landingX + STEP[facing].x, landingY + STEP[facing].z) === CLEAR
        );
        if (ways.length === 0) {
            blockAll();
            second.set(chosen.x, chosen.y, room);
            return;
        }

        const corridor = ways[this.random.nextInt(ways.length)]!;
        this.recursiveCorridor(
            this.thirdFloorGrid,
            landingX + STEP[corridor].x,
            landingY + STEP[corridor].z,
            corridor,
            4
        );
        this.settleEdges(this.thirdFloorGrid);
    }

    /** Fills dents until the outline has none left. */
    private settleEdges(grid: SimpleGrid): void {
        let touched = true;
        while (touched) touched = this.cleanEdges(grid);
    }

    /**
     * Merges a plan's room cells into rooms and cuts one door into each.
     *
     * The cells are shuffled first, so which cells pair up is a draw rather than a scan order. A
     * room takes the largest shape that fits, then tries its four corners for one that edges a
     * corridor; a room that reaches no corridor keeps its origin cell and gets no door, which is
     * what makes the mansion's sealed rooms.
     */
    private identifyRooms(plan: SimpleGrid, rooms: SimpleGrid): void {
        const cells: { x: number; y: number }[] = [];
        for (let y = 0; y < plan.height; y++) {
            for (let x = 0; x < plan.width; x++) {
                if (plan.get(x, y) === ROOM) cells.push({ x, y });
            }
        }
        shuffle(cells, this.random);

        let roomId = FIRST_ROOM_ID;
        for (const cell of cells) {
            const { x, y } = cell;
            if (rooms.get(x, y) !== CLEAR) continue;

            let x0 = x;
            let x1 = x;
            let y0 = y;
            let y1 = y;
            let type = ROOM_1x1;
            const free = (dx: number, dy: number): boolean =>
                rooms.get(x + dx, y + dy) === CLEAR && plan.get(x + dx, y + dy) === ROOM;

            if (free(1, 0) && free(0, 1) && free(1, 1)) {
                x1++;
                y1++;
                type = ROOM_2x2;
            } else if (free(-1, 0) && free(0, 1) && free(-1, 1)) {
                x0--;
                y1++;
                type = ROOM_2x2;
            } else if (free(-1, 0) && free(0, -1) && free(-1, -1)) {
                x0--;
                y0--;
                type = ROOM_2x2;
            } else if (free(1, 0)) {
                x1++;
                type = ROOM_1x2;
            } else if (free(0, 1)) {
                y1++;
                type = ROOM_1x2;
            } else if (free(-1, 0)) {
                x0--;
                type = ROOM_1x2;
            } else if (free(0, -1)) {
                y0--;
                type = ROOM_1x2;
            }

            let doorX = this.random.nextBoolean() ? x0 : x1;
            let doorY = this.random.nextBoolean() ? y0 : y1;
            let doorFlag = ROOM_DOOR;
            const flipX = (): number => (doorX === x0 ? x1 : x0);
            const flipY = (): number => (doorY === y0 ? y1 : y0);
            if (!plan.edgesTo(doorX, doorY, CORRIDOR)) {
                doorX = flipX();
                doorY = flipY();
                if (!plan.edgesTo(doorX, doorY, CORRIDOR)) {
                    doorY = flipY();
                    if (!plan.edgesTo(doorX, doorY, CORRIDOR)) {
                        doorX = flipX();
                        doorY = flipY();
                        if (!plan.edgesTo(doorX, doorY, CORRIDOR)) {
                            doorFlag = 0;
                            doorX = x0;
                            doorY = y0;
                        }
                    }
                }
            }

            for (let cellY = y0; cellY <= y1; cellY++) {
                for (let cellX = x0; cellX <= x1; cellX++) {
                    const door = cellX === doorX && cellY === doorY ? ROOM_ORIGIN | doorFlag : 0;
                    rooms.set(cellX, cellY, door | type | roomId);
                }
            }
            roomId++;
        }
    }
}

/** Which templates a floor draws its rooms from. */
interface RoomCollection {
    /** A room filling one cell. */
    oneByOne(random: RandomSource): string;
    /** A one-cell room with no door, reached through the floor below it. */
    oneByOneSecret(random: RandomSource): string;
    /** A two-cell room entered from one of its long sides. */
    oneByTwoSide(random: RandomSource, stairs: boolean): string;
    /** A two-cell room entered from one of its ends. */
    oneByTwoFront(random: RandomSource, stairs: boolean): string;
    /** A two-cell room with no door. */
    oneByTwoSecret(random: RandomSource): string;
    /** A room filling four cells. */
    twoByTwo(random: RandomSource): string;
    /** A four-cell room with no door. */
    twoByTwoSecret(random: RandomSource): string;
}

const numbered = (prefix: string, count: number, random: RandomSource): string =>
    `${prefix}${random.nextInt(count) + 1}`;

/** The ground floor, which has a list of its own. */
const FIRST_FLOOR_ROOMS: RoomCollection = {
    oneByOne: (random) => numbered('1x1_a', 5, random),
    oneByOneSecret: (random) => numbered('1x1_as', 4, random),
    oneByTwoSide: (random) => numbered('1x2_a', 9, random),
    oneByTwoFront: (random) => numbered('1x2_b', 5, random),
    oneByTwoSecret: (random) => numbered('1x2_s', 2, random),
    twoByTwo: (random) => numbered('2x2_a', 4, random),
    twoByTwoSecret: () => '2x2_s1'
};

/**
 * The second and third floors, which Java draws from one list.
 *
 * A staircase room is named rather than drawn, so the floor holding the staircase makes one draw
 * fewer and every room after it on that floor differs from what a plain room would have given.
 */
const UPPER_FLOOR_ROOMS: RoomCollection = {
    oneByOne: (random) => numbered('1x1_b', 5, random),
    oneByOneSecret: (random) => numbered('1x1_as', 4, random),
    oneByTwoSide: (random, stairs) => (stairs ? '1x2_c_stairs' : numbered('1x2_c', 4, random)),
    oneByTwoFront: (random, stairs) => (stairs ? '1x2_d_stairs' : numbered('1x2_d', 5, random)),
    // One template and a draw that always answers it, which Java keeps and the stream feels.
    oneByTwoSecret: (random) => numbered('1x2_se', 1, random),
    twoByTwo: (random) => numbered('2x2_b', 5, random),
    twoByTwoSecret: () => '2x2_s1'
};

const COLLECTIONS: Readonly<Record<FloorIndex, RoomCollection>> = {
    0: FIRST_FLOOR_ROOMS,
    1: UPPER_FLOOR_ROOMS,
    2: UPPER_FLOOR_ROOMS
};

/** One template the floor plan calls for, before the template store turns it into a piece. */
interface MansionPiece {
    /** The template's name under `minecraft:woodland_mansion/`. */
    readonly template: string;
    /** Where the template's own zero block lands, which is what Java's pivot of zero means. */
    readonly spot: Spot;
    readonly rotation: Rotation;
    readonly mirror?: Mirror;
}

/** Java's `PlacementData`: where the wall walk has reached and which wall it is placing. */
interface WallWalk {
    spot: Spot;
    rotation: Rotation;
    readonly wallType: string;
}

/**
 * Walks a floor plan and names the templates it is built from.
 *
 * Nothing here reads a template or touches the world. The result is a list of names and
 * positions, which is what makes the whole layout a pure function of the plan.
 */
class MansionPlacer {
    private readonly pieces: MansionPiece[] = [];

    /** The cell the mansion's own origin sits on, which every position is measured from. */
    private startX = 0;
    private startY = 0;

    public constructor(private readonly random: RandomSource) {}

    /** Names every template of one mansion, in Java's order. */
    public createMansion(origin: Spot, rotation: Rotation, mansion: MansionGrid): readonly MansionPiece[] {
        const base = mansion.baseGrid;
        const third = mansion.thirdFloorGrid;

        const ground: WallWalk = { spot: origin, rotation, wallType: 'wall_flat' };
        this.entrance(ground);
        const upper: WallWalk = { spot: above(ground.spot, 8), rotation: ground.rotation, wallType: 'wall_window' };

        this.startX = ENTRANCE_X + 1;
        this.startY = ENTRANCE_Y + 1;
        const endX = ENTRANCE_X + 1;
        const endY = ENTRANCE_Y;
        this.traverseOuterWalls(ground, base, 'south', this.startX, this.startY, endX, endY);
        this.traverseOuterWalls(upper, base, 'south', this.startX, this.startY, endX, endY);

        // The third floor covers a few cells rather than the whole plan, so its wall is walked
        // from the first of those cells the scan finds.
        const top: WallWalk = { spot: above(ground.spot, 19), rotation: ground.rotation, wallType: 'wall_window' };
        let started = false;
        for (let y = 0; y < third.height && !started; y++) {
            for (let x = third.width - 1; x >= 0 && !started; x--) {
                if (!isHouse(third, x, y)) continue;

                top.spot = this.cellSpot(top.spot, rotation, x, y);
                this.traverseWallPiece(top);
                this.traverseOuterWalls(top, third, 'south', x, y, x, y);
                started = true;
            }
        }

        this.createRoof(above(origin, 16), rotation, base, third);
        this.createRoof(above(origin, 27), rotation, third, undefined);

        for (const floor of FLOORS) {
            const floorOrigin = above(origin, 8 * floor + (floor === 2 ? 3 : 0));
            const plan = floor === 2 ? third : base;
            this.createCarpets(floorOrigin, rotation, plan, mansion.floorRooms[floor], floor);
            this.createRooms(floorOrigin, rotation, mansion, plan, floor);
        }

        return this.pieces;
    }

    /** Where a grid cell's own corner lands, measured from a floor's origin. */
    private cellSpot(origin: Spot, rotation: Rotation, x: number, y: number): Spot {
        const south = relative(origin, turned('south', rotation), 8 + (y - this.startY) * 8);
        return relative(south, turned('east', rotation), (x - this.startX) * 8);
    }

    private add(template: string, spot: Spot, rotation: Rotation, mirror?: Mirror): void {
        this.pieces.push({ template, spot, rotation, ...(mirror === undefined ? {} : { mirror }) });
    }

    private entrance(data: WallWalk): void {
        this.add('entrance', relative(data.spot, turned('west', data.rotation), 9), data.rotation);
        data.spot = relative(data.spot, turned('south', data.rotation), 16);
    }

    private traverseWallPiece(data: WallWalk): void {
        this.add(data.wallType, relative(data.spot, turned('east', data.rotation), 7), data.rotation);
        data.spot = relative(data.spot, turned('south', data.rotation), 8);
    }

    private traverseTurn(data: WallWalk): void {
        data.spot = relative(data.spot, turned('south', data.rotation), -1);
        this.add('wall_corner', data.spot, data.rotation);
        data.spot = relative(data.spot, turned('south', data.rotation), -7);
        data.spot = relative(data.spot, turned('west', data.rotation), -6);
        data.rotation = rotated(data.rotation, 'clockwise_90');
    }

    private traverseInnerTurn(data: WallWalk): void {
        data.spot = relative(data.spot, turned('south', data.rotation), 6);
        data.spot = relative(data.spot, turned('east', data.rotation), 8);
        data.rotation = rotated(data.rotation, 'counterclockwise_90');
    }

    /**
     * Walks the outline of a plan once, laying a wall along every cell edge that faces outward.
     *
     * The walk keeps a heading and turns rather than scanning, so the wall, its corners and its
     * inner corners come out in one pass around the building.
     */
    private traverseOuterWalls(
        data: WallWalk,
        grid: SimpleGrid,
        heading: Horizontal,
        startX: number,
        startY: number,
        endX: number,
        endY: number
    ): void {
        let gridX = startX;
        let gridY = startY;
        let facing = heading;
        const firstFacing = heading;

        do {
            const ahead = STEP[facing];
            if (!isHouse(grid, gridX + ahead.x, gridY + ahead.z)) {
                this.traverseTurn(data);
                facing = clockwiseOf(facing);
                if (gridX === endX && gridY === endY && firstFacing === facing) continue;

                this.traverseWallPiece(data);
                continue;
            }

            const left = STEP[counterClockwiseOf(facing)];
            if (isHouse(grid, gridX + ahead.x + left.x, gridY + ahead.z + left.z)) {
                this.traverseInnerTurn(data);
                gridX += ahead.x;
                gridY += ahead.z;
                facing = counterClockwiseOf(facing);
                continue;
            }

            gridX += ahead.x;
            gridY += ahead.z;
            if (gridX === endX && gridY === endY && firstFacing === facing) continue;

            this.traverseWallPiece(data);
        } while (gridX !== endX || gridY !== endY || firstFacing !== facing);
    }

    /**
     * Roofs a plan.
     *
     * A cell the floor above stands on gets no roof. It gets the low wall that runs around the
     * terrace beside that floor instead.
     */
    private createRoof(origin: Spot, rotation: Rotation, grid: SimpleGrid, aboveGrid: SimpleGrid | undefined): void {
        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
                if (!isHouse(grid, x, y) || this.isCovered(aboveGrid, x, y)) continue;

                this.roofTop(this.cellSpot(origin, rotation, x, y), rotation, grid, x, y);
            }
        }

        if (aboveGrid !== undefined) {
            for (let y = 0; y < grid.height; y++) {
                for (let x = 0; x < grid.width; x++) {
                    if (!isHouse(grid, x, y) || !isHouse(aboveGrid, x, y)) continue;

                    this.terraceWall(this.cellSpot(origin, rotation, x, y), rotation, grid, x, y);
                }
            }
        }

        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
                if (!isHouse(grid, x, y) || this.isCovered(aboveGrid, x, y)) continue;

                this.roofCorners(this.cellSpot(origin, rotation, x, y), rotation, grid, x, y);
            }
        }
    }

    private isCovered(aboveGrid: SimpleGrid | undefined, x: number, y: number): boolean {
        return aboveGrid !== undefined && isHouse(aboveGrid, x, y);
    }

    /** The roof over one cell, with a gable on every side the building ends at. */
    private roofTop(spot: Spot, rotation: Rotation, grid: SimpleGrid, x: number, y: number): void {
        const east = turned('east', rotation);
        const south = turned('south', rotation);
        const west = turned('west', rotation);

        this.add('roof', above(spot, 3), rotation);
        if (!isHouse(grid, x + 1, y)) {
            this.add('roof_front', relative(spot, east, 6), rotation);
        }
        if (!isHouse(grid, x - 1, y)) {
            this.add('roof_front', relative(spot, south, 7), rotated(rotation, 'clockwise_180'));
        }
        if (!isHouse(grid, x, y - 1)) {
            this.add('roof_front', relative(spot, west, 1), rotated(rotation, 'counterclockwise_90'));
        }
        if (!isHouse(grid, x, y + 1)) {
            this.add('roof_front', relative(relative(spot, east, 6), south, 6), rotated(rotation, 'clockwise_90'));
        }
    }

    /** The low wall and its corners around a cell the floor above stands on. */
    private terraceWall(spot: Spot, rotation: Rotation, grid: SimpleGrid, x: number, y: number): void {
        const east = turned('east', rotation);
        const south = turned('south', rotation);
        const west = turned('west', rotation);
        const north = turned('north', rotation);

        if (!isHouse(grid, x + 1, y)) {
            this.add('small_wall', relative(spot, east, 7), rotation);
        }
        if (!isHouse(grid, x - 1, y)) {
            this.add('small_wall', relative(relative(spot, west, 1), south, 6), rotated(rotation, 'clockwise_180'));
        }
        if (!isHouse(grid, x, y - 1)) {
            this.add('small_wall', relative(spot, north, 1), rotated(rotation, 'counterclockwise_90'));
        }
        if (!isHouse(grid, x, y + 1)) {
            this.add('small_wall', relative(relative(spot, east, 6), south, 7), rotated(rotation, 'clockwise_90'));
        }

        if (!isHouse(grid, x + 1, y)) {
            if (!isHouse(grid, x, y - 1)) {
                this.add('small_wall_corner', relative(relative(spot, east, 7), north, 2), rotation);
            }
            if (!isHouse(grid, x, y + 1)) {
                this.add(
                    'small_wall_corner',
                    relative(relative(spot, east, 8), south, 7),
                    rotated(rotation, 'clockwise_90')
                );
            }
        }
        if (isHouse(grid, x - 1, y)) return;

        if (!isHouse(grid, x, y - 1)) {
            this.add(
                'small_wall_corner',
                relative(relative(spot, west, 2), north, 1),
                rotated(rotation, 'counterclockwise_90')
            );
        }
        if (!isHouse(grid, x, y + 1)) {
            this.add(
                'small_wall_corner',
                relative(relative(spot, west, 1), south, 8),
                rotated(rotation, 'clockwise_180')
            );
        }
    }

    /** Where two roof edges meet: an outer corner at a turn and an inner one at a notch. */
    private roofCorners(spot: Spot, rotation: Rotation, grid: SimpleGrid, x: number, y: number): void {
        const east = turned('east', rotation);
        const south = turned('south', rotation);
        const west = turned('west', rotation);
        const north = turned('north', rotation);

        if (!isHouse(grid, x + 1, y)) {
            const edge = relative(spot, east, 6);
            if (!isHouse(grid, x, y + 1)) {
                this.add('roof_corner', relative(edge, south, 6), rotation);
            } else if (isHouse(grid, x + 1, y + 1)) {
                this.add('roof_inner_corner', relative(edge, south, 5), rotation);
            }

            if (!isHouse(grid, x, y - 1)) {
                this.add('roof_corner', edge, rotated(rotation, 'counterclockwise_90'));
            } else if (isHouse(grid, x + 1, y - 1)) {
                this.add(
                    'roof_inner_corner',
                    relative(relative(spot, east, 9), north, 2),
                    rotated(rotation, 'clockwise_90')
                );
            }
        }
        if (isHouse(grid, x - 1, y)) return;

        const edge = spot;
        if (!isHouse(grid, x, y + 1)) {
            this.add('roof_corner', relative(edge, south, 6), rotated(rotation, 'clockwise_90'));
        } else if (isHouse(grid, x - 1, y + 1)) {
            this.add(
                'roof_inner_corner',
                relative(relative(edge, south, 8), west, 3),
                rotated(rotation, 'counterclockwise_90')
            );
        }

        if (!isHouse(grid, x, y - 1)) {
            this.add('roof_corner', edge, rotated(rotation, 'clockwise_180'));
            return;
        }
        if (!isHouse(grid, x - 1, y - 1)) return;

        this.add('roof_inner_corner', relative(edge, south, 1), rotated(rotation, 'clockwise_180'));
    }

    /** The floor of every corridor cell, and a carpet on each side a corridor continues on. */
    private createCarpets(
        origin: Spot,
        rotation: Rotation,
        plan: SimpleGrid,
        rooms: SimpleGrid,
        floor: FloorIndex
    ): void {
        const east = turned('east', rotation);
        const south = turned('south', rotation);
        const west = turned('west', rotation);
        const north = turned('north', rotation);
        const southCarpet = floor === 0 ? 'carpet_south_1' : 'carpet_south_2';
        const westCarpet = floor === 0 ? 'carpet_west_1' : 'carpet_west_2';
        const joins = (x: number, y: number): boolean =>
            plan.get(x, y) === CORRIDOR || (rooms.get(x, y) & ROOM_CORRIDOR) === ROOM_CORRIDOR;

        for (let y = 0; y < plan.height; y++) {
            for (let x = 0; x < plan.width; x++) {
                if (plan.get(x, y) !== CORRIDOR) continue;

                const spot = this.cellSpot(origin, rotation, x, y);
                this.add('corridor_floor', spot, rotation);
                if (joins(x, y - 1)) {
                    this.add('carpet_north', above(relative(spot, east, 1), 1), rotation);
                }
                if (joins(x + 1, y)) {
                    this.add('carpet_east', above(relative(relative(spot, south, 1), east, 5), 1), rotation);
                }
                if (joins(x, y + 1)) {
                    this.add(southCarpet, relative(relative(spot, south, 5), west, 1), rotation);
                }
                if (joins(x - 1, y)) {
                    this.add(westCarpet, relative(relative(spot, west, 1), north, 1), rotation);
                }
            }
        }
    }

    /** The inner walls, the doors cut into them and the room behind each door. */
    private createRooms(
        origin: Spot,
        rotation: Rotation,
        mansion: MansionGrid,
        plan: SimpleGrid,
        floor: FloorIndex
    ): void {
        const rooms = mansion.floorRooms[floor];
        const collection = COLLECTIONS[floor];
        const wallPiece = floor === 0 ? 'indoors_wall_1' : 'indoors_wall_2';
        const doorPiece = floor === 0 ? 'indoors_door_1' : 'indoors_door_2';

        for (let y = 0; y < plan.height; y++) {
            for (let x = 0; x < plan.width; x++) {
                const onStairs = floor === 2 && plan.get(x, y) === START_ROOM;
                if (plan.get(x, y) !== ROOM && !onStairs) continue;

                const room = rooms.get(x, y);
                const type = room & ROOM_TYPE_MASK;
                const roomId = room & ROOM_ID_MASK;
                // The cell the staircase arrives in is open to the room beside it rather than
                // walled off from it.
                const landing = onStairs && (room & ROOM_CORRIDOR) === ROOM_CORRIDOR;

                const ways =
                    (room & ROOM_DOOR) === ROOM_DOOR
                        ? HORIZONTAL.filter((facing) => plan.get(x + STEP[facing].x, y + STEP[facing].z) === CORRIDOR)
                        : [];
                const doorDirection: DoorDirection | undefined =
                    ways.length > 0
                        ? ways[this.random.nextInt(ways.length)]!
                        : (room & ROOM_ORIGIN) === ROOM_ORIGIN
                          ? 'up'
                          : undefined;

                const roomSpot = relative(this.cellSpot(origin, rotation, x, y), turned('east', rotation), -1);
                if (isHouse(plan, x - 1, y) && !mansion.isRoomId(x - 1, y, floor, roomId)) {
                    this.add(doorDirection === 'west' ? doorPiece : wallPiece, roomSpot, rotation);
                }
                if (plan.get(x + 1, y) === CORRIDOR && !landing) {
                    this.add(
                        doorDirection === 'east' ? doorPiece : wallPiece,
                        relative(roomSpot, turned('east', rotation), 8),
                        rotation
                    );
                }
                if (isHouse(plan, x, y + 1) && !mansion.isRoomId(x, y + 1, floor, roomId)) {
                    const spot = relative(
                        relative(roomSpot, turned('south', rotation), 7),
                        turned('east', rotation),
                        7
                    );
                    this.add(
                        doorDirection === 'south' ? doorPiece : wallPiece,
                        spot,
                        rotated(rotation, 'clockwise_90')
                    );
                }
                if (plan.get(x, y - 1) === CORRIDOR && !landing) {
                    const spot = relative(
                        relative(roomSpot, turned('north', rotation), 1),
                        turned('east', rotation),
                        7
                    );
                    this.add(
                        doorDirection === 'north' ? doorPiece : wallPiece,
                        spot,
                        rotated(rotation, 'clockwise_90')
                    );
                }

                if (type === ROOM_1x1) {
                    this.addRoom1x1(roomSpot, rotation, doorDirection, collection);
                    continue;
                }
                if (type === ROOM_1x2 && doorDirection !== undefined) {
                    const roomDirection = mansion.roomDirectionOf(x, y, floor, roomId);
                    const stairs = (room & ROOM_STAIRS) === ROOM_STAIRS;
                    if (roomDirection !== undefined) {
                        this.addRoom1x2(roomSpot, rotation, roomDirection, doorDirection, collection, stairs);
                    }
                    continue;
                }
                if (type === ROOM_2x2 && doorDirection !== undefined && doorDirection !== 'up') {
                    const clockwise = clockwiseOf(doorDirection);
                    const roomDirection = mansion.isRoomId(x + STEP[clockwise].x, y + STEP[clockwise].z, floor, roomId)
                        ? clockwise
                        : oppositeOf(clockwise);
                    this.addRoom2x2(roomSpot, rotation, roomDirection, doorDirection, collection);
                    continue;
                }
                if (type !== ROOM_2x2 || doorDirection !== 'up') continue;

                this.add(
                    collection.twoByTwoSecret(this.random),
                    relative(roomSpot, turned('east', rotation), 1),
                    rotation
                );
            }
        }
    }

    /** A one-cell room, turned so its door faces the corridor it opens onto. */
    private addRoom1x1(
        roomSpot: Spot,
        rotation: Rotation,
        doorDirection: DoorDirection | undefined,
        collection: RoomCollection
    ): void {
        let pieceRotation: Rotation = 'none';
        let template = collection.oneByOne(this.random);
        if (doorDirection !== 'east') {
            if (doorDirection === 'north') pieceRotation = rotated(pieceRotation, 'counterclockwise_90');
            else if (doorDirection === 'west') pieceRotation = rotated(pieceRotation, 'clockwise_180');
            else if (doorDirection === 'south') pieceRotation = rotated(pieceRotation, 'clockwise_90');
            else template = collection.oneByOneSecret(this.random);
        }

        // Java turns the room about the cell rather than about the template, so the corner it
        // lands on moves with the turn.
        const corner = zeroPositionWithTransform({ x: 1, y: 0, z: 0 }, pieceRotation, 7, 7);
        const turnedCorner = turnedOffset(corner, rotation);
        this.add(
            template,
            { x: roomSpot.x + turnedCorner.x, y: roomSpot.y, z: roomSpot.z + turnedCorner.z },
            rotated(pieceRotation, rotation)
        );
    }

    /** A two-cell room, in one of the twelve ways its door and its length can lie. */
    private addRoom1x2(
        roomSpot: Spot,
        rotation: Rotation,
        roomDirection: Horizontal,
        doorDirection: DoorDirection,
        collection: RoomCollection,
        stairs: boolean
    ): void {
        const east = turned('east', rotation);
        const south = turned('south', rotation);
        const west = turned('west', rotation);
        const north = turned('north', rotation);
        const side = (): string => collection.oneByTwoSide(this.random, stairs);
        const front = (): string => collection.oneByTwoFront(this.random, stairs);

        if (doorDirection === 'east' && roomDirection === 'south') {
            this.add(side(), relative(roomSpot, east, 1), rotation);
        } else if (doorDirection === 'east' && roomDirection === 'north') {
            this.add(side(), relative(relative(roomSpot, east, 1), south, 6), rotation, 'left_right');
        } else if (doorDirection === 'west' && roomDirection === 'north') {
            this.add(side(), relative(relative(roomSpot, east, 7), south, 6), rotated(rotation, 'clockwise_180'));
        } else if (doorDirection === 'west' && roomDirection === 'south') {
            this.add(side(), relative(roomSpot, east, 7), rotation, 'front_back');
        } else if (doorDirection === 'south' && roomDirection === 'east') {
            this.add(side(), relative(roomSpot, east, 1), rotated(rotation, 'clockwise_90'), 'left_right');
        } else if (doorDirection === 'south' && roomDirection === 'west') {
            this.add(side(), relative(roomSpot, east, 7), rotated(rotation, 'clockwise_90'));
        } else if (doorDirection === 'north' && roomDirection === 'west') {
            this.add(
                side(),
                relative(relative(roomSpot, east, 7), south, 6),
                rotated(rotation, 'clockwise_90'),
                'front_back'
            );
        } else if (doorDirection === 'north' && roomDirection === 'east') {
            this.add(side(), relative(relative(roomSpot, east, 1), south, 6), rotated(rotation, 'counterclockwise_90'));
        } else if (doorDirection === 'south' && roomDirection === 'north') {
            this.add(front(), relative(relative(roomSpot, east, 1), north, 8), rotation);
        } else if (doorDirection === 'north' && roomDirection === 'south') {
            this.add(front(), relative(relative(roomSpot, east, 7), south, 14), rotated(rotation, 'clockwise_180'));
        } else if (doorDirection === 'west' && roomDirection === 'east') {
            this.add(front(), relative(roomSpot, east, 15), rotated(rotation, 'clockwise_90'));
        } else if (doorDirection === 'east' && roomDirection === 'west') {
            this.add(
                front(),
                relative(relative(roomSpot, west, 7), south, 6),
                rotated(rotation, 'counterclockwise_90')
            );
        } else if (doorDirection === 'up' && roomDirection === 'east') {
            this.add(
                collection.oneByTwoSecret(this.random),
                relative(roomSpot, east, 15),
                rotated(rotation, 'clockwise_90')
            );
        } else if (doorDirection === 'up' && roomDirection === 'south') {
            this.add(collection.oneByTwoSecret(this.random), relative(roomSpot, east, 1), rotation);
        }
    }

    /** A four-cell room, turned and mirrored so its door lands on the corridor. */
    private addRoom2x2(
        roomSpot: Spot,
        rotation: Rotation,
        roomDirection: Horizontal,
        doorDirection: Horizontal,
        collection: RoomCollection
    ): void {
        const corner = ROOM_2x2_CORNERS[`${doorDirection}-${roomDirection}`] ?? { east: 0, south: 0 };
        const spot = relative(
            relative(roomSpot, turned('east', rotation), corner.east),
            turned('south', rotation),
            corner.south
        );
        this.add(collection.twoByTwo(this.random), spot, rotated(rotation, corner.turn ?? 'none'), corner.mirror);
    }
}

/** Where a four-cell room lands for each way its door and its second cell can lie. */
const ROOM_2x2_CORNERS: Readonly<Record<string, { east: number; south: number; turn?: Rotation; mirror?: Mirror }>> = {
    'east-south': { east: -7, south: 0 },
    'east-north': { east: -7, south: 6, mirror: 'left_right' },
    'north-east': { east: 1, south: 14, turn: 'counterclockwise_90' },
    'north-west': { east: 7, south: 14, turn: 'counterclockwise_90', mirror: 'left_right' },
    'south-west': { east: 7, south: -8, turn: 'clockwise_90' },
    'south-east': { east: 1, south: -8, turn: 'clockwise_90', mirror: 'left_right' },
    'west-north': { east: 15, south: 6, turn: 'clockwise_180' },
    'west-south': { east: 15, south: 0, mirror: 'front_back' }
};

/**
 * Java's `StructureTemplate.getZeroPositionWithTransform` for an unmirrored template.
 *
 * A turned template keeps its own extent, so the block that was its zero moves to whichever
 * corner the turn put it in. The mansion only ever asks about the 7 by 7 room cell.
 */
const zeroPositionWithTransform = (spot: Spot, rotation: Rotation, sizeX: number, sizeZ: number): Spot => {
    const lastX = sizeX - 1;
    const lastZ = sizeZ - 1;
    switch (rotation) {
        case 'clockwise_90':
            return { x: spot.x + lastZ, y: spot.y, z: spot.z };
        case 'clockwise_180':
            return { x: spot.x + lastX, y: spot.y, z: spot.z + lastZ };
        case 'counterclockwise_90':
            return { x: spot.x, y: spot.y, z: spot.z + lastX };
        default:
            return spot;
    }
};

/** Java's `BlockPos.rotate`: an offset turned about the origin. */
const turnedOffset = (spot: Spot, rotation: Rotation): Spot => {
    switch (rotation) {
        case 'clockwise_90':
            return { x: -spot.z, y: spot.y, z: spot.x };
        case 'clockwise_180':
            return { x: -spot.x, y: spot.y, z: -spot.z };
        case 'counterclockwise_90':
            return { x: spot.z, y: spot.y, z: -spot.x };
        default:
            return spot;
    }
};

/** Which way a chest faces, by the name of the marker that stands in for it. */
const CHEST_FACINGS: Readonly<Record<string, Horizontal>> = {
    ChestWest: 'west',
    ChestEast: 'east',
    ChestSouth: 'south',
    ChestNorth: 'north'
};

/** The one table every chest in a mansion rolls. */
const MANSION_LOOT = 'minecraft:chests/woodland_mansion';

/** The illager a marker stands for. */
const MARKER_MOBS: Readonly<Record<string, string>> = {
    Mage: 'minecraft:evoker',
    Warrior: 'minecraft:vindicator'
};

/** The marker that stands for a small flock of allays rather than one mob. */
const ALLAY_MARKER = 'Group of Allays';

/** What a marker leaves behind once the mob it named is standing on the spot. */
const AIR = { name: 'minecraft:air', properties: {} };

/**
 * Fills in one data marker: a chest with its loot table, or the mob that stands on the spot.
 *
 * Java reads only the rotation for a chest's facing, so a chest in a mirrored room faces the way
 * the unmirrored room would have faced. The allay count comes from the world's own random in
 * Java and from the chunk's structure random here, which is the stream a piece is placed from.
 */
const fillMarker = (marker: DataMarker, writer: StructureWriter, random: RandomSource, rotation: Rotation): void => {
    if (marker.value.startsWith('Chest')) {
        if (writer.blockAt(marker.x, marker.y, marker.z).name === 'minecraft:chest') return;

        const facing = turned(CHEST_FACINGS[marker.value] ?? 'north', rotation);
        const chest = { name: 'minecraft:chest', properties: { facing } };
        if (!writer.setBlock(marker.x, marker.y, marker.z, chest)) return;

        writer.setBlockEntity(marker.x, marker.y, marker.z, { id: 'minecraft:chest', lootTable: MANSION_LOOT });
        return;
    }

    const mob = MARKER_MOBS[marker.value];
    const count = mob !== undefined ? 1 : marker.value === ALLAY_MARKER ? random.nextInt(3) + 1 : 0;
    if (count === 0) return;

    const type = mob ?? 'minecraft:allay';
    // The middle of the marker's block, which is where Java stands the mob it replaces it with.
    for (let index = 0; index < count; index++) {
        writer.spawnEntity(type, marker.x + 0.5, marker.y, marker.z + 0.5, 0);
    }
    writer.setBlock(marker.x, marker.y, marker.z, AIR);
};

/** Java's rotation pivot for a mansion piece, which it leaves at the template's own zero block. */
const NO_PIVOT: TemplatePosition = [0, 0, 0];

/** Turns one named template into the piece a chunk is written from. */
const templatePieceOf = (part: MansionPiece, context: StructureBuildContext): StructurePiece[] => {
    const template = `minecraft:woodland_mansion/${part.template}`;
    const base = context.templates.template(template);
    // A template this server does not carry drops its own piece, which is what
    // `TemplatePiece.isPresent` reports, rather than failing the whole mansion.
    if (base === undefined) return [];

    const placement: Placement = {
        rotation: part.rotation,
        ...(part.mirror === undefined ? {} : { mirror: part.mirror })
    };
    const piece = new TemplatePiece({
        store: context.templates,
        template,
        position: pivotedCorner([part.spot.x, part.spot.y, part.spot.z], base.size, placement, NO_PIVOT),
        placement,
        onDataMarker: (marker, writer, random) => fillMarker(marker, writer, random, part.rotation)
    });

    return piece.isPresent ? [piece] : [];
};

/**
 * The lowest of the four corners of Java's 5 by 5 probe, which is the height a mansion sits at.
 *
 * The probe reaches away from the start position in the direction the mansion was turned, so it
 * samples the ground the building will actually stand on.
 */
const lowestCornerHeight = (level: StructureLevel, x: number, z: number, rotation: Rotation): number => {
    const offsetX = rotation === 'clockwise_90' || rotation === 'clockwise_180' ? -5 : 5;
    const offsetZ = rotation === 'clockwise_180' || rotation === 'counterclockwise_90' ? -5 : 5;
    const surfaceAt = (cornerX: number, cornerZ: number): number =>
        level.baseHeight(cornerX, cornerZ, 'WORLD_SURFACE_WG') - 1;

    return Math.min(
        surfaceAt(x, z),
        surfaceAt(x, z + offsetZ),
        surfaceAt(x + offsetX, z),
        surfaceAt(x + offsetX, z + offsetZ)
    );
};

/**
 * Lays out a woodland mansion: a floor plan drawn from the structure's random, and the hundred
 * or so templates that plan is built out of.
 *
 * The whole mansion sits at one height, taken from the terrain under its start, so no piece
 * settles while it is written and the building cannot end up sheared along a chunk border.
 * A site whose terrain is below y 60 is refused, which is how Java keeps mansions out of swamps
 * and off beaches.
 */
export const buildWoodlandMansion: StructureBuilder = (context): StructureLayout | undefined => {
    const x = context.chunkX * 16 + START_OFFSET_IN_CHUNK;
    const z = context.chunkZ * 16 + START_OFFSET_IN_CHUNK;
    const rotation = rotationOf(context.random.nextInt(4));
    const y = lowestCornerHeight(context.level, x, z, rotation);
    if (y < LOWEST_SURFACE) return undefined;

    return {
        origin: { x, y, z },
        pieces: () => {
            const plan = new MansionGrid(context.random);
            const named = new MansionPlacer(context.random).createMansion({ x, y, z }, rotation, plan);
            return named.flatMap((part) => templatePieceOf(part, context));
        }
    };
};
