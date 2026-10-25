/**
 * The ruined portal, which is seven of the 52 structures.
 *
 * One of thirteen portal templates, turned, mirrored, aged and dropped onto, into or under the
 * terrain according to the `setups` list the `worldgen/structure` document carries. The seven
 * structures differ only in that list: the desert's is partly buried, the jungle's is mossy and
 * overgrown, the nether's is blackstone, the ocean's and the swamp's sit on the sea floor, and
 * the plain one and the mountain one each draw between two setups.
 *
 * Everything the templates are run through is a processor Java already registers, so the chain
 * is written as an inline `worldgen/processor_list` document rather than as code: the gold block
 * and lava rules, the mossiness, the protected blocks and the lava submersion are all rows in
 * it. The one part that is code is the netherrack Java spreads around the portal's foot, which
 * needs the world.
 *
 * Java's drip columns, vines and overgrowth are left out. They decorate the netherrack and the
 * frame, and each needs a per-chunk walk over the whole bounding box; a portal without them is a
 * whole portal.
 */
import type { BoundingBox, Placement, RandomSource, TemplatePosition } from '@jsprismarine/structures';

import { rotationOf } from './javaStructureJigsaw';
import type { StructureBuildContext, StructureBuilder, StructureLayout } from './javaStructureStarts';
import { TemplatePiece, pivotedCorner } from './javaStructureTemplatePiece';
import type { StructurePiece, StructureWriter } from './javaStructureWorld';

/** Java's six `VerticalPlacement` values, which decide the heightmap and the y search. */
type VerticalPlacement =
    'underground' | 'on_land_surface' | 'partly_buried' | 'on_ocean_floor' | 'in_nether' | 'in_mountain';

/** One entry of a structure's `setups` list. */
interface PortalSetup {
    readonly placement: VerticalPlacement;
    readonly airPocketProbability: number;
    readonly mossiness: number;
    readonly overgrown: boolean;
    readonly vines: boolean;
    readonly canBeCold: boolean;
    readonly replaceWithBlackstone: boolean;
    readonly weight: number;
}

/** The ten ordinary portals. */
const PORTALS = Array.from({ length: 10 }, (_unused, index) => `minecraft:ruined_portal/portal_${index + 1}`);

/** The three giant portals, which one portal in twenty is. */
const GIANT_PORTALS = Array.from(
    { length: 3 },
    (_unused, index) => `minecraft:ruined_portal/giant_portal_${index + 1}`
);

/** How often a portal is a giant one. */
const GIANT_PROBABILITY = 0.05;

/** How far above the dimension floor the y search stops. */
const MIN_Y_INDEX = 15;

/** How far the netherrack spreads from the portal, and how likely it is at each distance. */
const SPREAD_CHANCES = [1, 1, 1, 0.9, 0.9, 0.8, 0.7, 0.6, 0.4, 0.2] as const;

/** Lays out one ruined portal. */
export const buildRuinedPortal: StructureBuilder = (context): StructureLayout | undefined => {
    const setups = setupsOf(context.definition);
    const setup = setups.length === 1 ? setups[0] : weightedSetup(setups, context.random);
    if (setup === undefined) return undefined;

    const airPocket = drawAirPocket(context.random, setup.airPocketProbability);
    const giant = context.random.nextFloat() < GIANT_PROBABILITY;
    const template = pick(giant ? GIANT_PORTALS : PORTALS, context.random);
    const base = context.templates.template(template);
    if (base === undefined) return undefined;

    const placement: Placement = {
        rotation: rotationOf(context.random.nextInt(4)),
        mirror: context.random.nextFloat() < 0.5 ? 'none' : 'front_back'
    };

    const pivot: TemplatePosition = [Math.trunc(base.size[0] / 2), 0, Math.trunc(base.size[2] / 2)];
    const corner = pivotedCorner([context.chunkX * 16, 0, context.chunkZ * 16], base.size, placement, pivot);
    const size = context.templates.size(template, placement)!;
    const box: BoundingBox = {
        minX: corner[0],
        minY: 0,
        minZ: corner[2],
        maxX: corner[0] + size[0] - 1,
        maxY: size[1] - 1,
        maxZ: corner[2] + size[2] - 1
    };

    const heightmap = setup.placement === 'on_ocean_floor' ? 'OCEAN_FLOOR_WG' : 'WORLD_SURFACE_WG';
    const centerX = Math.trunc((box.minX + box.maxX) / 2);
    const centerZ = Math.trunc((box.minZ + box.maxZ) / 2);
    const surface = context.level.baseHeight(centerX, centerZ, heightmap) - 1;
    const y = suitableY(context, setup, airPocket, surface, size[1], box, heightmap);

    const cold = setup.canBeCold && (context.level.coldEnoughToSnow?.(centerX, y, centerZ) ?? false);
    const portal = new TemplatePiece({
        store: context.templates,
        template,
        position: [corner[0], y, corner[2]],
        placement,
        processors: portalProcessors(setup, cold),
        // Java swaps `BlockIgnoreProcessor.STRUCTURE_AND_AIR` in when the portal has no air
        // pocket, which is what lets the terrain fill the gaps in a buried frame.
        overwrite: airPocket
    });
    if (!portal.isPresent) return undefined;

    const pieces: StructurePiece[] = [
        portal,
        new NetherrackSpread({
            box: { ...box, minY: y, maxY: y + size[1] - 1 },
            placement: setup.placement,
            heightmap,
            cold
        })
    ];

    return { pieces, origin: { x: context.chunkX * 16, y, z: context.chunkZ * 16 } };
};

/** Reads the `setups` list, which every ruined portal carries and nothing else does. */
const setupsOf = (definition: Record<string, unknown>): readonly PortalSetup[] => {
    const raw = definition.setups;
    if (!Array.isArray(raw)) return [];

    // Extracted game data: every field is checked rather than trusted.
    return raw.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const record: Record<string, unknown> = entry;
        const placement = record.placement;
        if (typeof placement !== 'string') return [];

        return [
            {
                placement: placement as VerticalPlacement,
                airPocketProbability: numberAt(record, 'air_pocket_probability', 0),
                mossiness: numberAt(record, 'mossiness', 0),
                overgrown: record.overgrown === true,
                vines: record.vines === true,
                canBeCold: record.can_be_cold === true,
                replaceWithBlackstone: record.replace_with_blackstone === true,
                weight: numberAt(record, 'weight', 1)
            }
        ];
    });
};

const numberAt = (source: Record<string, unknown>, key: string, fallback: number): number =>
    typeof source[key] === 'number' ? source[key] : fallback;

/** Draws one setup by weight, which the plain and the mountain portal each need. */
const weightedSetup = (setups: readonly PortalSetup[], random: RandomSource): PortalSetup | undefined => {
    const total = setups.reduce((sum, setup) => sum + setup.weight, 0);
    let remaining = random.nextFloat();
    for (const setup of setups) {
        remaining -= setup.weight / total;
        if (remaining < 0) return setup;
    }
    return setups.at(-1);
};

/** Java's `shouldHaveAirPocket`, which costs no draw at the two ends of the range. */
const drawAirPocket = (random: RandomSource, probability: number): boolean => {
    if (probability === 0) return false;
    if (probability === 1) return true;
    return random.nextFloat() < probability;
};

const pick = <T>(values: readonly T[], random: RandomSource): T => values[random.nextInt(values.length)]!;

/**
 * Java's `findSuitableY`: a starting y per placement, then a downward search for the first level
 * where three of the box's four corner columns are solid.
 */
const suitableY = (
    context: StructureBuildContext,
    setup: PortalSetup,
    airPocket: boolean,
    surface: number,
    ySpan: number,
    box: BoundingBox,
    heightmap: 'WORLD_SURFACE_WG' | 'OCEAN_FLOOR_WG'
): number => {
    const floor = context.level.minY + MIN_Y_INDEX;
    const random = context.random;

    let start: number;
    switch (setup.placement) {
        case 'in_nether':
            start = airPocket
                ? inclusive(random, 32, 100)
                : random.nextFloat() < 0.5
                  ? inclusive(random, 27, 29)
                  : inclusive(random, 29, 100);
            break;
        case 'in_mountain':
            start = withinInterval(random, 70, surface - ySpan);
            break;
        case 'underground':
            start = withinInterval(random, floor, surface - ySpan);
            break;
        case 'partly_buried':
            start = surface - ySpan + inclusive(random, 2, 8);
            break;
        case 'on_land_surface':
        case 'on_ocean_floor':
            start = surface;
            break;
    }

    const corners: readonly (readonly [number, number])[] = [
        [box.minX, box.minZ],
        [box.maxX, box.minZ],
        [box.minX, box.maxZ],
        [box.maxX, box.maxZ]
    ];

    let y = start;
    for (; y > floor; y--) {
        let solid = 0;
        for (const [x, z] of corners) {
            if (!isOpaque(context.level.baseBlock(x, y, z).name, heightmap)) continue;
            if (++solid === 3) return y;
        }
    }

    return y;
};

/**
 * Whether the noise stage's block counts as solid for a heightmap.
 *
 * The noise stage places exactly three things: the dimension's default block, air, and the
 * aquifer's water or lava, so naming those is the same answer as asking the block registry.
 */
const isOpaque = (name: string, heightmap: 'WORLD_SURFACE_WG' | 'OCEAN_FLOOR_WG'): boolean => {
    if (name === 'minecraft:air' || name === 'minecraft:cave_air') return false;
    return heightmap === 'WORLD_SURFACE_WG' || (name !== 'minecraft:water' && name !== 'minecraft:lava');
};

/** Java's `Mth.randomBetweenInclusive`. */
const inclusive = (random: RandomSource, min: number, max: number): number =>
    max <= min ? min : min + random.nextInt(max - min + 1);

/** Java's `getRandomWithinInterval`, which gives up and takes the top of an empty interval. */
const withinInterval = (random: RandomSource, min: number, max: number): number =>
    min < max ? inclusive(random, min, max) : max;

/**
 * The processor chain Java builds for a portal, as the document `createProcessorList` reads.
 *
 * Java assembles the same chain out of `ProcessorRule`, `BlockAgeProcessor`,
 * `ProtectedBlockProcessor`, `LavaSubmergedBlockProcessor` and `BlackstoneReplaceProcessor`.
 * Writing it as data keeps the order visible and reuses the processors the structures package
 * already tests.
 */
const portalProcessors = (setup: PortalSetup, cold: boolean): { processors: readonly unknown[] } => {
    const replace = (block: string, output: string, probability?: number) => ({
        input_predicate:
            probability === undefined
                ? { predicate_type: 'minecraft:block_match', block }
                : { predicate_type: 'minecraft:random_block_match', block, probability },
        location_predicate: { predicate_type: 'minecraft:always_true' },
        output_state: { Name: output }
    });

    const lava =
        setup.placement === 'on_ocean_floor'
            ? replace('minecraft:lava', 'minecraft:magma_block')
            : cold
              ? replace('minecraft:lava', 'minecraft:netherrack')
              : replace('minecraft:lava', 'minecraft:magma_block', 0.2);

    return {
        processors: [
            {
                processor_type: 'minecraft:rule',
                rules: [
                    replace('minecraft:gold_block', 'minecraft:air', 0.3),
                    lava,
                    ...(cold ? [] : [replace('minecraft:netherrack', 'minecraft:magma_block', 0.07)])
                ]
            },
            { processor_type: 'minecraft:block_age', mossiness: setup.mossiness },
            { processor_type: 'minecraft:protected_blocks', value: '#minecraft:features_cannot_replace' },
            { processor_type: 'minecraft:lava_submerged_block' },
            ...(setup.replaceWithBlackstone ? [{ processor_type: 'minecraft:blackstone_replace' }] : [])
        ]
    };
};

/** How a {@link NetherrackSpread} is built. */
interface NetherrackSpreadOptions {
    readonly box: BoundingBox;
    readonly placement: VerticalPlacement;
    readonly heightmap: 'WORLD_SURFACE_WG' | 'OCEAN_FLOOR_WG';
    readonly cold: boolean;
}

/**
 * The netherrack Java spreads around a portal's foot, Java's `spreadNetherrack`.
 *
 * It is a piece of its own because it reads the world rather than a template: for each column in
 * a diamond around the portal it finds the surface, checks that it is within three blocks of the
 * portal's own floor, and replaces what is there.
 */
class NetherrackSpread implements StructurePiece {
    /** @inheritDoc */
    public readonly boundingBox: BoundingBox;

    public constructor(private readonly options: NetherrackSpreadOptions) {
        const reach = SPREAD_CHANCES.length;
        this.boundingBox = {
            minX: options.box.minX - reach,
            minY: options.box.minY - 4,
            minZ: options.box.minZ - reach,
            maxX: options.box.maxX + reach,
            maxY: options.box.maxY + 4,
            maxZ: options.box.maxZ + reach
        };
    }

    /** @inheritDoc */
    public place(writer: StructureWriter, random: RandomSource): void {
        const box = this.options.box;
        const onSurface = this.options.placement === 'on_land_surface' || this.options.placement === 'on_ocean_floor';
        const centerX = Math.trunc((box.minX + box.maxX) / 2);
        const centerZ = Math.trunc((box.minZ + box.maxZ) / 2);
        const reach = SPREAD_CHANCES.length;
        const span = Math.trunc((box.maxX - box.minX + 1 + (box.maxZ - box.minZ + 1)) / 2);
        const shrink = random.nextInt(Math.max(1, 8 - Math.trunc(span / 2)));

        for (let x = centerX - reach; x <= centerX + reach; x++) {
            for (let z = centerZ - reach; z <= centerZ + reach; z++) {
                const distance = Math.max(0, Math.abs(x - centerX) + Math.abs(z - centerZ) + shrink);
                const chance = SPREAD_CHANCES[distance];
                if (chance === undefined || random.nextDouble() >= chance) continue;

                const surface = writer.heightAt(this.options.heightmap, x, z) - 1;
                const y = onSurface ? surface : Math.min(box.minY, surface);
                if (Math.abs(y - box.minY) > 3) continue;
                if (!this.canReplace(writer, x, y, z)) continue;

                const name =
                    !this.options.cold && random.nextFloat() < 0.07 ? 'minecraft:magma_block' : 'minecraft:netherrack';
                writer.setBlock(x, y, z, { name, properties: {} });
            }
        }
    }

    /** Java's `canBlockBeReplacedByNetherrackOrMagma`. */
    private canReplace(writer: StructureWriter, x: number, y: number, z: number): boolean {
        const existing = writer.blockAt(x, y, z);
        if (existing.name === 'minecraft:air' || existing.name === 'minecraft:obsidian') return false;
        if (writer.hasTag(existing.name, 'minecraft:features_cannot_replace')) return false;

        return this.options.placement === 'in_nether' || existing.name !== 'minecraft:lava';
    }
}
