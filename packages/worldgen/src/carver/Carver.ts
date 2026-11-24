import type { BiomeResolver } from '../biome/BiomeSource';
import { typeName } from '../identifier';
import { f32, floor } from '../math';
import { LegacyRandomSource } from '../random/LegacyRandomSource';
import type { RandomSource } from '../random/RandomSource';
import { asLong } from '../random/randomSupport';
import type { WorldGenerationContext } from '../surface/VerticalAnchor';
import type { CarverOutput } from './CarvingMask';
import type { FloatProvider, HeightProvider, IntProvider } from './providers';
import {
    parseFloatProvider,
    parseHeightProvider,
    parseIntProvider,
    sampleFloat,
    sampleHeight,
    sampleInt
} from './providers';
import type { MthTrig } from './trig';
import { randomBetween, ROUNDING_MTH_TRIG, SINCE_ROUNDED_MTH_TRIG, TRUNCATING_MTH_TRIG } from './trig';
import { readsSince } from '../dataPackFormat';
import { asObject, number } from '../json';
import { WorldgenErrors } from '@jsprismarine/errors/worldgen';

/** How many chunks away from the target chunk a carver can start, in each direction. */
export const CARVER_RANGE = 4;

/** How far a tunnel walks before it gives up, in blocks. */
const MAX_TUNNEL_DISTANCE = (CARVER_RANGE * 2 - 1) * 16;

/** A `minecraft:cave` carver, which digs rooms and branching tunnels. */
export interface CaveCarverConfig {
    /** The carver type. */
    readonly type: 'cave';
    /** The chance a chunk starts one of these at all. */
    readonly probability: number;
    /** Where a cave starts vertically. */
    readonly y: HeightProvider;
    /** How many caves one starting chunk digs. */
    readonly count: IntProvider;
    /** How wide a tunnel is at its middle. */
    readonly thickness: FloatProvider;
    /** Whether one tunnel in ten gets a randomly widened thickness. */
    readonly weirdThicknessBias: boolean;
    /** How tall a room is relative to its width. */
    readonly roomVerticalRadiusMultiplier: FloatProvider;
    /** A per-cave factor on every tunnel's width. */
    readonly horizontalRadiusMultiplier: FloatProvider;
    /** A per-cave factor on every tunnel's height. */
    readonly verticalRadiusMultiplier: FloatProvider;
    /** A factor on the first tunnel's height, which the nether raises to five. */
    readonly startVerticalRadiusMultiplier: FloatProvider;
    /** How much of the bottom of a tunnel stays solid, as a fraction of its height. */
    readonly floorLevel: FloatProvider;
    /** Set when the target reads 26.4's rounding `Mth.sin` and `Mth.cos`; see {@link SINCE_ROUNDED_MTH_TRIG}. */
    readonly roundedTrig?: true;
}

/** The shape fields of a `minecraft:canyon` carver. */
export interface CanyonShape {
    /** A factor on how far the canyon walks. */
    readonly distanceFactor: FloatProvider;
    /** How wide the canyon is at its middle. */
    readonly thickness: FloatProvider;
    /** One step in this many changes the wall width, so a higher value is smoother. */
    readonly widthSmoothness: number;
    /** A per-step factor on the width. */
    readonly horizontalRadiusFactor: FloatProvider;
    /** The height factor applied along the whole canyon. */
    readonly verticalRadiusDefaultFactor: number;
    /** The extra height factor applied at the canyon's middle. */
    readonly verticalRadiusCenterFactor: number;
    /** How tall the canyon is relative to its width. */
    readonly yScale: FloatProvider;
}

/** A `minecraft:canyon` carver, which digs one long ravine. */
export interface CanyonCarverConfig {
    /** The carver type. */
    readonly type: 'canyon';
    /** The chance a chunk starts one of these at all. */
    readonly probability: number;
    /** Where the canyon starts vertically. */
    readonly y: HeightProvider;
    /** The initial pitch of the canyon. */
    readonly verticalRotation: FloatProvider;
    /** The shape fields. */
    readonly shape: CanyonShape;
    /** Set when the target reads 26.4's rounding `Mth.sin` and `Mth.cos`; see {@link SINCE_ROUNDED_MTH_TRIG}. */
    readonly roundedTrig?: true;
}

/** Either carver type 26.3 registers. */
export type CarverConfig = CaveCarverConfig | CanyonCarverConfig;

const optionalFloatProvider = (value: unknown, path: string, fallback: number): FloatProvider =>
    value === undefined ? { type: 'constant', value: f32(fallback) } : parseFloatProvider(value, path);

/** The release trig a carver walks with. A flag rather than the functions keeps the config plain data. */
const trigOf = (config: CarverConfig): MthTrig => (config.roundedTrig ? ROUNDING_MTH_TRIG : TRUNCATING_MTH_TRIG);

/**
 * Reads one `worldgen/carver` document.
 *
 * 26.3 flattened the `config` object the older schema wrapped these fields in, so a loader
 * written against 1.21 data does not read this.
 *
 * @param format - The target's data pack format major, which picks the release's `Mth.sin` and
 *   `Mth.cos`; undefined reads as the default release.
 * @throws When the type is unknown or a field is missing.
 */
export const parseCarver = (source: unknown, path = '<carver>', format?: number): CarverConfig => {
    const raw = asObject(source, path);
    const type = typeName(raw['type']);
    const trig = readsSince(format, SINCE_ROUNDED_MTH_TRIG) ? ({ roundedTrig: true } as const) : {};
    if (type === 'cave') {
        return {
            type: 'cave',
            probability: f32(number(raw['probability'], `${path}.probability`)),
            y: parseHeightProvider(raw['y'], `${path}.y`),
            count: parseIntProvider(raw['count'], `${path}.count`),
            thickness: parseFloatProvider(raw['thickness'], `${path}.thickness`),
            weirdThicknessBias: raw['weird_thickness_bias'] === true,
            roomVerticalRadiusMultiplier: parseFloatProvider(
                raw['room_vertical_radius_multiplier'],
                `${path}.room_vertical_radius_multiplier`
            ),
            horizontalRadiusMultiplier: parseFloatProvider(
                raw['horizontal_radius_multiplier'],
                `${path}.horizontal_radius_multiplier`
            ),
            verticalRadiusMultiplier: parseFloatProvider(
                raw['vertical_radius_multiplier'],
                `${path}.vertical_radius_multiplier`
            ),
            startVerticalRadiusMultiplier: optionalFloatProvider(
                raw['start_vertical_radius_multiplier'],
                `${path}.start_vertical_radius_multiplier`,
                1
            ),
            floorLevel: parseFloatProvider(raw['floor_level'], `${path}.floor_level`),
            ...trig
        };
    }
    if (type === 'canyon') {
        const shape = asObject(raw['shape'], `${path}.shape`);
        const smoothness = shape['width_smoothness'];
        if (typeof smoothness !== 'number' || !Number.isInteger(smoothness) || smoothness <= 0) {
            throw new WorldgenErrors.InvalidWidthSmoothness({ path });
        }
        return {
            type: 'canyon',
            probability: f32(number(raw['probability'], `${path}.probability`)),
            y: parseHeightProvider(raw['y'], `${path}.y`),
            verticalRotation: parseFloatProvider(raw['vertical_rotation'], `${path}.vertical_rotation`),
            shape: {
                distanceFactor: parseFloatProvider(shape['distance_factor'], `${path}.shape.distance_factor`),
                thickness: parseFloatProvider(shape['thickness'], `${path}.shape.thickness`),
                widthSmoothness: smoothness,
                horizontalRadiusFactor: parseFloatProvider(
                    shape['horizontal_radius_factor'],
                    `${path}.shape.horizontal_radius_factor`
                ),
                verticalRadiusDefaultFactor: f32(
                    number(shape['vertical_radius_default_factor'], `${path}.shape.vertical_radius_default_factor`)
                ),
                verticalRadiusCenterFactor: f32(
                    number(shape['vertical_radius_center_factor'], `${path}.shape.vertical_radius_center_factor`)
                ),
                yScale: parseFloatProvider(shape['y_scale'], `${path}.shape.y_scale`)
            },
            ...trig
        };
    }
    throw new WorldgenErrors.UnknownCarverType({ path, type: JSON.stringify(raw['type']) });
};

/** Whether a position inside the ellipsoid stays solid. */
/** Whether an ellipsoid leaves one block of its box alone, from the block's offsets in radii and its y. */
export type SkipChecker = (xd: number, yd: number, zd: number, y: number) => boolean;

/** Opens an ellipsoid of blocks, clipped to the target chunk. */
const carveEllipsoid = (
    chunkX: number,
    chunkZ: number,
    x: number,
    y: number,
    z: number,
    horizontalRadius: number,
    verticalRadius: number,
    output: CarverOutput,
    skip: SkipChecker
): void => {
    const centerX = chunkX * 16 + 8;
    const centerZ = chunkZ * 16 + 8;
    const maxDelta = 16 + horizontalRadius * 2;
    if (Math.abs(x - centerX) > maxDelta || Math.abs(z - centerZ) > maxDelta) return;

    const chunkMinX = chunkX * 16;
    const chunkMinZ = chunkZ * 16;
    const minXIndex = Math.max(floor(x - horizontalRadius) - chunkMinX - 1, 0);
    const maxXIndex = Math.min(floor(x + horizontalRadius) - chunkMinX, 15);
    const minY = Math.max(floor(y - verticalRadius) - 1, output.minY);
    const maxY = Math.min(floor(y + verticalRadius) + 1, output.maxY);
    const minZIndex = Math.max(floor(z - horizontalRadius) - chunkMinZ - 1, 0);
    const maxZIndex = Math.min(floor(z + horizontalRadius) - chunkMinZ, 15);

    for (let xIndex = minXIndex; xIndex <= maxXIndex; xIndex++) {
        const xd = (chunkMinX + xIndex + 0.5 - x) / horizontalRadius;
        for (let zIndex = minZIndex; zIndex <= maxZIndex; zIndex++) {
            const zd = (chunkMinZ + zIndex + 0.5 - z) / horizontalRadius;
            if (xd * xd + zd * zd >= 1) continue;
            for (let worldY = maxY; worldY > minY; worldY--) {
                const yd = (worldY - 0.5 - y) / verticalRadius;
                if (!skip(xd, yd, zd, worldY)) output.carve(xIndex, worldY, zIndex);
            }
        }
    }
};

/** Whether a tunnel that has `totalSteps - currentStep` steps left can still reach the chunk. */
const canReach = (
    chunkX: number,
    chunkZ: number,
    x: number,
    z: number,
    currentStep: number,
    totalSteps: number,
    thickness: number
): boolean => {
    const xd = x - (chunkX * 16 + 8);
    const zd = z - (chunkZ * 16 + 8);
    const remaining = totalSteps - currentStep;
    const reach = thickness + 2 + 16;
    return xd * xd + zd * zd - remaining * remaining <= reach * reach;
};

const caveSkip = (xd: number, yd: number, zd: number, floorLevel: number): boolean =>
    yd <= floorLevel ? true : xd * xd + yd * yd + zd * zd >= 1;

/** The numbers of one {@link CarvePlan} event: kind, jump, x, y, z, radii, skip, then the reach inputs. */
const EVENT_WORDS = 11;
/** An ellipsoid every target chunk carves, a cave's room. */
const EVENT_CARVE = 0;
/** An ellipsoid a target chunk carves only while the tunnel can still reach it. */
const EVENT_REACHING_CARVE = 1;
/** The start of a tunnel; its jump is the first event after the tunnel and its branches. */
const EVENT_TUNNEL = 2;

/**
 * Where a source chunk's carvers open blocks, independent of the chunk being carved.
 *
 * A carver's walk draws from randoms seeded by its source chunk alone, so it is the same for
 * every chunk within eight of it. Only two steps read the target: `canReach`, which ends a tunnel
 * once it can no longer reach the target, and the ellipsoid, which clips to it. A plan records the
 * whole walk once, and {@link replay} applies those two steps for one target.
 */
export interface CarvePlan {
    /**
     * Carves one target chunk: every room, and each tunnel's ellipsoids until the tunnel can no
     * longer reach the chunk, which also drops the branches it would have split into.
     */
    replay(chunkX: number, chunkZ: number, output: CarverOutput): void;
    /** The bytes the plan holds, which a cache of plans budgets by. */
    readonly byteLength: number;
}

/**
 * A {@link CarvePlan} as a flat list of events, {@link EVENT_WORDS} numbers each, in the order Java
 * carves them. Only {@link CarvePlanRecorder} builds one, so the events always nest and jump
 * forward.
 */
class RecordedCarvePlan implements CarvePlan {
    public constructor(
        private readonly events: Float64Array,
        /** The skip checks the events name, one per cave or canyon. */
        private readonly skips: readonly SkipChecker[]
    ) {}

    public get byteLength(): number {
        return this.events.byteLength;
    }

    public replay(chunkX: number, chunkZ: number, output: CarverOutput): void {
        this.replayEvents(0, this.events.length / EVENT_WORDS, chunkX, chunkZ, output);
    }

    private replayEvents(from: number, to: number, chunkX: number, chunkZ: number, output: CarverOutput): void {
        const events = this.events;
        for (let event = from; event < to;) {
            const at = event * EVENT_WORDS;
            const kind = events[at]!;
            if (kind === EVENT_TUNNEL) {
                const after = events[at + 1]!;
                this.replayEvents(event + 1, after, chunkX, chunkZ, output);
                event = after;
                continue;
            }
            // Where the walk found the tunnel could no longer reach the target, it stopped.
            if (
                kind === EVENT_REACHING_CARVE &&
                !canReach(
                    chunkX,
                    chunkZ,
                    events[at + 2]!,
                    events[at + 4]!,
                    events[at + 8]!,
                    events[at + 9]!,
                    events[at + 10]!
                )
            ) {
                return;
            }
            carveEllipsoid(
                chunkX,
                chunkZ,
                events[at + 2]!,
                events[at + 3]!,
                events[at + 4]!,
                events[at + 5]!,
                events[at + 6]!,
                output,
                this.skips[events[at + 7]!]!
            );
            event++;
        }
    }
}

/** Builds a {@link CarvePlan} as a carver walks. */
class CarvePlanRecorder {
    private readonly words: number[] = [];
    private readonly skips: SkipChecker[] = [];

    public skip(check: SkipChecker): number {
        return this.skips.push(check) - 1;
    }

    public carve(
        x: number,
        y: number,
        z: number,
        horizontalRadius: number,
        verticalRadius: number,
        skip: number
    ): void {
        this.words.push(EVENT_CARVE, 0, x, y, z, horizontalRadius, verticalRadius, skip, 0, 0, 0);
    }

    public reachingCarve(
        step: number,
        distance: number,
        thickness: number,
        x: number,
        y: number,
        z: number,
        horizontalRadius: number,
        verticalRadius: number,
        skip: number
    ): void {
        this.words.push(
            EVENT_REACHING_CARVE,
            0,
            x,
            y,
            z,
            horizontalRadius,
            verticalRadius,
            skip,
            step,
            distance,
            thickness
        );
    }

    /** Opens a tunnel and returns its event, which {@link end} closes. */
    public begin(): number {
        this.words.push(EVENT_TUNNEL, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        return this.words.length / EVENT_WORDS - 1;
    }

    public end(tunnel: number): void {
        this.words[tunnel * EVENT_WORDS + 1] = this.words.length / EVENT_WORDS;
    }

    public finish(): CarvePlan {
        return new RecordedCarvePlan(Float64Array.from(this.words), this.skips);
    }
}

/** Records the ellipsoids of one started carver of a source chunk. */
const recordCarver = (
    config: CarverConfig,
    context: WorldGenerationContext,
    random: RandomSource,
    sourceChunkX: number,
    sourceChunkZ: number
): CarvePlan => {
    const plan = new CarvePlanRecorder();
    if (config.type === 'cave') recordCave(config, context, random, sourceChunkX, sourceChunkZ, plan);
    else recordCanyon(config, context, random, sourceChunkX, sourceChunkZ, plan);
    return plan.finish();
};

/** Records the plans of a source chunk's started carvers, in their start order. */
const recordPlans = (
    seed: bigint,
    source: SourceChunkCarvers,
    context: WorldGenerationContext,
    sourceChunkX: number,
    sourceChunkZ: number
): CarvePlan[] =>
    source.started.map((index) => {
        const config = source.carvers[index] as CarverConfig;
        // The carver draws on from where its start draw left the random.
        const random = largeFeatureRandom(asLong(seed + BigInt(index)), sourceChunkX, sourceChunkZ);
        isStartChunk(config, random);
        return recordCarver(config, context, random, sourceChunkX, sourceChunkZ);
    });

const createTunnel = (
    config: CaveCarverConfig,
    tunnelSeed: bigint,
    startX: number,
    startY: number,
    startZ: number,
    horizontalRadiusMultiplier: number,
    verticalRadiusMultiplier: number,
    thickness: number,
    startHorizontalRotation: number,
    startVerticalRotation: number,
    step: number,
    dist: number,
    yScale: number,
    plan: CarvePlanRecorder,
    skip: number
): void => {
    const tunnel = plan.begin();
    const trig = trigOf(config);
    const random = new LegacyRandomSource(tunnelSeed);
    const splitPoint = random.nextIntBounded(Math.trunc(dist / 2)) + Math.trunc(dist / 4);
    const steep = random.nextIntBounded(6) === 0;
    let x = startX;
    let y = startY;
    let z = startZ;
    let horizontalRotation = startHorizontalRotation;
    let verticalRotation = startVerticalRotation;
    let yRota = 0;
    let xRota = 0;

    for (let currentStep = step; currentStep < dist; currentStep++) {
        const horizontalRadius = 1.5 + f32(trig.sin(f32(f32(f32(Math.PI) * currentStep) / dist)) * thickness);
        const verticalRadius = horizontalRadius * yScale;
        const cosX = trig.cos(verticalRotation);
        x += f32(trig.cos(horizontalRotation) * cosX);
        y += trig.sin(verticalRotation);
        z += f32(trig.sin(horizontalRotation) * cosX);
        verticalRotation = f32(verticalRotation * (steep ? f32(0.92) : f32(0.7)));
        verticalRotation = f32(verticalRotation + f32(xRota * f32(0.1)));
        horizontalRotation = f32(horizontalRotation + f32(yRota * f32(0.1)));
        xRota = f32(xRota * f32(0.9));
        yRota = f32(yRota * f32(0.75));
        xRota = f32(xRota + f32(f32(f32(random.nextFloat() - random.nextFloat()) * random.nextFloat()) * 2));
        yRota = f32(yRota + f32(f32(f32(random.nextFloat() - random.nextFloat()) * random.nextFloat()) * 4));

        if (currentStep === splitPoint && thickness > 1) {
            const halfPi = f32(Math.PI / 2);
            createTunnel(
                config,
                random.nextLong(),
                x,
                y,
                z,
                horizontalRadiusMultiplier,
                verticalRadiusMultiplier,
                f32(f32(random.nextFloat() * f32(0.5)) + f32(0.5)),
                f32(horizontalRotation - halfPi),
                f32(verticalRotation / 3),
                currentStep,
                dist,
                1,
                plan,
                skip
            );
            createTunnel(
                config,
                random.nextLong(),
                x,
                y,
                z,
                horizontalRadiusMultiplier,
                verticalRadiusMultiplier,
                f32(f32(random.nextFloat() * f32(0.5)) + f32(0.5)),
                f32(horizontalRotation + halfPi),
                f32(verticalRotation / 3),
                currentStep,
                dist,
                1,
                plan,
                skip
            );
            plan.end(tunnel);
            return;
        }

        if (random.nextIntBounded(4) === 0) continue;
        plan.reachingCarve(
            currentStep,
            dist,
            thickness,
            x,
            y,
            z,
            horizontalRadius * horizontalRadiusMultiplier,
            verticalRadius * verticalRadiusMultiplier,
            skip
        );
    }
    plan.end(tunnel);
};

const recordCave = (
    config: CaveCarverConfig,
    context: WorldGenerationContext,
    random: RandomSource,
    sourceChunkX: number,
    sourceChunkZ: number,
    plan: CarvePlanRecorder
): void => {
    const caveCount = sampleInt(config.count, random);
    for (let cave = 0; cave < caveCount; cave++) {
        const x = sourceChunkX * 16 + random.nextIntBounded(16);
        const y = sampleHeight(config.y, random, context);
        const z = sourceChunkZ * 16 + random.nextIntBounded(16);
        const horizontalRadiusMultiplier = sampleFloat(config.horizontalRadiusMultiplier, random);
        const verticalRadiusMultiplier = sampleFloat(config.verticalRadiusMultiplier, random);
        const startVerticalRadiusMultiplier = sampleFloat(config.startVerticalRadiusMultiplier, random);
        const floorLevel = sampleFloat(config.floorLevel, random);
        const skip = plan.skip((xd, yd, zd) => caveSkip(xd, yd, zd, floorLevel));

        let tunnels = 1;
        if (random.nextIntBounded(4) === 0) {
            const yScale = sampleFloat(config.roomVerticalRadiusMultiplier, random);
            const roomThickness = f32(1 + f32(random.nextFloat() * 6));
            const horizontalRadius = 1.5 + f32(trigOf(config).sin(f32(Math.PI / 2)) * roomThickness);
            plan.carve(x + 1, y, z, horizontalRadius, horizontalRadius * yScale, skip);
            tunnels += random.nextIntBounded(4);
        }

        for (let tunnel = 0; tunnel < tunnels; tunnel++) {
            const horizontalRotation = f32(random.nextFloat() * f32(Math.PI * 2));
            const verticalRotation = f32(f32(random.nextFloat() - 0.5) / 4);
            let thickness = sampleFloat(config.thickness, random);
            if (config.weirdThicknessBias && random.nextIntBounded(10) === 0) {
                thickness = f32(thickness * f32(f32(f32(random.nextFloat() * random.nextFloat()) * 3) + 1));
            }
            const distance = MAX_TUNNEL_DISTANCE - random.nextIntBounded(Math.trunc(MAX_TUNNEL_DISTANCE / 4));
            createTunnel(
                config,
                random.nextLong(),
                x,
                y,
                z,
                horizontalRadiusMultiplier,
                verticalRadiusMultiplier,
                thickness,
                horizontalRotation,
                verticalRotation,
                0,
                distance,
                startVerticalRadiusMultiplier,
                plan,
                skip
            );
        }
    }
};

const recordCanyon = (
    config: CanyonCarverConfig,
    context: WorldGenerationContext,
    random: RandomSource,
    sourceChunkX: number,
    sourceChunkZ: number,
    plan: CarvePlanRecorder
): void => {
    const startX = sourceChunkX * 16 + random.nextIntBounded(16);
    const startY = sampleHeight(config.y, random, context);
    const startZ = sourceChunkZ * 16 + random.nextIntBounded(16);
    const startHorizontalRotation = f32(random.nextFloat() * f32(Math.PI * 2));
    const startVerticalRotation = sampleFloat(config.verticalRotation, random);
    const yScale = sampleFloat(config.shape.yScale, random);
    const thickness = sampleFloat(config.shape.thickness, random);
    const distance = Math.trunc(f32(MAX_TUNNEL_DISTANCE * sampleFloat(config.shape.distanceFactor, random)));

    const tunnelRandom = new LegacyRandomSource(random.nextLong());
    const widthFactorPerHeight = new Float32Array(context.genDepth);
    let widthFactor = 1;
    for (let index = 0; index < context.genDepth; index++) {
        if (index === 0 || tunnelRandom.nextIntBounded(config.shape.widthSmoothness) === 0) {
            widthFactor = f32(1 + f32(tunnelRandom.nextFloat() * tunnelRandom.nextFloat()));
        }
        widthFactorPerHeight[index] = f32(widthFactor * widthFactor);
    }

    const skip = plan.skip(
        (xd, yd, zd, y) =>
            (xd * xd + zd * zd) * (widthFactorPerHeight[y - context.minGenY - 1] as number) + (yd * yd) / 6 >= 1
    );
    const tunnel = plan.begin();
    const trig = trigOf(config);

    let x = startX;
    let y = startY;
    let z = startZ;
    let horizontalRotation = startHorizontalRotation;
    let verticalRotation = startVerticalRotation;
    let yRota = 0;
    let xRota = 0;

    for (let currentStep = 0; currentStep < distance; currentStep++) {
        let horizontalRadius = 1.5 + f32(trig.sin(f32(f32(currentStep * f32(Math.PI)) / distance)) * thickness);
        let verticalRadius = horizontalRadius * yScale;
        horizontalRadius *= sampleFloat(config.shape.horizontalRadiusFactor, tunnelRandom);

        const verticalMultiplier = f32(1 - f32(Math.abs(f32(0.5 - f32(currentStep / distance))) * 2));
        const factor = f32(
            config.shape.verticalRadiusDefaultFactor + f32(config.shape.verticalRadiusCenterFactor * verticalMultiplier)
        );
        verticalRadius = factor * verticalRadius * randomBetween(tunnelRandom.nextFloat(), f32(0.75), 1);

        const cosX = trig.cos(verticalRotation);
        const sinX = trig.sin(verticalRotation);
        x += f32(trig.cos(horizontalRotation) * cosX);
        y += sinX;
        z += f32(trig.sin(horizontalRotation) * cosX);
        verticalRotation = f32(verticalRotation * f32(0.7));
        verticalRotation = f32(verticalRotation + f32(xRota * f32(0.05)));
        horizontalRotation = f32(horizontalRotation + f32(yRota * f32(0.05)));
        xRota = f32(xRota * f32(0.8));
        yRota = f32(yRota * f32(0.5));
        xRota = f32(
            xRota + f32(f32(f32(tunnelRandom.nextFloat() - tunnelRandom.nextFloat()) * tunnelRandom.nextFloat()) * 2)
        );
        yRota = f32(
            yRota + f32(f32(f32(tunnelRandom.nextFloat() - tunnelRandom.nextFloat()) * tunnelRandom.nextFloat()) * 4)
        );

        if (tunnelRandom.nextIntBounded(4) === 0) continue;
        plan.reachingCarve(currentStep, distance, thickness, x, y, z, horizontalRadius, verticalRadius, skip);
    }
    plan.end(tunnel);
};

/** Whether a chunk starts this carver, which is the first draw the carver's random makes. */
export const isStartChunk = (config: CarverConfig, random: RandomSource): boolean =>
    random.nextFloat() <= config.probability;

/**
 * Seeds the random of one carver in one source chunk, which is Java's
 * `WorldgenRandom.setLargeFeatureSeed`.
 *
 * @param seed - The world seed plus the carver's index in the biome's carver list.
 */
export const largeFeatureRandom = (seed: bigint, chunkX: number, chunkZ: number): RandomSource => {
    const first = new LegacyRandomSource(seed);
    const xScale = first.nextLong();
    const zScale = first.nextLong();
    return new LegacyRandomSource(
        asLong(asLong(asLong(BigInt(chunkX) * xScale) ^ asLong(BigInt(chunkZ) * zScale)) ^ seed)
    );
};

/** What {@link carveChunk} needs to sweep the chunks around one target chunk. */
export interface CarveChunkOptions {
    /** The world seed. */
    readonly seed: bigint;
    /** The chunk x being carved, in chunks. */
    readonly chunkX: number;
    /** The chunk z being carved, in chunks. */
    readonly chunkZ: number;
    /** The carvers a source chunk's biome lists, in the order the biome lists them. */
    readonly carversAt: (sourceChunkX: number, sourceChunkZ: number) => readonly CarverConfig[];
    /** The dimension extent, which the height providers resolve against. */
    readonly context: WorldGenerationContext;
    /** Where the openings are recorded. */
    readonly output: CarverOutput;
    /**
     * Which carvers start in each source chunk and the plans of their walks, kept across calls for
     * the same seed and `carversAt`. Without it the sweep decides and walks all 289 source chunks
     * afresh.
     */
    readonly starts?: CarverStarts;
}

/** The carvers one source chunk lists, and which of them start there. */
export interface SourceChunkCarvers {
    readonly carvers: readonly CarverConfig[];
    /** Indices into {@link carvers} of the ones whose start draw succeeds, in list order. */
    readonly started: readonly number[];
}

/** Remembers {@link SourceChunkCarvers} per source chunk. */
export interface CarverStarts {
    at(sourceChunkX: number, sourceChunkZ: number): SourceChunkCarvers;
    /**
     * The plans of a source chunk's started carvers, in {@link SourceChunkCarvers.started}'s
     * order, recorded on first use and kept for the chunks around it. Optional: without it,
     * {@link carveChunk} records them from {@link at} on each call.
     */
    plansAt?(sourceChunkX: number, sourceChunkZ: number, context: WorldGenerationContext): readonly CarvePlan[];
}

/** A {@link CarverStarts} that keeps the plans too, as {@link createCarverStarts} makes it. */
export interface CarverPlanStarts extends CarverStarts {
    plansAt(sourceChunkX: number, sourceChunkZ: number, context: WorldGenerationContext): readonly CarvePlan[];
}

/** Source chunks whose plans a {@link CarverStarts} keeps, direct-mapped on the low five bits of x and z. */
const CARVE_PLAN_SLOTS = 32 * 32;

/**
 * The most plan bytes one {@link CarverStarts} keeps. A vanilla plan holds about 23 KB, and a
 * quarter of source chunks start a carver, so the table stays near 6 MB; a data pack's carver with
 * a large count or probability records bigger plans, which replay as usual but are not kept once
 * the budget is spent.
 */
const CARVE_PLAN_BUDGET_BYTES = 16 * 1024 * 1024;

/** Source chunks a {@link CarverStarts} holds, direct-mapped on the low six bits of x and z. */
const CARVER_START_SLOTS = 64 * 64;

/**
 * Creates the memory {@link carveChunk} reads which carvers start where.
 *
 * Each source chunk's start draws are a function of the seed, the carver's index and the chunk
 * alone, and every chunk within eight of it sweeps it again: up to 289 times, each a BigInt
 * random per carver. A colliding chunk evicts the slot, and the stored coordinates are compared
 * before an answer is reused, so an eviction costs a recomputation and never an answer.
 */
export const createCarverStarts = (seed: bigint, carversAt: CarveChunkOptions['carversAt']): CarverPlanStarts => {
    const keyX = new Int32Array(CARVER_START_SLOTS);
    const keyZ = new Int32Array(CARVER_START_SLOTS);
    const entries = new Array<SourceChunkCarvers | undefined>(CARVER_START_SLOTS);
    const planKeyX = new Int32Array(CARVE_PLAN_SLOTS);
    const planKeyZ = new Int32Array(CARVE_PLAN_SLOTS);
    // A plan's geometry depends on the extent its height providers resolved against.
    const planMinY = new Int32Array(CARVE_PLAN_SLOTS);
    const planDepth = new Int32Array(CARVE_PLAN_SLOTS);
    const planBytes = new Float64Array(CARVE_PLAN_SLOTS);
    const plans = new Array<readonly CarvePlan[] | undefined>(CARVE_PLAN_SLOTS);
    let retainedBytes = 0;
    const starts: CarverPlanStarts = {
        plansAt: (sourceChunkX, sourceChunkZ, context) => {
            const slot = (sourceChunkX & 31) | ((sourceChunkZ & 31) << 5);
            const cached = plans[slot];
            if (
                cached !== undefined &&
                planKeyX[slot] === sourceChunkX &&
                planKeyZ[slot] === sourceChunkZ &&
                planMinY[slot] === context.minGenY &&
                planDepth[slot] === context.genDepth
            ) {
                return cached;
            }

            const recorded = recordPlans(
                seed,
                starts.at(sourceChunkX, sourceChunkZ),
                context,
                sourceChunkX,
                sourceChunkZ
            );
            const bytes = recorded.reduce((sum, plan) => sum + plan.byteLength, 0);
            // The slot's old plans leave either way; the new ones stay only within the budget.
            retainedBytes -= planBytes[slot]!;
            plans[slot] = undefined;
            planBytes[slot] = 0;
            if (retainedBytes + bytes <= CARVE_PLAN_BUDGET_BYTES) {
                planKeyX[slot] = sourceChunkX;
                planKeyZ[slot] = sourceChunkZ;
                planMinY[slot] = context.minGenY;
                planDepth[slot] = context.genDepth;
                planBytes[slot] = bytes;
                plans[slot] = recorded;
                retainedBytes += bytes;
            }
            return recorded;
        },
        at: (sourceChunkX, sourceChunkZ) => {
            const slot = (sourceChunkX & 63) | ((sourceChunkZ & 63) << 6);
            const cached = entries[slot];
            if (cached !== undefined && keyX[slot] === sourceChunkX && keyZ[slot] === sourceChunkZ) return cached;

            const carvers = carversAt(sourceChunkX, sourceChunkZ);
            const started: number[] = [];
            for (let index = 0; index < carvers.length; index++) {
                const random = largeFeatureRandom(asLong(seed + BigInt(index)), sourceChunkX, sourceChunkZ);
                if (isStartChunk(carvers[index] as CarverConfig, random)) started.push(index);
            }
            const entry = { carvers, started };
            keyX[slot] = sourceChunkX;
            keyZ[slot] = sourceChunkZ;
            entries[slot] = entry;
            return entry;
        }
    };
    return starts;
};

/**
 * Picks a source chunk's carvers from its noise biome, the way Java's
 * `NoiseBasedChunkGenerator.getBiomeGenerationSettingsForCarver` does.
 *
 * Java asks the biome source for the cell at `(minBlockX >> 2, 0, minBlockZ >> 2)`, which is
 * the cell that holds the chunk's own corner. It does not go through `BiomeManager`, so the
 * seeded jitter that moves a block's biome near an edge plays no part. Reading the jittered
 * biome at `(minBlockX, 0, minBlockZ)` instead picks a different cell for some chunks, and a
 * data pack whose neighboring biomes list different carvers then digs the wrong caves. It also
 * costs a fuzzy lookup for each of the 289 source chunks around every carved chunk.
 *
 * @param noiseBiome - The biome source's cells, before any jitter.
 * @param carversOf - The carvers one biome lists.
 */
export const carversFromNoiseBiome =
    (
        noiseBiome: BiomeResolver,
        carversOf: (biome: string) => readonly CarverConfig[]
    ): CarveChunkOptions['carversAt'] =>
    (sourceChunkX, sourceChunkZ) =>
        // A chunk is four cells wide, so its corner cell is `chunk * 16 >> 2`.
        carversOf(noiseBiome(sourceChunkX * 4, 0, sourceChunkZ * 4));

/**
 * Runs every carver of every chunk within eight chunks of the target chunk and records the
 * blocks they open inside it.
 *
 * A carver can start up to eight chunks away and still reach this one, so a chunk's caves are
 * decided by 289 independent draws rather than by its own. Each draw is seeded from the world
 * seed and the source chunk position, so the result does not depend on generation order.
 *
 * Carver paths cannot match Bedrock Edition for the same seed, because Bedrock's generator is
 * undocumented. They do match Java Edition exactly, and that is what the tests assert.
 */
export const carveChunk = (options: CarveChunkOptions): void => {
    const starts = options.starts ?? createCarverStarts(options.seed, options.carversAt);
    for (let dx = -8; dx <= 8; dx++) {
        for (let dz = -8; dz <= 8; dz++) {
            const sourceChunkX = options.chunkX + dx;
            const sourceChunkZ = options.chunkZ + dz;
            const plans =
                starts.plansAt?.(sourceChunkX, sourceChunkZ, options.context) ??
                recordPlans(
                    options.seed,
                    starts.at(sourceChunkX, sourceChunkZ),
                    options.context,
                    sourceChunkX,
                    sourceChunkZ
                );
            for (const plan of plans) plan.replay(options.chunkX, options.chunkZ, options.output);
        }
    }
};
