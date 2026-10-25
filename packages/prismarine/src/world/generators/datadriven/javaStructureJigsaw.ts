/**
 * The `minecraft:jigsaw` structure type, which is 28 of the 52.
 *
 * Everything the assembly itself does lives in `@jsprismarine/structures`. This is the layer
 * that reads the `worldgen/structure` document, gives the assembler the terrain it settles
 * against, and turns the pieces it produced into template pieces the chunk can be written from.
 *
 * The five villages, the pillager outpost, the bastion, the ancient city, the trail ruins, the
 * trial chambers and the eighteen abandoned camps are all this one builder.
 */
import type { PlacedPiece, PoolElement, Rotation } from '@jsprismarine/structures';
import { assembleJigsaw, createLegacyRandom, parsePoolAliases } from '@jsprismarine/structures';

import { sampleStructureHeight } from './javaStructureHeight';
import type { StructureBuildContext, StructureBuilder, StructureLayout } from './javaStructureStarts';
import type { ProcessorsReference } from './javaStructureTemplatePiece';
import { TemplatePiece } from './javaStructureTemplatePiece';
import type { StructurePiece } from './javaStructureWorld';

/**
 * The stream the pool alias draws come from.
 *
 * Java forks a positional random off the world seed at the structure's position, which is a
 * stream of its own rather than part of the structure's. This is a stream of its own too, keyed
 * the same way, so the aliases are the same every time a chunk is generated and drawing them
 * never moves the layout.
 */
const aliasRandom = (context: StructureBuildContext) =>
    createLegacyRandom(
        BigInt.asIntN(
            64,
            context.seed + BigInt(context.chunkX) * 341873128712n + BigInt(context.chunkZ) * 132897987541n
        )
    );

/** Java's quarter turns, in the order `Rotation.values()` lists them. */
const ROTATIONS: readonly Rotation[] = ['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'];

/**
 * Lays out one jigsaw structure.
 *
 * The start position is the chunk's minimum block corner, not its middle, which is what decides
 * where a village centers. The `size` field is Java's `maxDepth`.
 */
export const buildJigsawStructure: StructureBuilder = (context): StructureLayout | undefined => {
    const definition = context.definition;
    const startPool = definition.start_pool;
    if (typeof startPool !== 'string') return undefined;

    const startY = sampleStructureHeight(definition.start_height, context.random, context.level, 0);
    const startJigsawName = definition.start_jigsaw_name;
    const heightmap = definition.project_start_to_heightmap;

    const assembly = assembleJigsaw(
        {
            startPool,
            maxDepth: typeof definition.size === 'number' ? definition.size : 0,
            startPosition: [context.chunkX * 16, startY, context.chunkZ * 16],
            ...(typeof startJigsawName === 'string' ? { startJigsawName } : {}),
            ...(typeof definition.max_distance_from_center === 'number'
                ? { maxDistanceFromCenter: definition.max_distance_from_center }
                : {}),
            ...(typeof heightmap === 'string' ? { projectStartToHeightmap: heightmap } : {}),
            useExpansionHack: definition.use_expansion_hack === true
        },
        {
            pool: context.pool,
            template: (location) => context.templates.template(location),
            random: context.random,
            poolAliases: parsePoolAliases(definition.pool_aliases, aliasRandom(context)),
            terrainHeight: (x, z, name) => context.level.baseHeight(x, z, asHeightmap(name))
        }
    );

    const origin = assembly.origin;
    if (origin === undefined) return undefined;

    const pieces = assembly.pieces.flatMap((piece) => piecesOf(piece, context));
    return pieces.length === 0 ? undefined : { pieces, origin: { x: origin[0], y: origin[1], z: origin[2] } };
};

/**
 * The writable pieces one placed pool element becomes.
 *
 * A single element is one template. A list element is every member stamped at the same position,
 * in list order, which is how Java's `ListPoolElement` places. An empty element writes nothing,
 * and a feature element is not placed here: it names a `placed_feature`, which the decoration
 * pass runs rather than the structure.
 */
const piecesOf = (placed: PlacedPiece, context: StructureBuildContext): StructurePiece[] =>
    membersOf(placed.element).flatMap((element) => {
        const location = element.location;
        if (location === undefined) return [];

        const piece = new TemplatePiece({
            store: context.templates,
            template: location,
            position: placed.position,
            placement: { rotation: placed.rotation },
            ...(element.processors === undefined
                ? {}
                : { processors: element.processors satisfies ProcessorsReference })
        });

        return piece.isPresent ? [piece] : [];
    });

/** A list element's members in order, or the element itself for every other type. */
const membersOf = (element: PoolElement): readonly PoolElement[] =>
    element.type === 'minecraft:list_pool_element' ? (element.elements ?? []) : [element];

/** Java's `Heightmap.Types` names, which the assembler passes through as plain strings. */
const asHeightmap = (name: string) =>
    name === 'WORLD_SURFACE' ||
    name === 'WORLD_SURFACE_WG' ||
    name === 'OCEAN_FLOOR' ||
    name === 'OCEAN_FLOOR_WG' ||
    name === 'MOTION_BLOCKING' ||
    name === 'MOTION_BLOCKING_NO_LEAVES'
        ? name
        : ('WORLD_SURFACE_WG' as const);

/** The rotation a quarter-turn count names, for a caller that has the number rather than the name. */
export const rotationOf = (quarterTurns: number): Rotation => ROTATIONS[((quarterTurns % 4) + 4) % 4] ?? 'none';
