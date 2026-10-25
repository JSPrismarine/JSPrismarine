/**
 * The stronghold, the one structure whose rooms Java still grows piece by piece in code.
 *
 * `StrongholdStructure.findGenerationPoint` starts a stairwell at the chunk's corner facing a
 * drawn direction, then grows a graph: each room opens one to five doors, each door draws a room
 * type from a weighted table, and a type that cannot fit, has hit its limit or was drawn last
 * time is passed over. A door that reaches an existing room gets a short filler corridor instead.
 * The whole graph is then dropped to its final height in one move, and the attempt is thrown away
 * and redrawn from the next seed unless a portal room came out of it.
 *
 * Two things about the graph are worth knowing before reading the piece classes. A piece writes
 * its blocks in its own local frame, where x runs across the corridor, y runs up and z runs the
 * way the piece was entered; {@link StrongholdPiece.worldX} and its siblings turn that into world
 * coordinates. And Java turns each written block state by a mirror and a rotation that do not
 * match that coordinate turn for z-facing blocks, which is why some stronghold torches hang on
 * the wall behind them. {@link orientedState} reproduces the turn Java applies rather than the
 * one the coordinates imply.
 *
 * The stronghold reads no terrain. Java settles it from the sea level and the dimension floor
 * alone, inside the layout, so the whole of it lands at one height and every chunk it covers
 * agrees about that height without sampling a single column.
 *
 * One deliberate difference from Java. Java's retry loop has no bound, so a seed that never
 * produced a portal room would hang the server. {@link MAX_ATTEMPTS} stops it, and the structure
 * generates nowhere.
 *
 * This lays the stronghold out at the chunk it is given. Java's concentric rings, which pull a
 * stronghold onto the nearest preferred biome, belong to the placement that chooses the chunk.
 */
import type { BlockState } from '@jsprismarine/features';
import { DIRECTION_STEPS, HORIZONTAL_DIRECTIONS, oppositeDirection } from '@jsprismarine/features';
import type { BoundingBox, RandomSource } from '@jsprismarine/structures';
import { createLegacyRandom, largeFeatureSeed } from '@jsprismarine/structures';

import type { StructureBuilder, StructureLayout } from './javaStructureStarts';
import type { StructurePiece, StructureWriter } from './javaStructureWorld';
import { movedBox, unionOf } from './javaStructureWorld';

/** The way a piece was entered, which is the only orientation a stronghold piece has. */
type Facing = (typeof HORIZONTAL_DIRECTIONS)[number];

/** The y Java builds the graph at before dropping it, Java's `MAGIC_START_Y`. */
const START_Y = 64;

/** How deep the graph may grow before a door stops producing rooms. */
const MAX_DEPTH = 50;

/** How far from the start a door may sit before it stops producing rooms. */
const MAX_SPREAD = 112;

/** The lowest y a new room's box may start at, Java's `isOkBox`. */
const LOWEST_Y = 10;

/** How far below sea level the top of the finished stronghold is pulled. */
const SEA_LEVEL_CLEARANCE = 10;

/**
 * How many seeds are tried before the stronghold gives up.
 *
 * Java retries forever. A bound is this server's own, because a chunk that never finishes is
 * worse than a chunk with no stronghold in it.
 */
const MAX_ATTEMPTS = 256;

// ---------------------------------------------------------------------------
// Block states
// ---------------------------------------------------------------------------

const NO_PROPERTIES: Readonly<Record<string, string>> = Object.freeze({});

const blockState = (name: string, properties: Readonly<Record<string, string>> = NO_PROPERTIES): BlockState => ({
    name,
    properties
});

const CAVE_AIR = blockState('minecraft:cave_air');
const STONE_BRICKS = blockState('minecraft:stone_bricks');
const MOSSY_STONE_BRICKS = blockState('minecraft:mossy_stone_bricks');
const CRACKED_STONE_BRICKS = blockState('minecraft:cracked_stone_bricks');
const INFESTED_STONE_BRICKS = blockState('minecraft:infested_stone_bricks');
const STONE_BRICK_SLAB = blockState('minecraft:stone_brick_slab');
const SMOOTH_STONE_SLAB = blockState('minecraft:smooth_stone_slab');
const DOUBLE_SMOOTH_STONE_SLAB = blockState('minecraft:smooth_stone_slab', { type: 'double' });
const OAK_PLANKS = blockState('minecraft:oak_planks');
const BOOKSHELF = blockState('minecraft:bookshelf');
const COBBLESTONE = blockState('minecraft:cobblestone');
const COBWEB = blockState('minecraft:cobweb');
const WATER = blockState('minecraft:water');
const LAVA = blockState('minecraft:lava');
const TORCH = blockState('minecraft:torch');
const END_PORTAL = blockState('minecraft:end_portal');
const SPAWNER = blockState('minecraft:spawner');

const wallTorch = (facing: Facing): BlockState => blockState('minecraft:wall_torch', { facing });
const ladder = (facing: Facing): BlockState => blockState('minecraft:ladder', { facing });
const stairs = (name: string, facing: Facing): BlockState => blockState(name, { facing });
const button = (facing: Facing): BlockState => blockState('minecraft:stone_button', { facing });

const TORCH_NORTH = wallTorch('north');
const TORCH_EAST = wallTorch('east');
const TORCH_SOUTH = wallTorch('south');
const TORCH_WEST = wallTorch('west');
const LADDER_SOUTH = ladder('south');
const LADDER_WEST = ladder('west');
const BUTTON_NORTH = button('north');
const BUTTON_SOUTH = button('south');

/** A door leaf, hinged left as Java's default state is, so the mirror has something to flip. */
const doorLeaf = (name: string, facing: Facing, half: 'lower' | 'upper'): BlockState =>
    blockState(name, { facing, half, hinge: 'left' });

/** A fence or a pane with the named sides connected and the rest left at their default false. */
const connected = (name: string, ...sides: readonly Facing[]): BlockState =>
    blockState(name, Object.fromEntries(sides.map((side) => [side, 'true'])));

const BARS_NS = connected('minecraft:iron_bars', 'north', 'south');
const BARS_WE = connected('minecraft:iron_bars', 'west', 'east');
const BARS_NSE = connected('minecraft:iron_bars', 'north', 'south', 'east');
const BARS_W = connected('minecraft:iron_bars', 'west');
const BARS_E = connected('minecraft:iron_bars', 'east');

const FENCE_NS = connected('minecraft:oak_fence', 'north', 'south');
const FENCE_WE = connected('minecraft:oak_fence', 'west', 'east');
const FENCE_NSWE = connected('minecraft:oak_fence', 'north', 'south', 'west', 'east');
const FENCE_N_E = connected('minecraft:oak_fence', 'north', 'east');
const FENCE_S_E = connected('minecraft:oak_fence', 'south', 'east');
const FENCE_N_W = connected('minecraft:oak_fence', 'north', 'west');
const FENCE_S_W = connected('minecraft:oak_fence', 'south', 'west');
const FENCE_E = connected('minecraft:oak_fence', 'east');
const FENCE_W = connected('minecraft:oak_fence', 'west');

const STONE_BRICK_STAIRS_NORTH = stairs('minecraft:stone_brick_stairs', 'north');
const COBBLESTONE_STAIRS_SOUTH = stairs('minecraft:cobblestone_stairs', 'south');

const OAK_DOOR_LOWER = doorLeaf('minecraft:oak_door', 'north', 'lower');
const OAK_DOOR_UPPER = doorLeaf('minecraft:oak_door', 'north', 'upper');
const IRON_DOOR_LOWER = doorLeaf('minecraft:iron_door', 'north', 'lower');
const IRON_DOOR_UPPER = doorLeaf('minecraft:iron_door', 'north', 'upper');
const CELL_DOOR_LOWER = doorLeaf('minecraft:iron_door', 'west', 'lower');
const CELL_DOOR_UPPER = doorLeaf('minecraft:iron_door', 'west', 'upper');

/** The chests a stronghold rolls, by the datapack paths under `loot_table/chests`. */
const CORRIDOR_LOOT = 'minecraft:chests/stronghold_corridor';
const CROSSING_LOOT = 'minecraft:chests/stronghold_crossing';
const LIBRARY_LOOT = 'minecraft:chests/stronghold_library';

const AIR_NAMES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/**
 * The blocks a stronghold writes that do not fill their cell.
 *
 * Only the chest's own `reorient` asks, and it only ever looks at the four blocks beside a chest:
 * the stone brick and bookshelf walls it backs onto, the air in front of it, and the terrain the
 * room was cut into. Naming the thin blocks is the same answer as asking the block registry for
 * those positions.
 */
const THIN_BLOCKS = new Set([
    'minecraft:iron_bars',
    'minecraft:oak_fence',
    'minecraft:torch',
    'minecraft:wall_torch',
    'minecraft:ladder',
    'minecraft:oak_door',
    'minecraft:iron_door',
    'minecraft:stone_button',
    'minecraft:cobweb',
    'minecraft:chest',
    'minecraft:end_portal_frame',
    'minecraft:end_portal',
    'minecraft:water',
    'minecraft:lava',
    'minecraft:stone_brick_slab',
    'minecraft:smooth_stone_slab',
    'minecraft:stone_brick_stairs',
    'minecraft:cobblestone_stairs'
]);

const isFullBlock = (state: BlockState): boolean => !AIR_NAMES.has(state.name) && !THIN_BLOCKS.has(state.name);

// ---------------------------------------------------------------------------
// The turn Java applies to a written block state
// ---------------------------------------------------------------------------

const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' } as const satisfies Record<
    Facing,
    Facing
>;

const FLIPPED = { north: 'south', south: 'north', east: 'east', west: 'west' } as const satisfies Record<
    Facing,
    Facing
>;

const UNTURNED = { north: 'north', east: 'east', south: 'south', west: 'west' } as const satisfies Record<
    Facing,
    Facing
>;

const after = (first: Record<Facing, Facing>, second: Record<Facing, Facing>): Record<Facing, Facing> => ({
    north: second[first.north],
    east: second[first.east],
    south: second[first.south],
    west: second[first.west]
});

/**
 * Where each facing lands, per the mirror and rotation Java derives from a piece's orientation.
 *
 * Java's `StructurePiece.setOrientation` pairs south with a left-right mirror, east with a
 * quarter turn and west with both, and leaves north alone.
 */
const TURNED_FACING: Record<Facing, Record<Facing, Facing>> = {
    north: UNTURNED,
    south: FLIPPED,
    east: CLOCKWISE,
    west: after(FLIPPED, CLOCKWISE)
};

/** The orientations whose turn includes the mirror, which is what flips a door's hinge. */
const MIRRORED: Record<Facing, boolean> = { north: false, south: true, east: false, west: true };

const isFacing = (value: string): value is Facing =>
    value === 'north' || value === 'east' || value === 'south' || value === 'west';

/**
 * A block state turned the way Java turns it as the piece writes it.
 *
 * A `facing` moves, the four connection sides of a fence or a pane move with it, and a door
 * hinge swaps whenever the turn includes the mirror.
 */
const orientedState = (state: BlockState, orientation: Facing): BlockState => {
    if (orientation === 'north') return state;

    const properties = state.properties;
    const turn = TURNED_FACING[orientation];
    let turned: Record<string, string> | undefined;

    const facing = properties.facing;
    if (facing !== undefined && isFacing(facing)) {
        turned = { ...properties, facing: turn[facing] };
    }

    if (HORIZONTAL_DIRECTIONS.some((side) => properties[side] !== undefined)) {
        turned ??= { ...properties };
        for (const side of HORIZONTAL_DIRECTIONS) delete turned[side];
        for (const side of HORIZONTAL_DIRECTIONS) {
            const value = properties[side];
            if (value !== undefined) turned[turn[side]] = value;
        }
    }

    if (properties.hinge !== undefined && MIRRORED[orientation]) {
        turned ??= { ...properties };
        turned.hinge = properties.hinge === 'left' ? 'right' : 'left';
    }

    return turned === undefined ? state : { name: state.name, properties: turned };
};

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

/** Java's `BoundingBox.orientBox`: a box of a given extent laid out from a door, facing a way. */
const orientBox = (
    footX: number,
    footY: number,
    footZ: number,
    offX: number,
    offY: number,
    offZ: number,
    width: number,
    height: number,
    depth: number,
    direction: Facing
): BoundingBox => {
    switch (direction) {
        case 'north':
            return {
                minX: footX + offX,
                minY: footY + offY,
                minZ: footZ - depth + 1 + offZ,
                maxX: footX + width - 1 + offX,
                maxY: footY + height - 1 + offY,
                maxZ: footZ + offZ
            };
        case 'west':
            return {
                minX: footX - depth + 1 + offZ,
                minY: footY + offY,
                minZ: footZ + offX,
                maxX: footX + offZ,
                maxY: footY + height - 1 + offY,
                maxZ: footZ + width - 1 + offX
            };
        case 'east':
            return {
                minX: footX + offZ,
                minY: footY + offY,
                minZ: footZ + offX,
                maxX: footX + depth - 1 + offZ,
                maxY: footY + height - 1 + offY,
                maxZ: footZ + width - 1 + offX
            };
        case 'south':
            return {
                minX: footX + offX,
                minY: footY + offY,
                minZ: footZ + offZ,
                maxX: footX + width - 1 + offX,
                maxY: footY + height - 1 + offY,
                maxZ: footZ + depth - 1 + offZ
            };
    }
};

/** Java's `StructurePiece.makeBoundingBox`, which only the start stairwell uses. */
const makeBoundingBox = (
    x: number,
    y: number,
    z: number,
    direction: Facing,
    width: number,
    height: number,
    depth: number
): BoundingBox =>
    direction === 'north' || direction === 'south'
        ? { minX: x, minY: y, minZ: z, maxX: x + width - 1, maxY: y + height - 1, maxZ: z + depth - 1 }
        : { minX: x, minY: y, minZ: z, maxX: x + depth - 1, maxY: y + height - 1, maxZ: z + width - 1 };

const boxesIntersect = (a: BoundingBox, b: BoundingBox): boolean =>
    a.maxX >= b.minX &&
    a.minX <= b.maxX &&
    a.maxY >= b.minY &&
    a.minY <= b.maxY &&
    a.maxZ >= b.minZ &&
    a.minZ <= b.maxZ;

// ---------------------------------------------------------------------------
// The piece every room is
// ---------------------------------------------------------------------------

/** The four entrances a room can have, Java's `SmallDoorType`. */
type DoorKind = 'opening' | 'wood_door' | 'grates' | 'iron_door';

/** Java's `randomSmallDoor`: two draws in five leave the doorway open. */
const randomDoor = (random: RandomSource): DoorKind => {
    switch (random.nextInt(5)) {
        case 2:
            return 'wood_door';
        case 3:
            return 'grates';
        case 4:
            return 'iron_door';
        default:
            return 'opening';
    }
};

/** Java's `SmoothStoneSelector`: an aged stone brick shell with cave air inside it. */
const selectedBlock = (random: RandomSource, edge: boolean): BlockState => {
    if (!edge) return CAVE_AIR;

    const draw = random.nextFloat();
    if (draw < 0.2) return CRACKED_STONE_BRICKS;
    if (draw < 0.5) return MOSSY_STONE_BRICKS;
    if (draw < 0.55) return INFESTED_STONE_BRICKS;
    return STONE_BRICKS;
};

/**
 * One room of a stronghold: a box, the blocks it writes in its own frame, and the doors it opens.
 */
abstract class StrongholdPiece implements StructurePiece {
    /** @inheritDoc */
    public boundingBox: BoundingBox;

    /** The door the room was entered through, which it builds into its near wall. */
    protected entryDoor: DoorKind = 'opening';

    protected constructor(
        public readonly genDepth: number,
        boundingBox: BoundingBox,
        protected readonly orientation: Facing
    ) {
        this.boundingBox = boundingBox;
    }

    /** @inheritDoc */
    public abstract place(writer: StructureWriter, random: RandomSource): void;

    /** Opens this room's doors, which is what grows the graph. Most rooms open one. */
    public addChildren(_layout: StrongholdLayout, _random: RandomSource): void {}

    /** Drops the room, which is how the whole stronghold reaches its final height at once. */
    public moveDown(dy: number): void {
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
     * Whether a local position already holds air.
     *
     * Java reads the chunk being written and calls everything outside it air, which is what the
     * writer's own out-of-chunk answer already is. The test is what lets a shell skip the mouth
     * of a cave that cut into the room.
     */
    protected isAir(writer: StructureWriter, x: number, y: number, z: number): boolean {
        return AIR_NAMES.has(writer.blockAt(this.worldX(x, z), this.worldY(y), this.worldZ(x, z)).name);
    }

    /** Java's `generateBox` with two fixed states: the shell takes one, the inside the other. */
    protected fillBox(
        writer: StructureWriter,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        edge: BlockState,
        inside: BlockState,
        skipAir: boolean
    ): void {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                for (let z = z0; z <= z1; z++) {
                    if (skipAir && this.isAir(writer, x, y, z)) continue;

                    const onEdge = y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1;
                    this.placeBlock(writer, onEdge ? edge : inside, x, y, z);
                }
            }
        }
    }

    /** Java's `generateBox` with the stone brick selector, which draws once per block it writes. */
    protected fillSelected(
        writer: StructureWriter,
        random: RandomSource,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        skipAir: boolean
    ): void {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                for (let z = z0; z <= z1; z++) {
                    if (skipAir && this.isAir(writer, x, y, z)) continue;

                    const onEdge = y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1;
                    this.placeBlock(writer, selectedBlock(random, onEdge), x, y, z);
                }
            }
        }
    }

    /** Java's `generateMaybeBox`: one draw per position whether or not anything lands. */
    protected maybeFillBox(
        writer: StructureWriter,
        random: RandomSource,
        probability: number,
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
                    if (random.nextFloat() > probability) continue;

                    this.placeBlock(writer, state, x, y, z);
                }
            }
        }
    }

    protected maybeBlock(
        writer: StructureWriter,
        random: RandomSource,
        probability: number,
        x: number,
        y: number,
        z: number,
        state: BlockState
    ): void {
        if (random.nextFloat() < probability) this.placeBlock(writer, state, x, y, z);
    }

    /** Java's `generateSmallDoor`: the three-by-three entrance in a room's near wall. */
    protected smallDoor(writer: StructureWriter, kind: DoorKind, x: number, y: number, z: number): void {
        switch (kind) {
            case 'opening':
                this.fillBox(writer, x, y, z, x + 2, y + 2, z, CAVE_AIR, CAVE_AIR, false);
                return;
            case 'wood_door':
                this.doorFrame(writer, x, y, z);
                this.placeBlock(writer, OAK_DOOR_LOWER, x + 1, y, z);
                this.placeBlock(writer, OAK_DOOR_UPPER, x + 1, y + 1, z);
                return;
            case 'grates':
                this.placeBlock(writer, CAVE_AIR, x + 1, y, z);
                this.placeBlock(writer, CAVE_AIR, x + 1, y + 1, z);
                this.placeBlock(writer, BARS_W, x, y, z);
                this.placeBlock(writer, BARS_W, x, y + 1, z);
                this.placeBlock(writer, BARS_WE, x, y + 2, z);
                this.placeBlock(writer, BARS_WE, x + 1, y + 2, z);
                this.placeBlock(writer, BARS_WE, x + 2, y + 2, z);
                this.placeBlock(writer, BARS_E, x + 2, y + 1, z);
                this.placeBlock(writer, BARS_E, x + 2, y, z);
                return;
            case 'iron_door':
                this.doorFrame(writer, x, y, z);
                this.placeBlock(writer, IRON_DOOR_LOWER, x + 1, y, z);
                this.placeBlock(writer, IRON_DOOR_UPPER, x + 1, y + 1, z);
                this.placeBlock(writer, BUTTON_NORTH, x + 2, y + 1, z + 1);
                this.placeBlock(writer, BUTTON_SOUTH, x + 2, y + 1, z - 1);
        }
    }

    private doorFrame(writer: StructureWriter, x: number, y: number, z: number): void {
        this.placeBlock(writer, STONE_BRICKS, x, y, z);
        this.placeBlock(writer, STONE_BRICKS, x, y + 1, z);
        this.placeBlock(writer, STONE_BRICKS, x, y + 2, z);
        this.placeBlock(writer, STONE_BRICKS, x + 1, y + 2, z);
        this.placeBlock(writer, STONE_BRICKS, x + 2, y + 2, z);
        this.placeBlock(writer, STONE_BRICKS, x + 2, y + 1, z);
        this.placeBlock(writer, STONE_BRICKS, x + 2, y, z);
    }

    /**
     * Java's `createChest`: a chest turned to face away from its wall, with a loot table on it.
     *
     * The chest is written straight rather than through {@link StrongholdPiece.placeBlock}, so
     * the piece's own turn is not applied to it; `reorient` has already answered in world terms.
     */
    protected createChest(
        writer: StructureWriter,
        random: RandomSource,
        x: number,
        y: number,
        z: number,
        lootTable: string
    ): void {
        const worldX = this.worldX(x, z);
        const worldY = this.worldY(y);
        const worldZ = this.worldZ(x, z);
        if (writer.blockAt(worldX, worldY, worldZ).name === 'minecraft:chest') return;

        const facing = chestFacing(writer, worldX, worldY, worldZ);
        if (!writer.setBlock(worldX, worldY, worldZ, blockState('minecraft:chest', { facing }))) return;

        writer.setBlockEntity(worldX, worldY, worldZ, { id: 'minecraft:chest', lootTable });
        random.nextLong();
    }

    /** Java's `generateSmallDoorChildForward`: the door straight ahead, which every room has. */
    protected childForward(layout: StrongholdLayout, random: RandomSource, xOff: number, yOff: number): void {
        const box = this.boundingBox;
        switch (this.orientation) {
            case 'north':
                layout.growFrom(random, box.minX + xOff, box.minY + yOff, box.minZ - 1, 'north', this.genDepth);
                return;
            case 'south':
                layout.growFrom(random, box.minX + xOff, box.minY + yOff, box.maxZ + 1, 'south', this.genDepth);
                return;
            case 'west':
                layout.growFrom(random, box.minX - 1, box.minY + yOff, box.minZ + xOff, 'west', this.genDepth);
                return;
            case 'east':
                layout.growFrom(random, box.maxX + 1, box.minY + yOff, box.minZ + xOff, 'east', this.genDepth);
        }
    }

    /** Java's `generateSmallDoorChildLeft`: the door out of the room's left wall. */
    protected childLeft(layout: StrongholdLayout, random: RandomSource, yOff: number, zOff: number): void {
        const box = this.boundingBox;
        switch (this.orientation) {
            case 'north':
            case 'south':
                layout.growFrom(random, box.minX - 1, box.minY + yOff, box.minZ + zOff, 'west', this.genDepth);
                return;
            case 'west':
            case 'east':
                layout.growFrom(random, box.minX + zOff, box.minY + yOff, box.minZ - 1, 'north', this.genDepth);
        }
    }

    /** Java's `generateSmallDoorChildRight`: the door out of the room's right wall. */
    protected childRight(layout: StrongholdLayout, random: RandomSource, yOff: number, zOff: number): void {
        const box = this.boundingBox;
        switch (this.orientation) {
            case 'north':
            case 'south':
                layout.growFrom(random, box.maxX + 1, box.minY + yOff, box.minZ + zOff, 'east', this.genDepth);
                return;
            case 'west':
            case 'east':
                layout.growFrom(random, box.minX + zOff, box.minY + yOff, box.maxZ + 1, 'south', this.genDepth);
        }
    }
}

/**
 * Java's `StructurePiece.reorient`: a chest backs onto the one solid block beside it.
 *
 * With no solid neighbor, or with more than one, it keeps its default north and then turns away
 * from whatever it would be facing into.
 */
const chestFacing = (writer: StructureWriter, x: number, y: number, z: number): Facing => {
    const solidAt = (facing: Facing): boolean => {
        const [dx, dy, dz] = DIRECTION_STEPS[facing];
        return isFullBlock(writer.blockAt(x + dx, y + dy, z + dz));
    };

    let only: Facing | undefined;
    let several = false;
    for (const facing of HORIZONTAL_DIRECTIONS) {
        const [dx, dy, dz] = DIRECTION_STEPS[facing];
        if (writer.blockAt(x + dx, y + dy, z + dz).name === 'minecraft:chest') return 'north';
        if (!solidAt(facing)) continue;
        if (only !== undefined) {
            several = true;
            break;
        }

        only = facing;
    }

    if (!several && only !== undefined) return oppositeDirection(only);

    let facing: Facing = 'north';
    if (solidAt(facing)) facing = oppositeDirection(facing);
    if (solidAt(facing)) facing = CLOCKWISE[facing];
    if (solidAt(facing)) facing = oppositeDirection(facing);
    return facing;
};

// ---------------------------------------------------------------------------
// The rooms
// ---------------------------------------------------------------------------

/** The stairwell every stronghold starts in, and the one the stairs down piece repeats. */
class StairsDown extends StrongholdPiece {
    public constructor(
        genDepth: number,
        boundingBox: BoundingBox,
        direction: Facing,
        entryDoor: DoorKind,
        private readonly isStart: boolean
    ) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = entryDoor;
    }

    public override addChildren(layout: StrongholdLayout, random: RandomSource): void {
        // The start's first room is always the five-way crossing, whatever the weights say.
        if (this.isStart) layout.impose('five_crossing');
        this.childForward(layout, random, 1, 1);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 4, 10, 4, true);
        this.smallDoor(writer, this.entryDoor, 1, 7, 0);
        this.smallDoor(writer, 'opening', 1, 1, 4);
        this.placeBlock(writer, STONE_BRICKS, 2, 6, 1);
        this.placeBlock(writer, STONE_BRICKS, 1, 5, 1);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 1, 6, 1);
        this.placeBlock(writer, STONE_BRICKS, 1, 5, 2);
        this.placeBlock(writer, STONE_BRICKS, 1, 4, 3);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 1, 5, 3);
        this.placeBlock(writer, STONE_BRICKS, 2, 4, 3);
        this.placeBlock(writer, STONE_BRICKS, 3, 3, 3);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 3, 4, 3);
        this.placeBlock(writer, STONE_BRICKS, 3, 3, 2);
        this.placeBlock(writer, STONE_BRICKS, 3, 2, 1);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 3, 3, 1);
        this.placeBlock(writer, STONE_BRICKS, 2, 2, 1);
        this.placeBlock(writer, STONE_BRICKS, 1, 1, 1);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 1, 2, 1);
        this.placeBlock(writer, STONE_BRICKS, 1, 1, 2);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 1, 1, 3);
    }
}

/** A straight corridor, which half the rooms of a stronghold are. */
class Straight extends StrongholdPiece {
    private readonly leftChild: boolean;
    private readonly rightChild: boolean;

    public constructor(genDepth: number, random: RandomSource, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = randomDoor(random);
        this.leftChild = random.nextInt(2) === 0;
        this.rightChild = random.nextInt(2) === 0;
    }

    public override addChildren(layout: StrongholdLayout, random: RandomSource): void {
        this.childForward(layout, random, 1, 1);
        if (this.leftChild) this.childLeft(layout, random, 1, 2);
        if (this.rightChild) this.childRight(layout, random, 1, 2);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 4, 4, 6, true);
        this.smallDoor(writer, this.entryDoor, 1, 1, 0);
        this.smallDoor(writer, 'opening', 1, 1, 6);

        this.maybeBlock(writer, random, 0.1, 1, 2, 1, TORCH_EAST);
        this.maybeBlock(writer, random, 0.1, 3, 2, 1, TORCH_WEST);
        this.maybeBlock(writer, random, 0.1, 1, 2, 5, TORCH_EAST);
        this.maybeBlock(writer, random, 0.1, 3, 2, 5, TORCH_WEST);

        if (this.leftChild) this.fillBox(writer, 0, 1, 2, 0, 3, 4, CAVE_AIR, CAVE_AIR, false);
        if (this.rightChild) this.fillBox(writer, 4, 1, 2, 4, 3, 4, CAVE_AIR, CAVE_AIR, false);
    }
}

/** The barred hall of cells. */
class PrisonHall extends StrongholdPiece {
    public constructor(genDepth: number, random: RandomSource, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = randomDoor(random);
    }

    public override addChildren(layout: StrongholdLayout, random: RandomSource): void {
        this.childForward(layout, random, 1, 1);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 8, 4, 10, true);
        this.smallDoor(writer, this.entryDoor, 1, 1, 0);
        this.fillBox(writer, 1, 1, 10, 3, 3, 10, CAVE_AIR, CAVE_AIR, false);
        this.fillSelected(writer, random, 4, 1, 1, 4, 3, 1, false);
        this.fillSelected(writer, random, 4, 1, 3, 4, 3, 3, false);
        this.fillSelected(writer, random, 4, 1, 7, 4, 3, 7, false);
        this.fillSelected(writer, random, 4, 1, 9, 4, 3, 9, false);

        for (let y = 1; y <= 3; y++) {
            this.placeBlock(writer, BARS_NS, 4, y, 4);
            this.placeBlock(writer, BARS_NSE, 4, y, 5);
            this.placeBlock(writer, BARS_NS, 4, y, 6);
            this.placeBlock(writer, BARS_WE, 5, y, 5);
            this.placeBlock(writer, BARS_WE, 6, y, 5);
            this.placeBlock(writer, BARS_WE, 7, y, 5);
        }

        this.placeBlock(writer, BARS_NS, 4, 3, 2);
        this.placeBlock(writer, BARS_NS, 4, 3, 8);
        this.placeBlock(writer, CELL_DOOR_LOWER, 4, 1, 2);
        this.placeBlock(writer, CELL_DOOR_UPPER, 4, 2, 2);
        this.placeBlock(writer, CELL_DOOR_LOWER, 4, 1, 8);
        this.placeBlock(writer, CELL_DOOR_UPPER, 4, 2, 8);
    }
}

/** A corner, which turns left out of the room for a north or east entrance and right otherwise. */
class Turn extends StrongholdPiece {
    public constructor(
        genDepth: number,
        random: RandomSource,
        boundingBox: BoundingBox,
        direction: Facing,
        private readonly turnsLeft: boolean
    ) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = randomDoor(random);
    }

    /** Whether the corner's exit is in the room's own left wall, which the entrance decides. */
    private get exitsLeft(): boolean {
        const entered = this.orientation === 'north' || this.orientation === 'east';
        return this.turnsLeft === entered;
    }

    public override addChildren(layout: StrongholdLayout, random: RandomSource): void {
        if (this.exitsLeft) this.childLeft(layout, random, 1, 1);
        else this.childRight(layout, random, 1, 1);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 4, 4, 4, true);
        this.smallDoor(writer, this.entryDoor, 1, 1, 0);
        const x = this.exitsLeft ? 0 : 4;
        this.fillBox(writer, x, 1, 1, x, 3, 3, CAVE_AIR, CAVE_AIR, false);
    }
}

/** The square room, which is one of five furnishings. */
class RoomCrossing extends StrongholdPiece {
    private readonly type: number;

    public constructor(genDepth: number, random: RandomSource, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = randomDoor(random);
        this.type = random.nextInt(5);
    }

    public override addChildren(layout: StrongholdLayout, random: RandomSource): void {
        this.childForward(layout, random, 4, 1);
        this.childLeft(layout, random, 1, 4);
        this.childRight(layout, random, 1, 4);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 10, 6, 10, true);
        this.smallDoor(writer, this.entryDoor, 4, 1, 0);
        this.fillBox(writer, 4, 1, 10, 6, 3, 10, CAVE_AIR, CAVE_AIR, false);
        this.fillBox(writer, 0, 1, 4, 0, 3, 6, CAVE_AIR, CAVE_AIR, false);
        this.fillBox(writer, 10, 1, 4, 10, 3, 6, CAVE_AIR, CAVE_AIR, false);

        switch (this.type) {
            case 0:
                this.placePillar(writer);
                return;
            case 1:
                this.placeFountain(writer);
                return;
            case 2:
                this.placeMineLanding(writer, random);
        }
    }

    /** A lit stone pillar with a slab apron around its foot. */
    private placePillar(writer: StructureWriter): void {
        this.placeBlock(writer, STONE_BRICKS, 5, 1, 5);
        this.placeBlock(writer, STONE_BRICKS, 5, 2, 5);
        this.placeBlock(writer, STONE_BRICKS, 5, 3, 5);
        this.placeBlock(writer, TORCH_WEST, 4, 3, 5);
        this.placeBlock(writer, TORCH_EAST, 6, 3, 5);
        this.placeBlock(writer, TORCH_SOUTH, 5, 3, 4);
        this.placeBlock(writer, TORCH_NORTH, 5, 3, 6);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 4, 1, 4);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 4, 1, 5);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 4, 1, 6);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 6, 1, 4);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 6, 1, 5);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 6, 1, 6);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 5, 1, 4);
        this.placeBlock(writer, SMOOTH_STONE_SLAB, 5, 1, 6);
    }

    /** A sunken square with a water column in the middle of it. */
    private placeFountain(writer: StructureWriter): void {
        for (let step = 0; step < 5; step++) {
            this.placeBlock(writer, STONE_BRICKS, 3, 1, 3 + step);
            this.placeBlock(writer, STONE_BRICKS, 7, 1, 3 + step);
            this.placeBlock(writer, STONE_BRICKS, 3 + step, 1, 3);
            this.placeBlock(writer, STONE_BRICKS, 3 + step, 1, 7);
        }

        this.placeBlock(writer, STONE_BRICKS, 5, 1, 5);
        this.placeBlock(writer, STONE_BRICKS, 5, 2, 5);
        this.placeBlock(writer, STONE_BRICKS, 5, 3, 5);
        this.placeBlock(writer, WATER, 5, 4, 5);
    }

    /** The cobblestone frame, the plank ceiling and the ladder up to the chest above it. */
    private placeMineLanding(writer: StructureWriter, random: RandomSource): void {
        for (let z = 1; z <= 9; z++) {
            this.placeBlock(writer, COBBLESTONE, 1, 3, z);
            this.placeBlock(writer, COBBLESTONE, 9, 3, z);
        }

        for (let x = 1; x <= 9; x++) {
            this.placeBlock(writer, COBBLESTONE, x, 3, 1);
            this.placeBlock(writer, COBBLESTONE, x, 3, 9);
        }

        this.placeBlock(writer, COBBLESTONE, 5, 1, 4);
        this.placeBlock(writer, COBBLESTONE, 5, 1, 6);
        this.placeBlock(writer, COBBLESTONE, 5, 3, 4);
        this.placeBlock(writer, COBBLESTONE, 5, 3, 6);
        this.placeBlock(writer, COBBLESTONE, 4, 1, 5);
        this.placeBlock(writer, COBBLESTONE, 6, 1, 5);
        this.placeBlock(writer, COBBLESTONE, 4, 3, 5);
        this.placeBlock(writer, COBBLESTONE, 6, 3, 5);

        for (let y = 1; y <= 3; y++) {
            this.placeBlock(writer, COBBLESTONE, 4, y, 4);
            this.placeBlock(writer, COBBLESTONE, 6, y, 4);
            this.placeBlock(writer, COBBLESTONE, 4, y, 6);
            this.placeBlock(writer, COBBLESTONE, 6, y, 6);
        }

        this.placeBlock(writer, TORCH_NORTH, 5, 3, 5);

        for (let z = 2; z <= 8; z++) {
            this.placeBlock(writer, OAK_PLANKS, 2, 3, z);
            this.placeBlock(writer, OAK_PLANKS, 3, 3, z);
            if (z <= 3 || z >= 7) {
                this.placeBlock(writer, OAK_PLANKS, 4, 3, z);
                this.placeBlock(writer, OAK_PLANKS, 5, 3, z);
                this.placeBlock(writer, OAK_PLANKS, 6, 3, z);
            }

            this.placeBlock(writer, OAK_PLANKS, 7, 3, z);
            this.placeBlock(writer, OAK_PLANKS, 8, 3, z);
        }

        this.placeBlock(writer, LADDER_WEST, 9, 1, 3);
        this.placeBlock(writer, LADDER_WEST, 9, 2, 3);
        this.placeBlock(writer, LADDER_WEST, 9, 3, 3);
        this.createChest(writer, random, 3, 4, 8, CROSSING_LOOT);
    }
}

/** The long cobblestone staircase. */
class StraightStairsDown extends StrongholdPiece {
    public constructor(genDepth: number, random: RandomSource, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = randomDoor(random);
    }

    public override addChildren(layout: StrongholdLayout, random: RandomSource): void {
        this.childForward(layout, random, 1, 1);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 4, 10, 7, true);
        this.smallDoor(writer, this.entryDoor, 1, 7, 0);
        this.smallDoor(writer, 'opening', 1, 1, 7);

        for (let step = 0; step < 6; step++) {
            this.placeBlock(writer, COBBLESTONE_STAIRS_SOUTH, 1, 6 - step, 1 + step);
            this.placeBlock(writer, COBBLESTONE_STAIRS_SOUTH, 2, 6 - step, 1 + step);
            this.placeBlock(writer, COBBLESTONE_STAIRS_SOUTH, 3, 6 - step, 1 + step);
            if (step < 5) {
                this.placeBlock(writer, STONE_BRICKS, 1, 5 - step, 1 + step);
                this.placeBlock(writer, STONE_BRICKS, 2, 5 - step, 1 + step);
                this.placeBlock(writer, STONE_BRICKS, 3, 5 - step, 1 + step);
            }
        }
    }
}

/** The two-storey crossing, which opens up to five doors. */
class FiveCrossing extends StrongholdPiece {
    private readonly leftLow: boolean;
    private readonly leftHigh: boolean;
    private readonly rightLow: boolean;
    private readonly rightHigh: boolean;

    public constructor(genDepth: number, random: RandomSource, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = randomDoor(random);
        this.leftLow = random.nextBoolean();
        this.leftHigh = random.nextBoolean();
        this.rightLow = random.nextBoolean();
        this.rightHigh = random.nextInt(3) > 0;
    }

    public override addChildren(layout: StrongholdLayout, random: RandomSource): void {
        // The two side doors sit at different heights, and the pair swaps when the room's local
        // z axis runs backwards, which is what the subtraction from eight compensates for.
        const backwards = this.orientation === 'west' || this.orientation === 'north';
        const lowY = backwards ? 5 : 3;
        const highY = backwards ? 3 : 5;

        this.childForward(layout, random, 5, 1);
        if (this.leftLow) this.childLeft(layout, random, lowY, 1);
        if (this.leftHigh) this.childLeft(layout, random, highY, 7);
        if (this.rightLow) this.childRight(layout, random, lowY, 1);
        if (this.rightHigh) this.childRight(layout, random, highY, 7);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 9, 8, 10, true);
        this.smallDoor(writer, this.entryDoor, 4, 3, 0);
        if (this.leftLow) this.fillBox(writer, 0, 3, 1, 0, 5, 3, CAVE_AIR, CAVE_AIR, false);
        if (this.rightLow) this.fillBox(writer, 9, 3, 1, 9, 5, 3, CAVE_AIR, CAVE_AIR, false);
        if (this.leftHigh) this.fillBox(writer, 0, 5, 7, 0, 7, 9, CAVE_AIR, CAVE_AIR, false);
        if (this.rightHigh) this.fillBox(writer, 9, 5, 7, 9, 7, 9, CAVE_AIR, CAVE_AIR, false);

        this.fillBox(writer, 5, 1, 10, 7, 3, 10, CAVE_AIR, CAVE_AIR, false);
        this.fillSelected(writer, random, 1, 2, 1, 8, 2, 6, false);
        this.fillSelected(writer, random, 4, 1, 5, 4, 4, 9, false);
        this.fillSelected(writer, random, 8, 1, 5, 8, 4, 9, false);
        this.fillSelected(writer, random, 1, 4, 7, 3, 4, 9, false);
        this.fillSelected(writer, random, 1, 3, 5, 3, 3, 6, false);
        this.fillBox(writer, 1, 3, 4, 3, 3, 4, SMOOTH_STONE_SLAB, SMOOTH_STONE_SLAB, false);
        this.fillBox(writer, 1, 4, 6, 3, 4, 6, SMOOTH_STONE_SLAB, SMOOTH_STONE_SLAB, false);
        this.fillSelected(writer, random, 5, 1, 7, 7, 1, 8, false);
        this.fillBox(writer, 5, 1, 9, 7, 1, 9, SMOOTH_STONE_SLAB, SMOOTH_STONE_SLAB, false);
        this.fillBox(writer, 5, 2, 7, 7, 2, 7, SMOOTH_STONE_SLAB, SMOOTH_STONE_SLAB, false);
        this.fillBox(writer, 4, 5, 7, 4, 5, 9, SMOOTH_STONE_SLAB, SMOOTH_STONE_SLAB, false);
        this.fillBox(writer, 8, 5, 7, 8, 5, 9, SMOOTH_STONE_SLAB, SMOOTH_STONE_SLAB, false);
        this.fillBox(writer, 5, 5, 7, 7, 5, 9, DOUBLE_SMOOTH_STONE_SLAB, DOUBLE_SMOOTH_STONE_SLAB, false);
        this.placeBlock(writer, wallTorch('south'), 6, 5, 6);
    }
}

/** The corridor with the slab alcove and the first of a stronghold's chests. */
class ChestCorridor extends StrongholdPiece {
    public constructor(genDepth: number, random: RandomSource, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = randomDoor(random);
    }

    public override addChildren(layout: StrongholdLayout, random: RandomSource): void {
        this.childForward(layout, random, 1, 1);
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 4, 4, 6, true);
        this.smallDoor(writer, this.entryDoor, 1, 1, 0);
        this.smallDoor(writer, 'opening', 1, 1, 6);
        this.fillBox(writer, 3, 1, 2, 3, 1, 4, STONE_BRICKS, STONE_BRICKS, false);
        this.placeBlock(writer, STONE_BRICK_SLAB, 3, 1, 1);
        this.placeBlock(writer, STONE_BRICK_SLAB, 3, 1, 5);
        this.placeBlock(writer, STONE_BRICK_SLAB, 3, 2, 2);
        this.placeBlock(writer, STONE_BRICK_SLAB, 3, 2, 4);

        for (let z = 2; z <= 4; z++) this.placeBlock(writer, STONE_BRICK_SLAB, 2, 1, z);

        this.createChest(writer, random, 3, 2, 3, CORRIDOR_LOOT);
    }
}

/** The library, which is one or two storeys of bookshelves. */
class Library extends StrongholdPiece {
    private readonly isTall: boolean;

    public constructor(genDepth: number, random: RandomSource, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
        this.entryDoor = randomDoor(random);
        this.isTall = boundingBox.maxY - boundingBox.minY + 1 > 6;
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        const height = this.isTall ? 11 : 6;
        this.fillSelected(writer, random, 0, 0, 0, 13, height - 1, 14, true);
        this.smallDoor(writer, this.entryDoor, 4, 1, 0);
        this.maybeFillBox(writer, random, 0.07, 2, 1, 1, 11, 4, 13, COBWEB);

        for (let z = 1; z <= 13; z++) {
            if ((z - 1) % 4 === 0) {
                this.fillBox(writer, 1, 1, z, 1, 4, z, OAK_PLANKS, OAK_PLANKS, false);
                this.fillBox(writer, 12, 1, z, 12, 4, z, OAK_PLANKS, OAK_PLANKS, false);
                this.placeBlock(writer, TORCH_EAST, 2, 3, z);
                this.placeBlock(writer, TORCH_WEST, 11, 3, z);
                if (this.isTall) {
                    this.fillBox(writer, 1, 6, z, 1, 9, z, OAK_PLANKS, OAK_PLANKS, false);
                    this.fillBox(writer, 12, 6, z, 12, 9, z, OAK_PLANKS, OAK_PLANKS, false);
                }
            } else {
                this.fillBox(writer, 1, 1, z, 1, 4, z, BOOKSHELF, BOOKSHELF, false);
                this.fillBox(writer, 12, 1, z, 12, 4, z, BOOKSHELF, BOOKSHELF, false);
                if (this.isTall) {
                    this.fillBox(writer, 1, 6, z, 1, 9, z, BOOKSHELF, BOOKSHELF, false);
                    this.fillBox(writer, 12, 6, z, 12, 9, z, BOOKSHELF, BOOKSHELF, false);
                }
            }
        }

        for (let z = 3; z < 12; z += 2) {
            this.fillBox(writer, 3, 1, z, 4, 3, z, BOOKSHELF, BOOKSHELF, false);
            this.fillBox(writer, 6, 1, z, 7, 3, z, BOOKSHELF, BOOKSHELF, false);
            this.fillBox(writer, 9, 1, z, 10, 3, z, BOOKSHELF, BOOKSHELF, false);
        }

        if (this.isTall) this.placeBalcony(writer);

        this.createChest(writer, random, 3, 3, 5, LIBRARY_LOOT);
        if (this.isTall) {
            this.placeBlock(writer, CAVE_AIR, 12, 9, 1);
            this.createChest(writer, random, 12, 8, 1, LIBRARY_LOOT);
        }
    }

    /** The upper floor, its fence railing, the ladder up to it and the chandelier over it. */
    private placeBalcony(writer: StructureWriter): void {
        this.fillBox(writer, 1, 5, 1, 3, 5, 13, OAK_PLANKS, OAK_PLANKS, false);
        this.fillBox(writer, 10, 5, 1, 12, 5, 13, OAK_PLANKS, OAK_PLANKS, false);
        this.fillBox(writer, 4, 5, 1, 9, 5, 2, OAK_PLANKS, OAK_PLANKS, false);
        this.fillBox(writer, 4, 5, 12, 9, 5, 13, OAK_PLANKS, OAK_PLANKS, false);
        this.placeBlock(writer, OAK_PLANKS, 9, 5, 11);
        this.placeBlock(writer, OAK_PLANKS, 8, 5, 11);
        this.placeBlock(writer, OAK_PLANKS, 9, 5, 10);
        this.fillBox(writer, 3, 6, 3, 3, 6, 11, FENCE_NS, FENCE_NS, false);
        this.fillBox(writer, 10, 6, 3, 10, 6, 9, FENCE_NS, FENCE_NS, false);
        this.fillBox(writer, 4, 6, 2, 9, 6, 2, FENCE_WE, FENCE_WE, false);
        this.fillBox(writer, 4, 6, 12, 7, 6, 12, FENCE_WE, FENCE_WE, false);
        this.placeBlock(writer, FENCE_N_E, 3, 6, 2);
        this.placeBlock(writer, FENCE_S_E, 3, 6, 12);
        this.placeBlock(writer, FENCE_N_W, 10, 6, 2);

        for (let step = 0; step <= 2; step++) {
            this.placeBlock(writer, FENCE_S_W, 8 + step, 6, 12 - step);
            if (step !== 2) this.placeBlock(writer, FENCE_N_E, 8 + step, 6, 11 - step);
        }

        for (let y = 1; y <= 7; y++) this.placeBlock(writer, LADDER_SOUTH, 10, y, 13);

        this.placeBlock(writer, FENCE_E, 6, 9, 7);
        this.placeBlock(writer, FENCE_W, 7, 9, 7);
        this.placeBlock(writer, FENCE_E, 6, 8, 7);
        this.placeBlock(writer, FENCE_W, 7, 8, 7);
        this.placeBlock(writer, FENCE_NSWE, 6, 7, 7);
        this.placeBlock(writer, FENCE_NSWE, 7, 7, 7);
        this.placeBlock(writer, FENCE_E, 5, 7, 7);
        this.placeBlock(writer, FENCE_W, 8, 7, 7);
        this.placeBlock(writer, FENCE_N_E, 6, 7, 6);
        this.placeBlock(writer, FENCE_S_E, 6, 7, 8);
        this.placeBlock(writer, FENCE_N_W, 7, 7, 6);
        this.placeBlock(writer, FENCE_S_W, 7, 7, 8);
        this.placeBlock(writer, TORCH, 5, 8, 7);
        this.placeBlock(writer, TORCH, 8, 8, 7);
        this.placeBlock(writer, TORCH, 6, 8, 6);
        this.placeBlock(writer, TORCH, 6, 8, 8);
        this.placeBlock(writer, TORCH, 7, 8, 6);
        this.placeBlock(writer, TORCH, 7, 8, 8);
    }
}

/** The end portal room: the lava moat, the frames, the silverfish spawner and the stairs. */
class PortalRoom extends StrongholdPiece {
    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
    }

    public override addChildren(layout: StrongholdLayout, _random: RandomSource): void {
        layout.portalRoom = this;
    }

    public place(writer: StructureWriter, random: RandomSource): void {
        this.fillSelected(writer, random, 0, 0, 0, 10, 7, 15, false);
        this.smallDoor(writer, 'grates', 4, 1, 0);
        this.fillSelected(writer, random, 1, 6, 1, 1, 6, 14, false);
        this.fillSelected(writer, random, 9, 6, 1, 9, 6, 14, false);
        this.fillSelected(writer, random, 2, 6, 1, 8, 6, 2, false);
        this.fillSelected(writer, random, 2, 6, 14, 8, 6, 14, false);
        this.fillSelected(writer, random, 1, 1, 1, 2, 1, 4, false);
        this.fillSelected(writer, random, 8, 1, 1, 9, 1, 4, false);
        this.fillBox(writer, 1, 1, 1, 1, 1, 3, LAVA, LAVA, false);
        this.fillBox(writer, 9, 1, 1, 9, 1, 3, LAVA, LAVA, false);
        this.fillSelected(writer, random, 3, 1, 8, 7, 1, 12, false);
        this.fillBox(writer, 4, 1, 9, 6, 1, 11, LAVA, LAVA, false);

        for (let z = 3; z < 14; z += 2) {
            this.fillBox(writer, 0, 3, z, 0, 4, z, BARS_NS, BARS_NS, false);
            this.fillBox(writer, 10, 3, z, 10, 4, z, BARS_NS, BARS_NS, false);
        }

        for (let x = 2; x < 9; x += 2) {
            this.fillBox(writer, x, 3, 15, x, 4, 15, BARS_WE, BARS_WE, false);
        }

        this.fillSelected(writer, random, 4, 1, 5, 6, 1, 7, false);
        this.fillSelected(writer, random, 4, 2, 6, 6, 2, 7, false);
        this.fillSelected(writer, random, 4, 3, 7, 6, 3, 7, false);

        for (let x = 4; x <= 6; x++) {
            this.placeBlock(writer, STONE_BRICK_STAIRS_NORTH, x, 1, 4);
            this.placeBlock(writer, STONE_BRICK_STAIRS_NORTH, x, 2, 5);
            this.placeBlock(writer, STONE_BRICK_STAIRS_NORTH, x, 3, 6);
        }

        // One frame in ten keeps its eye, so a complete ring is roughly one portal room in a
        // thousand billion. The twelve draws happen whether or not any of them lands.
        const eyes: boolean[] = [];
        let complete = true;
        for (let index = 0; index < 12; index++) {
            const eye = random.nextFloat() > 0.9;
            eyes.push(eye);
            complete &&= eye;
        }

        const frame = (facing: Facing, index: number): BlockState =>
            blockState('minecraft:end_portal_frame', { facing, eye: String(eyes[index] === true) });

        const positions = [
            [4, 8, 'north'],
            [5, 8, 'north'],
            [6, 8, 'north'],
            [4, 12, 'south'],
            [5, 12, 'south'],
            [6, 12, 'south'],
            [3, 9, 'east'],
            [3, 10, 'east'],
            [3, 11, 'east'],
            [7, 9, 'west'],
            [7, 10, 'west'],
            [7, 11, 'west']
        ] as const satisfies readonly (readonly [number, number, Facing])[];

        positions.forEach(([x, z, facing], index) => this.placeBlock(writer, frame(facing, index), x, 3, z));

        if (complete) {
            for (let x = 4; x <= 6; x++) {
                for (let z = 9; z <= 11; z++) this.placeBlock(writer, END_PORTAL, x, 3, z);
            }
        }

        // The spawner is written straight, as Java writes it, so the block entity lands with it.
        const spawnerX = this.worldX(5, 6);
        const spawnerY = this.worldY(3);
        const spawnerZ = this.worldZ(5, 6);
        if (writer.setBlock(spawnerX, spawnerY, spawnerZ, SPAWNER)) {
            writer.setBlockEntity(spawnerX, spawnerY, spawnerZ, {
                id: 'minecraft:mob_spawner',
                spawnEntity: 'minecraft:silverfish'
            });
        }
    }
}

/** The stub of corridor a door grows when it runs into a room that is already there. */
class FillerCorridor extends StrongholdPiece {
    private readonly steps: number;

    public constructor(genDepth: number, boundingBox: BoundingBox, direction: Facing) {
        super(genDepth, boundingBox, direction);
        this.steps =
            direction === 'north' || direction === 'south'
                ? boundingBox.maxZ - boundingBox.minZ + 1
                : boundingBox.maxX - boundingBox.minX + 1;
    }

    public place(writer: StructureWriter, _random: RandomSource): void {
        for (let z = 0; z < this.steps; z++) {
            for (let x = 0; x <= 4; x++) {
                this.placeBlock(writer, STONE_BRICKS, x, 0, z);
                this.placeBlock(writer, STONE_BRICKS, x, 4, z);
            }

            for (let y = 1; y <= 3; y++) {
                this.placeBlock(writer, STONE_BRICKS, 0, y, z);
                this.placeBlock(writer, CAVE_AIR, 1, y, z);
                this.placeBlock(writer, CAVE_AIR, 2, y, z);
                this.placeBlock(writer, CAVE_AIR, 3, y, z);
                this.placeBlock(writer, STONE_BRICKS, 4, y, z);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The weighted draw
// ---------------------------------------------------------------------------

/** The room types the weighted draw picks between. */
type PieceKind =
    | 'straight'
    | 'prison_hall'
    | 'left_turn'
    | 'right_turn'
    | 'room_crossing'
    | 'straight_stairs_down'
    | 'stairs_down'
    | 'five_crossing'
    | 'chest_corridor'
    | 'library'
    | 'portal_room';

/** One row of Java's `STRONGHOLD_PIECE_WEIGHTS`. */
interface PieceWeight {
    readonly kind: PieceKind;
    readonly weight: number;
    /** How many of the type a stronghold may hold, or zero for no limit. */
    readonly limit: number;
    /** The depth the type first becomes available at. Only the library and portal room have one. */
    readonly minDepth: number;
    placed: number;
}

/** A fresh weight table, which Java's `resetPieces` rebuilds for every attempt. */
const freshWeights = (): PieceWeight[] =>
    (
        [
            ['straight', 40, 0, 0],
            ['prison_hall', 5, 5, 0],
            ['left_turn', 20, 0, 0],
            ['right_turn', 20, 0, 0],
            ['room_crossing', 10, 6, 0],
            ['straight_stairs_down', 5, 5, 0],
            ['stairs_down', 5, 5, 0],
            ['five_crossing', 5, 4, 0],
            ['chest_corridor', 5, 4, 0],
            ['library', 10, 2, 4],
            ['portal_room', 20, 1, 5]
        ] as const satisfies readonly (readonly [PieceKind, number, number, number])[]
    ).map(([kind, weight, limit, minDepth]) => ({ kind, weight, limit, minDepth, placed: 0 }));

const hasRoom = (entry: PieceWeight): boolean => entry.limit === 0 || entry.placed < entry.limit;

const canPlace = (entry: PieceWeight, depth: number): boolean => hasRoom(entry) && depth > entry.minDepth;

/** Builds one room of a kind at a door, or nothing when its box does not fit. */
const createPiece = (
    kind: PieceKind,
    layout: StrongholdLayout,
    random: RandomSource,
    footX: number,
    footY: number,
    footZ: number,
    direction: Facing,
    genDepth: number
): StrongholdPiece | undefined => {
    const fits = (box: BoundingBox): boolean => box.minY > LOWEST_Y && layout.collidingPiece(box) === undefined;
    const box = (offX: number, offY: number, width: number, height: number, depth: number): BoundingBox =>
        orientBox(footX, footY, footZ, offX, offY, 0, width, height, depth, direction);

    switch (kind) {
        case 'straight': {
            const candidate = box(-1, -1, 5, 5, 7);
            return fits(candidate) ? new Straight(genDepth, random, candidate, direction) : undefined;
        }
        case 'prison_hall': {
            const candidate = box(-1, -1, 9, 5, 11);
            return fits(candidate) ? new PrisonHall(genDepth, random, candidate, direction) : undefined;
        }
        case 'left_turn': {
            const candidate = box(-1, -1, 5, 5, 5);
            return fits(candidate) ? new Turn(genDepth, random, candidate, direction, true) : undefined;
        }
        case 'right_turn': {
            const candidate = box(-1, -1, 5, 5, 5);
            return fits(candidate) ? new Turn(genDepth, random, candidate, direction, false) : undefined;
        }
        case 'room_crossing': {
            const candidate = box(-4, -1, 11, 7, 11);
            return fits(candidate) ? new RoomCrossing(genDepth, random, candidate, direction) : undefined;
        }
        case 'straight_stairs_down': {
            const candidate = box(-1, -7, 5, 11, 8);
            return fits(candidate) ? new StraightStairsDown(genDepth, random, candidate, direction) : undefined;
        }
        case 'stairs_down': {
            const candidate = box(-1, -7, 5, 11, 5);
            return fits(candidate)
                ? new StairsDown(genDepth, candidate, direction, randomDoor(random), false)
                : undefined;
        }
        case 'five_crossing': {
            const candidate = box(-4, -3, 10, 9, 11);
            return fits(candidate) ? new FiveCrossing(genDepth, random, candidate, direction) : undefined;
        }
        case 'chest_corridor': {
            const candidate = box(-1, -1, 5, 5, 7);
            return fits(candidate) ? new ChestCorridor(genDepth, random, candidate, direction) : undefined;
        }
        case 'library': {
            // The library prefers its two-storey box and settles for the flat one.
            const tall = box(-4, -1, 14, 11, 15);
            if (fits(tall)) return new Library(genDepth, random, tall, direction);

            const flat = box(-4, -1, 14, 6, 15);
            return fits(flat) ? new Library(genDepth, random, flat, direction) : undefined;
        }
        case 'portal_room': {
            const candidate = box(-4, -1, 11, 8, 16);
            return fits(candidate) ? new PortalRoom(genDepth, candidate, direction) : undefined;
        }
    }
};

/**
 * Java's `FillerCorridor.findPieceBox`: the gap between a door and the room it ran into.
 *
 * There is only a gap worth filling when the room it hit starts at the same height, and only
 * when that room is one or two blocks away.
 */
const fillerCorridorBox = (
    layout: StrongholdLayout,
    footX: number,
    footY: number,
    footZ: number,
    direction: Facing
): BoundingBox | undefined => {
    const reach = (depth: number): BoundingBox => orientBox(footX, footY, footZ, -1, -1, 0, 5, 5, depth, direction);

    const full = reach(4);
    const hit = layout.collidingPiece(full);
    if (hit === undefined || hit.boundingBox.minY !== full.minY) return undefined;

    for (let depth = 2; depth >= 1; depth--) {
        if (!boxesIntersect(hit.boundingBox, reach(depth))) return reach(depth + 1);
    }

    return undefined;
};

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

/** One attempt at a stronghold: the rooms placed so far and the weights they were drawn from. */
class StrongholdLayout {
    public readonly pieces: StrongholdPiece[] = [];

    /** The rooms whose own doors have not been opened yet, drained in a drawn order. */
    public readonly pending: StrongholdPiece[] = [];

    /** The portal room, once one has been placed. Without it the attempt is thrown away. */
    public portalRoom: PortalRoom | undefined;

    /** The start's box, which is what the spread limit is measured from. */
    public startBox: BoundingBox = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

    private weights = freshWeights();
    private previous: PieceWeight | undefined;
    private imposed: PieceKind | undefined;
    private totalWeight = 0;

    /** The first room that overlaps a box, which is what stops a room being built into another. */
    public collidingPiece(box: BoundingBox): StrongholdPiece | undefined {
        return this.pieces.find((piece) => boxesIntersect(piece.boundingBox, box));
    }

    /** Forces the next room to be of one kind, which only the start stairwell does. */
    public impose(kind: PieceKind): void {
        this.imposed = kind;
    }

    public addPiece(piece: StrongholdPiece): void {
        this.pieces.push(piece);
    }

    /**
     * Java's `generateAndAddPiece`: grows one room out of a door, when there is room to.
     *
     * A door too deep in the graph or too far from the start builds nothing, which is what keeps
     * a stronghold inside the eight-chunk window a start may reach into.
     */
    public growFrom(
        random: RandomSource,
        footX: number,
        footY: number,
        footZ: number,
        direction: Facing,
        depth: number
    ): void {
        if (depth > MAX_DEPTH) return;
        if (Math.abs(footX - this.startBox.minX) > MAX_SPREAD) return;
        if (Math.abs(footZ - this.startBox.minZ) > MAX_SPREAD) return;

        const piece = this.drawPiece(random, footX, footY, footZ, direction, depth + 1);
        if (piece === undefined) return;

        this.pieces.push(piece);
        this.pending.push(piece);
    }

    /** Java's `generatePieceFromSmallDoor`: five tries at the weighted table, then a filler. */
    private drawPiece(
        random: RandomSource,
        footX: number,
        footY: number,
        footZ: number,
        direction: Facing,
        depth: number
    ): StrongholdPiece | undefined {
        if (!this.refreshWeights()) return undefined;

        if (this.imposed !== undefined) {
            const imposed = createPiece(this.imposed, this, random, footX, footY, footZ, direction, depth);
            this.imposed = undefined;
            if (imposed !== undefined) return imposed;
        }

        for (let attempt = 0; attempt < 5; attempt++) {
            let selection = random.nextInt(this.totalWeight);
            for (const entry of this.weights) {
                selection -= entry.weight;
                if (selection >= 0) continue;

                // The draw landed on this row. A row that is spent or was used last time ends
                // the attempt, but a row whose box simply did not fit lets the walk carry on,
                // which is how a blocked draw spills onto the rows after it.
                if (!canPlace(entry, depth) || entry === this.previous) break;

                const piece = createPiece(entry.kind, this, random, footX, footY, footZ, direction, depth);
                if (piece === undefined) continue;

                entry.placed++;
                this.previous = entry;
                if (!hasRoom(entry)) this.weights = this.weights.filter((row) => row !== entry);
                return piece;
            }
        }

        const box = fillerCorridorBox(this, footX, footY, footZ, direction);
        return box !== undefined && box.minY > 1 ? new FillerCorridor(depth, box, direction) : undefined;
    }

    /** Java's `updatePieceWeight`: the running total, and whether any limited room is left. */
    private refreshWeights(): boolean {
        this.totalWeight = 0;
        let anyLeft = false;
        for (const entry of this.weights) {
            if (entry.limit > 0 && entry.placed < entry.limit) anyLeft = true;
            this.totalWeight += entry.weight;
        }

        return anyLeft;
    }
}

/**
 * Java's `StructurePiecesBuilder.moveBelowSeaLevel`: the one move that settles the stronghold.
 *
 * The top of the stronghold is pulled to a drawn height below sea level, with its own span and
 * the dimension floor setting how low it may go. No terrain is read, which is what lets every
 * chunk the stronghold covers agree on its height without sampling a column.
 */
const settleBelowSeaLevel = (
    pieces: readonly StrongholdPiece[],
    seaLevel: number,
    minY: number,
    random: RandomSource
): void => {
    const box = unionOf(pieces);
    const ceiling = seaLevel - SEA_LEVEL_CLEARANCE;

    let top = box.maxY - box.minY + 1 + minY + 1;
    if (top < ceiling) top += random.nextInt(ceiling - top);

    const dy = top - box.maxY;
    for (const piece of pieces) piece.moveDown(dy);
};

/** Java's `getRandomHorizontalDirection`, which draws from north, east, south, west in that order. */
const randomFacing = (random: RandomSource): Facing => HORIZONTAL_DIRECTIONS[random.nextInt(4)]!;

/**
 * Lays out a stronghold: the stairwell at the chunk corner and every room that grew off it.
 *
 * The attempt is redrawn from the next seed until a portal room comes out of it, which is what
 * makes every stronghold have one.
 */
export const buildStronghold: StructureBuilder = (context): StructureLayout | undefined => {
    const blockX = context.chunkX * 16;
    const blockZ = context.chunkZ * 16;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // Java reseeds the shared worldgen stream per attempt. The first attempt's seed is the
        // one the context's stream already carries, so that one is used as it was handed over.
        const random =
            attempt === 0
                ? context.random
                : createLegacyRandom(largeFeatureSeed(context.seed + BigInt(attempt), context.chunkX, context.chunkZ));

        const facing = randomFacing(random);
        const layout = new StrongholdLayout();
        const start = new StairsDown(
            0,
            makeBoundingBox(blockX + 2, START_Y, blockZ + 2, facing, 5, 11, 5),
            facing,
            'opening',
            true
        );

        layout.startBox = start.boundingBox;
        layout.addPiece(start);
        start.addChildren(layout, random);

        while (layout.pending.length > 0) {
            const index = random.nextInt(layout.pending.length);
            layout.pending.splice(index, 1)[0]!.addChildren(layout, random);
        }

        settleBelowSeaLevel(layout.pieces, context.level.seaLevel, context.level.minY, random);

        if (layout.portalRoom !== undefined) {
            return { pieces: layout.pieces, origin: { x: blockX, y: 0, z: blockZ } };
        }
    }

    return undefined;
};
