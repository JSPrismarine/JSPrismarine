/**
 * The legacy structures Java builds out of its own `.nbt` templates.
 *
 * Java keeps these in code rather than in data: a class picks the template, the rotation and the
 * height, and `TemplateStructurePiece` stamps the file. The shipwreck, the igloo, the ocean
 * ruin, the ruined portal and the nether fossil are all that shape, and between them they are 13
 * of the 24 structures the data has no recipe for.
 *
 * One thing is done differently from Java here, and it is deliberate. Java settles these
 * structures onto the terrain inside `postProcess`, which runs once per chunk the structure
 * covers, from that chunk's own random. A beached shipwreck therefore draws its `nextInt(3)`
 * sink depth separately in each chunk and can end up sheared along a chunk border. This settles
 * the y once, while the structure is laid out, so the whole of it lands at one height. The
 * result is a whole shipwreck where Java sometimes has two halves at different heights.
 */
import type { Placement, RandomSource, Rotation, TemplatePosition } from '@jsprismarine/structures';

import { sampleStructureHeight } from './javaStructureHeight';
import { rotationOf } from './javaStructureJigsaw';
import type { StructureBuildContext, StructureBuilder, StructureLayout } from './javaStructureStarts';
import type { TemplatePieceOptions } from './javaStructureTemplatePiece';
import { TemplatePiece, pivotedCorner } from './javaStructureTemplatePiece';
import type { StructurePiece, StructureWriter } from './javaStructureWorld';

/** Java's `Util.getRandom`: one entry of an array, by a single draw. */
const randomOf = <T>(values: readonly T[], random: RandomSource): T => values[random.nextInt(values.length)]!;

/** The middle block of a chunk, which is where Java takes a legacy structure's generation point. */
const chunkMiddle = (chunkX: number, chunkZ: number): { x: number; z: number } => ({
    x: chunkX * 16 + 8,
    z: chunkZ * 16 + 8
});

/** Builds a template piece, dropping it when this server does not carry the template. */
const pieceOf = (options: TemplatePieceOptions): StructurePiece[] => {
    const piece = new TemplatePiece(options);
    return piece.isPresent ? [piece] : [];
};

// ---------------------------------------------------------------------------
// Shipwreck
// ---------------------------------------------------------------------------

/** The pivot Java turns a shipwreck about. */
const SHIPWRECK_PIVOT: TemplatePosition = [4, 0, 15];

/** The hulls that may wash up on a beach: nothing upside down and nothing on its side. */
const BEACHED_SHIPWRECKS = [
    'with_mast',
    'sideways_full',
    'sideways_fronthalf',
    'sideways_backhalf',
    'rightsideup_full',
    'rightsideup_fronthalf',
    'rightsideup_backhalf',
    'with_mast_degraded',
    'rightsideup_full_degraded',
    'rightsideup_fronthalf_degraded',
    'rightsideup_backhalf_degraded'
] as const;

/** Every hull, which is what sinks in open water. */
const OCEAN_SHIPWRECKS = [
    'with_mast',
    'upsidedown_full',
    'upsidedown_fronthalf',
    'upsidedown_backhalf',
    'sideways_full',
    'sideways_fronthalf',
    'sideways_backhalf',
    'rightsideup_full',
    'rightsideup_fronthalf',
    'rightsideup_backhalf',
    'with_mast_degraded',
    'upsidedown_full_degraded',
    'upsidedown_fronthalf_degraded',
    'upsidedown_backhalf_degraded',
    'sideways_full_degraded',
    'sideways_fronthalf_degraded',
    'sideways_backhalf_degraded',
    'rightsideup_full_degraded',
    'rightsideup_fronthalf_degraded',
    'rightsideup_backhalf_degraded'
] as const;

/** Which loot table each of a shipwreck's three chests rolls. */
const SHIPWRECK_CHESTS: Readonly<Record<string, string>> = {
    map_chest: 'minecraft:chests/shipwreck_map',
    treasure_chest: 'minecraft:chests/shipwreck_treasure',
    supply_chest: 'minecraft:chests/shipwreck_supply'
};

/**
 * Lays out a shipwreck: one hull, turned, sunk to the sea floor or beached on the shore.
 */
export const buildShipwreck: StructureBuilder = (context): StructureLayout | undefined => {
    const beached = context.definition.is_beached === true;
    const heightmap = beached ? 'WORLD_SURFACE_WG' : 'OCEAN_FLOOR_WG';
    const middle = chunkMiddle(context.chunkX, context.chunkZ);

    return {
        origin: { x: middle.x, y: context.level.baseHeight(middle.x, middle.z, heightmap), z: middle.z },
        pieces: () => {
            const rotation = rotationOf(context.random.nextInt(4));
            const names = beached ? BEACHED_SHIPWRECKS : OCEAN_SHIPWRECKS;
            const template = `minecraft:shipwreck/${randomOf(names, context.random)}`;

            const placement: Placement = { rotation };
            const size = context.templates.size(template, placement);
            if (size === undefined) return [];

            const corner = pivotedCorner(
                [context.chunkX * 16, 0, context.chunkZ * 16],
                context.templates.template(template)!.size,
                placement,
                SHIPWRECK_PIVOT
            );

            // Java averages the floor over the hull's whole footprint, and for a beached hull
            // takes the lowest column and sinks the ship into it.
            const floors = footprintHeights(context, corner, size, heightmap);
            const y = beached
                ? floors.lowest - Math.trunc(size[1] / 2) - context.random.nextInt(3)
                : Math.trunc(floors.total / floors.count);

            return pieceOf({
                store: context.templates,
                template,
                position: [corner[0], y, corner[2]],
                placement,
                onDataMarker: (marker, writer) => {
                    const table = SHIPWRECK_CHESTS[marker.value];
                    if (table !== undefined) {
                        writer.setBlockEntity(marker.x, marker.y - 1, marker.z, {
                            id: 'minecraft:chest',
                            lootTable: table
                        });
                    }
                }
            });
        }
    };
};

/** The terrain heights under a piece's footprint, which is how a hull finds the sea floor. */
const footprintHeights = (
    context: StructureBuildContext,
    corner: TemplatePosition,
    size: TemplatePosition,
    heightmap: 'WORLD_SURFACE_WG' | 'OCEAN_FLOOR_WG'
): { total: number; count: number; lowest: number } => {
    let total = 0;
    let count = 0;
    let lowest = context.level.minY + context.level.height;

    for (let x = corner[0]; x < corner[0] + size[0]; x++) {
        for (let z = corner[2]; z < corner[2] + size[2]; z++) {
            const height = context.level.baseHeight(x, z, heightmap);
            total += height;
            count++;
            lowest = Math.min(lowest, height);
        }
    }

    return count === 0 ? { total: 0, count: 1, lowest } : { total, count, lowest };
};

// ---------------------------------------------------------------------------
// Igloo
// ---------------------------------------------------------------------------

/** The y Java lays an igloo out at before settling it onto the terrain. */
const IGLOO_LAYOUT_Y = 90;

/** The point each igloo template is turned about. */
const IGLOO_PIVOTS: Readonly<Record<string, TemplatePosition>> = {
    top: [3, 5, 5],
    middle: [1, 3, 1],
    bottom: [3, 6, 7]
};

/** How far each igloo template sits from the structure's own corner. */
const IGLOO_OFFSETS: Readonly<Record<string, TemplatePosition>> = {
    top: [0, 0, 0],
    middle: [2, -3, 4],
    bottom: [0, -3, -2]
};

/**
 * Lays out an igloo: the snow dome, and under half of them a ladder shaft down to the basement.
 */
export const buildIgloo: StructureBuilder = (context): StructureLayout | undefined => {
    const middle = chunkMiddle(context.chunkX, context.chunkZ);
    const surface = context.level.baseHeight(middle.x, middle.z, 'WORLD_SURFACE_WG');

    return {
        origin: { x: middle.x, y: surface, z: middle.z },
        pieces: () => {
            const rotation = rotationOf(context.random.nextInt(4));
            const corner: TemplatePosition = [context.chunkX * 16, IGLOO_LAYOUT_Y, context.chunkZ * 16];

            const shaft: { name: string; down: number }[] = [];
            if (context.random.nextDouble() < 0.5) {
                const depth = context.random.nextInt(8) + 4;
                shaft.push({ name: 'bottom', down: depth * 3 });
                for (let rung = 0; rung < depth - 1; rung++) shaft.push({ name: 'middle', down: rung * 3 });
            }

            // Java settles each piece in its own `postProcess` call; settling once here keeps the
            // dome and the shaft under it at the same height whichever chunk writes them.
            const lift = surface - IGLOO_LAYOUT_Y - 1;
            return [...shaft, { name: 'top', down: 0 }].flatMap(({ name, down }) =>
                iglooPiece(context, name, corner, rotation, down, lift)
            );
        }
    };
};

const iglooPiece = (
    context: StructureBuildContext,
    name: string,
    corner: TemplatePosition,
    rotation: Rotation,
    down: number,
    lift: number
): StructurePiece[] => {
    const template = `minecraft:igloo/${name}`;
    const base = context.templates.template(template);
    if (base === undefined) return [];

    const offset = IGLOO_OFFSETS[name] ?? [0, 0, 0];
    const placement: Placement = { rotation };
    const position = pivotedCorner(
        [corner[0] + offset[0], corner[1] + offset[1] - down + lift, corner[2] + offset[2]],
        base.size,
        placement,
        IGLOO_PIVOTS[name] ?? [0, 0, 0]
    );

    return pieceOf({
        store: context.templates,
        template,
        position,
        placement,
        onDataMarker: (marker, writer) => {
            if (marker.value !== 'chest') return;

            writer.setBlock(marker.x, marker.y, marker.z, { name: 'minecraft:air', properties: {} });
            writer.setBlockEntity(marker.x, marker.y - 1, marker.z, {
                id: 'minecraft:chest',
                lootTable: 'minecraft:chests/igloo_chest'
            });
        },
        ...(name === 'top'
            ? {
                  // Java caps the ladder hole with snow when the dome has no basement under it.
                  onPlaced: (writer: StructureWriter) => {
                      const hole = pivotedCorner(
                          [position[0], position[1], position[2]],
                          base.size,
                          placement,
                          [0, 0, 0]
                      );
                      const spot = capPosition(hole, base.size, placement);
                      const below = writer.blockAt(spot.x, spot.y - 1, spot.z);
                      if (below.name !== 'minecraft:air' && below.name !== 'minecraft:ladder') {
                          writer.setBlock(spot.x, spot.y, spot.z, {
                              name: 'minecraft:snow_block',
                              properties: {}
                          });
                      }
                  }
              }
            : {})
    });
};

/** Where the dome's trapdoor hole sits once the template is turned, Java's `(3, 0, 5)`. */
const capPosition = (
    corner: TemplatePosition,
    size: TemplatePosition,
    placement: Placement
): { x: number; y: number; z: number } => {
    const local = turnedOffset([3, 0, 5], size, placement);
    return { x: corner[0] + local[0], y: corner[1] + local[1], z: corner[2] + local[2] };
};

/** A template-space offset, turned the way the template is turned. */
const turnedOffset = (offset: TemplatePosition, size: TemplatePosition, placement: Placement): TemplatePosition => {
    switch (placement.rotation) {
        case 'clockwise_90':
            return [size[2] - 1 - offset[2], offset[1], offset[0]];
        case 'clockwise_180':
            return [size[0] - 1 - offset[0], offset[1], size[2] - 1 - offset[2]];
        case 'counterclockwise_90':
            return [offset[2], offset[1], size[0] - 1 - offset[0]];
        default:
            return offset;
    }
};

// ---------------------------------------------------------------------------
// Ocean ruin
// ---------------------------------------------------------------------------

const SMALL_WARM_RUINS = numbered('warm', 1, 8);
const BIG_WARM_RUINS = numbered('big_warm', 4, 7);
const SMALL_COLD_RUINS = [...numbered('brick', 1, 8), ...numbered('cracked', 1, 8), ...numbered('mossy', 1, 8)];
const BIG_COLD_RUINS = ['brick', 'cracked', 'mossy'].flatMap((kind) => [
    ...numbered(`big_${kind}`, 1, 3),
    `big_${kind}_8`
]);

function numbered(prefix: string, from: number, to: number): string[] {
    const names: string[] = [];
    for (let index = from; index <= to; index++) names.push(`${prefix}_${index}`);
    return names;
}

/**
 * Lays out an ocean ruin: one building on the sea floor, large or small by the structure's own
 * probability.
 *
 * Java also scatters four to eight satellite ruins around a large one. They are left out, so a
 * large ruin is the single building rather than the cluster.
 */
export const buildOceanRuin: StructureBuilder = (context): StructureLayout | undefined => {
    const middle = chunkMiddle(context.chunkX, context.chunkZ);

    return {
        origin: { x: middle.x, y: context.level.baseHeight(middle.x, middle.z, 'OCEAN_FLOOR_WG'), z: middle.z },
        pieces: () => {
            const warm = context.definition.biome_temp === 'warm';
            const largeProbability = numberAt(context.definition, 'large_probability', 0);
            const large = context.random.nextFloat() <= largeProbability;
            const names = large ? (warm ? BIG_WARM_RUINS : BIG_COLD_RUINS) : warm ? SMALL_WARM_RUINS : SMALL_COLD_RUINS;
            const template = `minecraft:underwater_ruin/${randomOf(names, context.random)}`;

            const base = context.templates.template(template);
            if (base === undefined) return [];

            const rotation = rotationOf(context.random.nextInt(4));
            const placement: Placement = { rotation };
            const size = context.templates.size(template, placement)!;
            const corner: TemplatePosition = [context.chunkX * 16, 0, context.chunkZ * 16];
            const floors = footprintHeights(context, corner, size, 'OCEAN_FLOOR_WG');

            return pieceOf({
                store: context.templates,
                template,
                position: [corner[0], floors.lowest - 1, corner[2]],
                placement,
                onDataMarker: (marker, writer) => {
                    if (marker.value !== 'chest') return;

                    writer.setBlockEntity(marker.x, marker.y - 1, marker.z, {
                        id: 'minecraft:chest',
                        lootTable: large
                            ? 'minecraft:chests/underwater_ruin_big'
                            : 'minecraft:chests/underwater_ruin_small'
                    });
                }
            });
        }
    };
};

// ---------------------------------------------------------------------------
// Nether fossil
// ---------------------------------------------------------------------------

/** The fourteen bone spines a nether fossil is one of. */
const NETHER_FOSSILS = numbered('fossil', 1, 14).map((name) => `minecraft:nether_fossils/${name}`);

/** Lays out a nether fossil: one bone spine at a drawn height in the soul sand valley. */
export const buildNetherFossil: StructureBuilder = (context): StructureLayout | undefined => {
    const middle = chunkMiddle(context.chunkX, context.chunkZ);
    // The drawn height is the generation point's own y, so it is settled before the biome check
    // rather than behind it.
    const y = sampleStructureHeight(context.definition.height, context.random, context.level, context.level.minY);

    return {
        origin: { x: middle.x, y, z: middle.z },
        pieces: () => {
            const rotation = rotationOf(context.random.nextInt(4));
            return pieceOf({
                store: context.templates,
                template: randomOf(NETHER_FOSSILS, context.random),
                position: [context.chunkX * 16, y, context.chunkZ * 16],
                placement: { rotation },
                // Java places a fossil through `BlockIgnoreProcessor.STRUCTURE_AND_AIR`, so the
                // bone blocks go in and the air between them leaves the netherrack alone.
                overwrite: false
            });
        }
    };
};

const numberAt = (definition: Record<string, unknown>, key: string, fallback: number): number =>
    typeof definition[key] === 'number' ? definition[key] : fallback;
