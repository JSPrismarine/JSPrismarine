/**
 * The end city, which Java grows out of twenty templates with four section generators.
 *
 * `EndCityPieces.startHouseTower` stacks the house, a base floor, two storeys and a roof, and
 * hands the roof to the tower generator. That one raises a tower column and either throws
 * bridges off it, each bridge ending in another house, or caps it, or tops it with a fat tower
 * whose own bridges lead to more houses. `recursiveChildren` runs each generator at a depth, stops
 * at depth 8, and keeps a generator's batch of pieces only when none of them collides with a
 * piece placed by an earlier batch other than the parent's own. The bridge generator may, once
 * per city, hang the ship under a bridge instead of a house.
 *
 * Every piece is one `.nbt` file stamped at a position under a rotation about its own zero
 * block, which is what {@link TemplatePiece} does, so what is here is the generators, the depth
 * and collision bookkeeping, and Java's `calculateConnectedPosition` arithmetic that puts a
 * child template beside its parent.
 *
 * One thing Java does is left out. Its generation point is refused early when no allowed biome
 * could exist anywhere in the column; this server makes the one biome check every structure
 * makes, at the generation point, which is the weaker of the two tests.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type { Placement, Rotation, TemplatePosition } from '@jsprismarine/structures';

import { rotationOf } from './javaStructureJigsaw';
import type { StructureBuildContext, StructureBuilder, StructureLayout } from './javaStructureStarts';
import type { DataMarker } from './javaStructureTemplatePiece';
import { TemplatePiece, pivotedCorner } from './javaStructureTemplatePiece';
import type { StructureLevel, StructureWriter } from './javaStructureWorld';

/** Where in its chunk a city starts, Java's `START_OFFSET_IN_CHUNK`. */
const START_OFFSET_IN_CHUNK = 7;

/** The lowest island a city accepts. Below it the site is refused and nothing is laid out. */
const LOWEST_SURFACE = 60;

/** How deep the generators recurse, Java's `MAX_GEN_DEPTH`. */
const MAX_GEN_DEPTH = 8;

/** Where the twenty templates live. */
const PREFIX = 'minecraft:end_city/';

/** The one table every chest in a city rolls. */
const END_CITY_LOOT = 'minecraft:chests/end_city_treasure';

/** Java's quarter turns, in the order `Rotation.values()` lists them. */
const ROTATIONS = ['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'] as const;

const quarterTurnsOf = (rotation: Rotation): number => ROTATIONS.indexOf(rotation);

/** Java's `Rotation.getRotated`: one turn followed by another. */
const rotated = (rotation: Rotation, by: Rotation): Rotation =>
    rotationOf(quarterTurnsOf(rotation) + quarterTurnsOf(by));

/** Java's `BlockPos.rotate`: an offset turned about the origin. */
const rotatedOffset = ([x, y, z]: TemplatePosition, rotation: Rotation): TemplatePosition => {
    switch (rotation) {
        case 'clockwise_90':
            return [-z, y, x];
        case 'clockwise_180':
            return [-x, y, -z];
        case 'counterclockwise_90':
            return [z, y, -x];
        default:
            return [x, y, z];
    }
};

/**
 * Bedrock's `facing_direction` for the way an item frame faces, Java's `Rotation.rotate(SOUTH)`
 * for each rotation. Java hangs the elytra frame facing south in the template's own frame.
 */
const FRAME_FACING: Readonly<Record<Rotation, number>> = {
    none: 3,
    clockwise_90: 4,
    clockwise_180: 2,
    counterclockwise_90: 5
};

/** A bridge off a tower: the turn the bridge end takes and where it sits on the tower piece. */
interface BridgeSpot {
    readonly turn: Rotation;
    readonly offset: TemplatePosition;
}

/** Java's `TOWER_BRIDGES`, in the order the generator tries them. */
const TOWER_BRIDGES: readonly BridgeSpot[] = [
    { turn: 'none', offset: [1, -1, 0] },
    { turn: 'clockwise_90', offset: [6, -1, 1] },
    { turn: 'counterclockwise_90', offset: [0, -1, 5] },
    { turn: 'clockwise_180', offset: [5, -1, 6] }
];

/** Java's `FAT_TOWER_BRIDGES`. */
const FAT_TOWER_BRIDGES: readonly BridgeSpot[] = [
    { turn: 'none', offset: [4, -1, 0] },
    { turn: 'clockwise_90', offset: [12, -1, 4] },
    { turn: 'counterclockwise_90', offset: [0, -1, 8] },
    { turn: 'clockwise_180', offset: [8, -1, 12] }
];

/**
 * The origin, which is the rotation pivot of every end city piece, since Java leaves it at the
 * template's own zero block, and the offset a generator starts at when none was handed down.
 */
const ZERO: TemplatePosition = [0, 0, 0];

/**
 * One of Java's `EndCityPiece`s while the city is laid out.
 *
 * The template position and the rotation are what a child is placed from; the generation depth
 * is the batch mark `recursiveChildren` compares when a new batch collides with this piece. The
 * template piece is built as soon as the piece is, because its box is what the collision check
 * reads.
 */
interface CityPiece {
    readonly name: string;
    readonly position: TemplatePosition;
    readonly rotation: Rotation;
    readonly piece: TemplatePiece;
    /** Java's `genDepth`: 0 as built, `-1` for the bridge segments a house may not cross. */
    genDepth: number;
}

/** What a section generator is given, which is Java's parameters plus the city's store. */
interface Section {
    readonly context: StructureBuildContext;
    readonly depth: number;
    readonly parent: CityPiece;
    /** The offset the house tower generator starts at, which only the bridge generator sets. */
    readonly offset: TemplatePosition | undefined;
    /** The batch under construction, which nested batches are checked against and added to. */
    readonly batch: CityPiece[];
}

/** Java's `SectionGenerator.generate`: fills the batch and says whether it may be kept at all. */
type SectionGenerator = (section: Section) => boolean;

/**
 * Lays out an end city: the house, and the towers and bridges that grow off its roof.
 *
 * The city sits at one height, the lowest corner of Java's 5 by 5 probe under its start, and
 * every piece hangs off that through a chain of fixed offsets, so no piece settles while it is
 * written. A site whose island is below y 60 is refused, which is how Java keeps cities off the
 * low outer islands.
 */
export const buildEndCity: StructureBuilder = (context): StructureLayout | undefined => {
    const x = context.chunkX * 16 + START_OFFSET_IN_CHUNK;
    const z = context.chunkZ * 16 + START_OFFSET_IN_CHUNK;
    const rotation = rotationOf(context.random.nextInt(4));
    const y = lowestCornerHeight(context.level, x, z, rotation);
    if (y < LOWEST_SURFACE) return undefined;

    return {
        origin: { x, y, z },
        pieces: () => startHouseTower(context, [x, y, z], rotation).map((entry) => entry.piece)
    };
};

/**
 * The lowest of the four corners of Java's 5 by 5 probe, which is the height a city sits at.
 *
 * The probe reaches away from the start position in the direction the city was turned, so it
 * samples the island the house will actually stand on.
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

/** Java's `EndCityPieces.startHouseTower`: the house, then the tower generator off its roof. */
const startHouseTower = (
    context: StructureBuildContext,
    position: TemplatePosition,
    rotation: Rotation
): CityPiece[] => {
    const pieces: CityPiece[] = [];
    let shipCreated = false;

    // The four generators, each a closure over the city's one `shipCreated` flag, which Java
    // keeps on the bridge generator and resets in `init` at the start of every city.
    const houseTower: SectionGenerator = (section) => {
        if (section.depth > MAX_GEN_DEPTH) return false;

        const turn = section.parent.rotation;
        let piece = addPiece(section, section.parent, section.offset ?? ZERO, 'base_floor', turn, true);
        const kind = section.context.random.nextInt(3);
        if (kind === 0) {
            addPiece(section, piece, [-1, 4, -1], 'base_roof', turn, true);
        } else if (kind === 1) {
            piece = addPiece(section, piece, [-1, 0, -1], 'second_floor_2', turn, false);
            piece = addPiece(section, piece, [-1, 8, -1], 'second_roof', turn, false);
            recursiveChildren(section, tower, piece, undefined);
        } else if (kind === 2) {
            piece = addPiece(section, piece, [-1, 0, -1], 'second_floor_2', turn, false);
            piece = addPiece(section, piece, [-1, 4, -1], 'third_floor_2', turn, false);
            piece = addPiece(section, piece, [-1, 8, -1], 'third_roof', turn, true);
            recursiveChildren(section, tower, piece, undefined);
        }

        return true;
    };

    const tower: SectionGenerator = (section) => {
        const turn = section.parent.rotation;
        const random = section.context.random;
        let piece = addPiece(
            section,
            section.parent,
            [3 + random.nextInt(2), -3, 3 + random.nextInt(2)],
            'tower_base',
            turn,
            true
        );
        piece = addPiece(section, piece, [0, 7, 0], 'tower_piece', turn, true);

        let bridgeFrom = random.nextInt(3) === 0 ? piece : undefined;
        const floors = 1 + random.nextInt(3);
        for (let floor = 0; floor < floors; floor++) {
            piece = addPiece(section, piece, [0, 4, 0], 'tower_piece', turn, true);
            if (floor < floors - 1 && random.nextBoolean()) bridgeFrom = piece;
        }

        if (bridgeFrom !== undefined) {
            for (const bridge of TOWER_BRIDGES) {
                if (!random.nextBoolean()) continue;

                const end = addPiece(
                    section,
                    bridgeFrom,
                    bridge.offset,
                    'bridge_end',
                    rotated(turn, bridge.turn),
                    true
                );
                recursiveChildren(section, towerBridge, end, undefined);
            }
            addPiece(section, piece, [-1, 4, -1], 'tower_top', turn, true);
            return true;
        }

        if (section.depth === 7) {
            addPiece(section, piece, [-1, 4, -1], 'tower_top', turn, true);
            return true;
        }

        return recursiveChildren(section, fatTower, piece, undefined);
    };

    const towerBridge: SectionGenerator = (section) => {
        const turn = section.parent.rotation;
        const random = section.context.random;
        const segments = random.nextInt(4) + 1;
        let piece = addPiece(section, section.parent, [0, 0, -4], 'bridge_piece', turn, true);
        piece.genDepth = -1;

        let y = 0;
        for (let segment = 0; segment < segments; segment++) {
            // Two draws at most: a level segment on the first, else the second picks the stairs.
            const level = random.nextBoolean();
            const steep = !level && random.nextBoolean();
            if (level) {
                piece = addPiece(section, piece, [0, y, -4], 'bridge_piece', turn, true);
                y = 0;
            } else if (steep) {
                piece = addPiece(section, piece, [0, y, -4], 'bridge_steep_stairs', turn, true);
                y = 4;
            } else {
                piece = addPiece(section, piece, [0, y, -8], 'bridge_gentle_stairs', turn, true);
                y = 4;
            }
        }

        if (!shipCreated && random.nextInt(10 - section.depth) === 0) {
            addPiece(section, piece, [-8 + random.nextInt(8), y, -70 + random.nextInt(10)], 'ship', turn, true);
            shipCreated = true;
        } else if (!recursiveChildren(section, houseTower, piece, [-3, y + 1, -11])) {
            return false;
        }

        piece = addPiece(section, piece, [4, y, 0], 'bridge_end', rotated(turn, 'clockwise_180'), true);
        piece.genDepth = -1;
        return true;
    };

    const fatTower: SectionGenerator = (section) => {
        const turn = section.parent.rotation;
        const random = section.context.random;
        let piece = addPiece(section, section.parent, [-3, 4, -3], 'fat_tower_base', turn, true);
        piece = addPiece(section, piece, [0, 4, 0], 'fat_tower_middle', turn, true);

        for (let story = 0; story < 2 && random.nextInt(3) !== 0; story++) {
            piece = addPiece(section, piece, [0, 8, 0], 'fat_tower_middle', turn, true);
            for (const bridge of FAT_TOWER_BRIDGES) {
                if (!random.nextBoolean()) continue;

                const end = addPiece(section, piece, bridge.offset, 'bridge_end', rotated(turn, bridge.turn), true);
                recursiveChildren(section, towerBridge, end, undefined);
            }
        }

        addPiece(section, piece, [-2, 8, -2], 'fat_tower_top', turn, true);
        return true;
    };

    let piece = cityPiece(context, 'base_floor', position, rotation, true);
    pieces.push(piece);
    piece = pushPiece(pieces, connected(context, piece, [-1, 0, -1], 'second_floor_1', rotation, false));
    piece = pushPiece(pieces, connected(context, piece, [-1, 4, -1], 'third_floor_1', rotation, false));
    piece = pushPiece(pieces, connected(context, piece, [-1, 8, -1], 'third_roof', rotation, true));
    recursiveChildren({ context, depth: 0, parent: piece, offset: undefined, batch: pieces }, tower, piece, undefined);

    return pieces.filter((entry) => entry.piece.isPresent);
};

/**
 * Java's `EndCityPieces.recursiveChildren`: runs a generator one level deeper and keeps its
 * batch only if nothing in it collides with an earlier batch other than the parent's own.
 *
 * Every piece of the batch is marked with one fresh draw before the check, and the check reads
 * the first colliding piece only, as Java's `findCollisionPiece` does.
 */
const recursiveChildren = (
    section: Section,
    generator: SectionGenerator,
    parent: CityPiece,
    offset: TemplatePosition | undefined
): boolean => {
    const depth = section.depth + 1;
    if (depth > MAX_GEN_DEPTH) return false;

    const batch: CityPiece[] = [];
    if (!generator({ context: section.context, depth, parent, offset, batch })) return false;

    const mark = section.context.random.nextInt();
    for (const piece of batch) {
        piece.genDepth = mark;
        const collision = section.batch.find((placed) => placed.piece.isPresent && intersects(placed, piece));
        if (collision !== undefined && collision.genDepth !== parent.genDepth) return false;
    }

    section.batch.push(...batch);
    return true;
};

/** Java's `BoundingBox.intersects`, over the pieces this server carries a template for. */
const intersects = (left: CityPiece, right: CityPiece): boolean => {
    if (!right.piece.isPresent) return false;

    const a = left.piece.boundingBox;
    const b = right.piece.boundingBox;
    return (
        a.minX <= b.maxX &&
        a.maxX >= b.minX &&
        a.minY <= b.maxY &&
        a.maxY >= b.minY &&
        a.minZ <= b.maxZ &&
        a.maxZ >= b.minZ
    );
};

/** Java's `addHelper(list, addPiece(...))`: a child beside its parent, added to the batch. */
const addPiece = (
    section: Section,
    parent: CityPiece,
    offset: TemplatePosition,
    name: string,
    rotation: Rotation,
    overwrite: boolean
): CityPiece => pushPiece(section.batch, connected(section.context, parent, offset, name, rotation, overwrite));

const pushPiece = (into: CityPiece[], piece: CityPiece): CityPiece => {
    into.push(piece);
    return piece;
};

/**
 * Java's `EndCityPieces.addPiece`: a child template placed at the parent's position plus the
 * offset turned by the parent's rotation.
 *
 * That is what `StructureTemplate.calculateConnectedPosition` comes to when both pivots are the
 * zero block: the offset is transformed by the parent's placement and the child's transformed
 * zero, which is zero, is taken away.
 */
const connected = (
    context: StructureBuildContext,
    parent: CityPiece,
    offset: TemplatePosition,
    name: string,
    rotation: Rotation,
    overwrite: boolean
): CityPiece => {
    const [dx, dy, dz] = rotatedOffset(offset, parent.rotation);
    const position: TemplatePosition = [parent.position[0] + dx, parent.position[1] + dy, parent.position[2] + dz];
    return cityPiece(context, name, position, rotation, overwrite);
};

/** Builds one piece, with the template piece its box and its blocks come from. */
const cityPiece = (
    context: StructureBuildContext,
    name: string,
    position: TemplatePosition,
    rotation: Rotation,
    overwrite: boolean
): CityPiece => {
    const template = `${PREFIX}${name}`;
    const placement: Placement = { rotation };
    const size = context.templates.template(template)?.size ?? ZERO;
    const piece = new TemplatePiece({
        store: context.templates,
        template,
        position: pivotedCorner(position, size, placement, ZERO),
        placement,
        // Java's `makeSettings`: `STRUCTURE_BLOCK` for an overwriting piece and
        // `STRUCTURE_AND_AIR` for a floor whose air must leave the storey below it alone.
        overwrite,
        onDataMarker: (marker, writer) => fillMarker(marker, writer, rotation)
    });

    return { name, position, rotation, piece, genDepth: 0 };
};

/**
 * Fills in one data marker, Java's `EndCityPiece.handleDataMarker`: the loot table of the chest
 * under a chest marker, a shulker standing on a sentry marker, or the item frame holding the
 * elytra on an elytra marker.
 *
 * Bedrock has no item frame entity; its frame is a block with a block entity holding the item,
 * so the frame is written as that block, facing the way Java's entity would.
 */
const fillMarker = (marker: DataMarker, writer: StructureWriter, rotation: Rotation): void => {
    if (marker.value.startsWith('Chest')) {
        writer.setBlockEntity(marker.x, marker.y - 1, marker.z, { id: 'minecraft:chest', lootTable: END_CITY_LOOT });
        return;
    }

    if (marker.value.startsWith('Sentry')) {
        writer.spawnEntity('minecraft:shulker', marker.x + 0.5, marker.y, marker.z + 0.5, 0);
        return;
    }

    if (marker.value.startsWith('Elytra')) {
        const frame = {
            name: 'minecraft:frame',
            states: { facing_direction: FRAME_FACING[rotation], item_frame_map_bit: 0, item_frame_photo_bit: 0 }
        };
        if (!writer.setBedrockBlock(marker.x, marker.y, marker.z, frame)) return;

        writer.setBlockEntity(marker.x, marker.y, marker.z, { id: 'minecraft:item_frame', saved: elytraFrame() });
    }
};

/** The item frame as Java saves one holding an elytra, which the content translation reads. */
const elytraFrame = (): NBTTagCompound => {
    const frame = new NBTTagCompound('');
    frame.addValue('id', new Types.StringVal('minecraft:item_frame'));
    const item = new NBTTagCompound('Item');
    item.addValue('id', new Types.StringVal('minecraft:elytra'));
    item.addValue('count', new Types.NumberVal(1));
    frame.addChild(item);
    return frame;
};
