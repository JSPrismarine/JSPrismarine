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
import { mthCos, mthSin, randomBetween } from './trig';

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
}

/** Either carver type 26.3 registers. */
export type CarverConfig = CaveCarverConfig | CanyonCarverConfig;

const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(value)}`);
    }
    // A parsed JSON document is `unknown`; every field read below is checked.
    return value as Record<string, unknown>;
};

const number = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${path}: expected a finite number, got ${JSON.stringify(value)}`);
    }
    return value;
};

const optionalFloatProvider = (value: unknown, path: string, fallback: number): FloatProvider =>
    value === undefined ? { type: 'constant', value: f32(fallback) } : parseFloatProvider(value, path);

/**
 * Reads one `worldgen/carver` document.
 *
 * 26.3 flattened the `config` object the older schema wrapped these fields in, so a loader
 * written against 1.21 data does not read this.
 *
 * @throws When the type is unknown or a field is missing.
 */
export const parseCarver = (source: unknown, path = '<carver>'): CarverConfig => {
    const raw = asObject(source, path);
    const type = typeName(raw['type']);
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
            floorLevel: parseFloatProvider(raw['floor_level'], `${path}.floor_level`)
        };
    }
    if (type === 'canyon') {
        const shape = asObject(raw['shape'], `${path}.shape`);
        const smoothness = shape['width_smoothness'];
        if (typeof smoothness !== 'number' || !Number.isInteger(smoothness) || smoothness <= 0) {
            throw new TypeError(`${path}.shape.width_smoothness: expected a positive integer`);
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
            }
        };
    }
    throw new TypeError(`${path}: unknown carver type ${JSON.stringify(raw['type'])}`);
};

/** Whether a position inside the ellipsoid stays solid. */
type SkipChecker = (xd: number, yd: number, zd: number, y: number) => boolean;

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

const createTunnel = (
    config: CaveCarverConfig,
    chunkX: number,
    chunkZ: number,
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
    output: CarverOutput,
    skip: SkipChecker
): void => {
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
        const horizontalRadius = 1.5 + f32(mthSin(f32(f32(f32(Math.PI) * currentStep) / dist)) * thickness);
        const verticalRadius = horizontalRadius * yScale;
        const cosX = mthCos(verticalRotation);
        x += f32(mthCos(horizontalRotation) * cosX);
        y += mthSin(verticalRotation);
        z += f32(mthSin(horizontalRotation) * cosX);
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
                chunkX,
                chunkZ,
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
                output,
                skip
            );
            createTunnel(
                config,
                chunkX,
                chunkZ,
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
                output,
                skip
            );
            return;
        }

        if (random.nextIntBounded(4) === 0) continue;
        if (!canReach(chunkX, chunkZ, x, z, currentStep, dist, thickness)) return;
        carveEllipsoid(
            chunkX,
            chunkZ,
            x,
            y,
            z,
            horizontalRadius * horizontalRadiusMultiplier,
            verticalRadius * verticalRadiusMultiplier,
            output,
            skip
        );
    }
};

const carveCave = (
    config: CaveCarverConfig,
    context: WorldGenerationContext,
    random: RandomSource,
    chunkX: number,
    chunkZ: number,
    sourceChunkX: number,
    sourceChunkZ: number,
    output: CarverOutput
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
        const skip: SkipChecker = (xd, yd, zd) => caveSkip(xd, yd, zd, floorLevel);

        let tunnels = 1;
        if (random.nextIntBounded(4) === 0) {
            const yScale = sampleFloat(config.roomVerticalRadiusMultiplier, random);
            const roomThickness = f32(1 + f32(random.nextFloat() * 6));
            const horizontalRadius = 1.5 + f32(mthSin(f32(Math.PI / 2)) * roomThickness);
            carveEllipsoid(chunkX, chunkZ, x + 1, y, z, horizontalRadius, horizontalRadius * yScale, output, skip);
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
                chunkX,
                chunkZ,
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
                output,
                skip
            );
        }
    }
};

const carveCanyon = (
    config: CanyonCarverConfig,
    context: WorldGenerationContext,
    random: RandomSource,
    chunkX: number,
    chunkZ: number,
    sourceChunkX: number,
    sourceChunkZ: number,
    output: CarverOutput
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

    const skip: SkipChecker = (xd, yd, zd, y) =>
        (xd * xd + zd * zd) * (widthFactorPerHeight[y - context.minGenY - 1] as number) + (yd * yd) / 6 >= 1;

    let x = startX;
    let y = startY;
    let z = startZ;
    let horizontalRotation = startHorizontalRotation;
    let verticalRotation = startVerticalRotation;
    let yRota = 0;
    let xRota = 0;

    for (let currentStep = 0; currentStep < distance; currentStep++) {
        let horizontalRadius = 1.5 + f32(mthSin(f32(f32(currentStep * f32(Math.PI)) / distance)) * thickness);
        let verticalRadius = horizontalRadius * yScale;
        horizontalRadius *= sampleFloat(config.shape.horizontalRadiusFactor, tunnelRandom);

        const verticalMultiplier = f32(1 - f32(Math.abs(f32(0.5 - f32(currentStep / distance))) * 2));
        const factor = f32(
            config.shape.verticalRadiusDefaultFactor + f32(config.shape.verticalRadiusCenterFactor * verticalMultiplier)
        );
        verticalRadius = factor * verticalRadius * randomBetween(tunnelRandom.nextFloat(), f32(0.75), 1);

        const cosX = mthCos(verticalRotation);
        const sinX = mthSin(verticalRotation);
        x += f32(mthCos(horizontalRotation) * cosX);
        y += sinX;
        z += f32(mthSin(horizontalRotation) * cosX);
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
        if (!canReach(chunkX, chunkZ, x, z, currentStep, distance, thickness)) return;
        carveEllipsoid(chunkX, chunkZ, x, y, z, horizontalRadius, verticalRadius, output, skip);
    }
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
}

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
    for (let dx = -8; dx <= 8; dx++) {
        for (let dz = -8; dz <= 8; dz++) {
            const sourceChunkX = options.chunkX + dx;
            const sourceChunkZ = options.chunkZ + dz;
            const carvers = options.carversAt(sourceChunkX, sourceChunkZ);
            for (let index = 0; index < carvers.length; index++) {
                const config = carvers[index] as CarverConfig;
                const random = largeFeatureRandom(asLong(options.seed + BigInt(index)), sourceChunkX, sourceChunkZ);
                if (!isStartChunk(config, random)) continue;
                if (config.type === 'cave') {
                    carveCave(
                        config,
                        options.context,
                        random,
                        options.chunkX,
                        options.chunkZ,
                        sourceChunkX,
                        sourceChunkZ,
                        options.output
                    );
                } else {
                    carveCanyon(
                        config,
                        options.context,
                        random,
                        options.chunkX,
                        options.chunkZ,
                        sourceChunkX,
                        sourceChunkZ,
                        options.output
                    );
                }
            }
        }
    }
};
