import type { RandomSource } from '@jsprismarine/worldgen';

import { asInteger, asNumber } from '../json';
import { ALL_DIRECTIONS } from '../world/BlockState';
import type { BlockPos, FeatureWorld } from '../world/FeatureWorld';
import type { ConfiguredFeature } from './Feature';
import { feature } from './Feature';
import type { BlockReplacement } from './ruleTest';
import { parseBlockReplacements } from './ruleTest';
import { mthSin, outsideBuildHeight, relative } from './support';

const f32 = Math.fround;

/**
 * Decides whether an ore block may go here: the rule test has to match, and unless the air check
 * is skipped the position must not touch air.
 *
 * `discard_chance_on_air_exposure` is drawn once per candidate position, not once per vein, and
 * only when it is strictly between zero and one. That is why `ore_coal` at 0.5 costs one draw per
 * block and `ore_coal_upper` at 0 costs none.
 */
const canPlaceOre = (
    world: FeatureWorld,
    state: ReturnType<FeatureWorld['getBlock']>,
    position: BlockPos,
    random: RandomSource,
    replacement: BlockReplacement,
    discardChanceOnAirExposure: number,
    read: (position: BlockPos) => ReturnType<FeatureWorld['getBlock']>
): boolean => {
    if (!replacement.target(world.blocks, state, position, random)) return false;
    if (discardChanceOnAirExposure <= 0) return true;
    if (discardChanceOnAirExposure >= 1) return !isAdjacentToAir(world, position, read);
    return random.nextFloat() >= discardChanceOnAirExposure ? true : !isAdjacentToAir(world, position, read);
};

const isAdjacentToAir = (
    world: FeatureWorld,
    position: BlockPos,
    read: (position: BlockPos) => ReturnType<FeatureWorld['getBlock']>
): boolean => {
    for (const direction of ALL_DIRECTIONS) {
        if (world.blocks.isAir(read(relative(position, direction)))) return true;
    }
    return false;
};

/**
 * The vein-shaped ore, Java's `OreFeature`.
 *
 * It draws a line through the origin at a random horizontal angle, hangs `size` spheres along it
 * with radii that swell toward the middle, discards spheres swallowed by their neighbors, and
 * fills the union. The distinctive part is that the discard pass runs before any block is
 * written, so the vein's shape is decided entirely by `size` and four draws.
 */
export const ore = (
    targets: readonly BlockReplacement[],
    size: number,
    discardChanceOnAirExposure: number
): ConfiguredFeature =>
    feature('ore', (world, random, origin) => {
        const angle = f32(random.nextFloat() * Math.PI);
        const spreadXZ = f32(size / 8);
        const maxRadius = Math.ceil(f32(f32(f32(size / 16) * 2) + 1) / 2);
        const x0 = origin.x + Math.sin(angle) * spreadXZ;
        const x1 = origin.x - Math.sin(angle) * spreadXZ;
        const z0 = origin.z + Math.cos(angle) * spreadXZ;
        const z1 = origin.z - Math.cos(angle) * spreadXZ;
        const y0 = origin.y + random.nextIntBounded(3) - 2;
        const y1 = origin.y + random.nextIntBounded(3) - 2;
        const xStart = origin.x - Math.ceil(spreadXZ) - maxRadius;
        const yStart = origin.y - 2 - maxRadius;
        const zStart = origin.z - Math.ceil(spreadXZ) - maxRadius;
        // Java's own comment calls this the bounding box of the whole vein.
        const sizeXZ = 2 * (Math.ceil(spreadXZ) + maxRadius);
        const sizeY = 2 * (2 + maxRadius);

        let anyColumnReachable = false;
        for (let x = xStart; x <= xStart + sizeXZ && !anyColumnReachable; x++) {
            for (let z = zStart; z <= zStart + sizeXZ; z++) {
                if (yStart <= world.getHeight('OCEAN_FLOOR_WG', x, z)) {
                    anyColumnReachable = true;
                    break;
                }
            }
        }
        if (!anyColumnReachable) return false;

        const spheres = new Float64Array(size * 4);
        for (let index = 0; index < size; index++) {
            const step = f32(index / size);
            const scale = (random.nextDouble() * size) / 16;
            const radius = (f32(mthSin(f32(Math.PI) * step) + 1) * scale + 1) / 2;
            spheres[index * 4 + 0] = x0 + (x1 - x0) * step;
            spheres[index * 4 + 1] = y0 + (y1 - y0) * step;
            spheres[index * 4 + 2] = z0 + (z1 - z0) * step;
            spheres[index * 4 + 3] = radius;
        }

        for (let first = 0; first < size - 1; first++) {
            if ((spheres[first * 4 + 3] ?? 0) <= 0) continue;
            for (let second = first + 1; second < size; second++) {
                if ((spheres[second * 4 + 3] ?? 0) <= 0) continue;
                const dx = (spheres[first * 4 + 0] ?? 0) - (spheres[second * 4 + 0] ?? 0);
                const dy = (spheres[first * 4 + 1] ?? 0) - (spheres[second * 4 + 1] ?? 0);
                const dz = (spheres[first * 4 + 2] ?? 0) - (spheres[second * 4 + 2] ?? 0);
                const dr = (spheres[first * 4 + 3] ?? 0) - (spheres[second * 4 + 3] ?? 0);
                if (dr * dr <= dx * dx + dy * dy + dz * dz) continue;
                if (dr > 0) spheres[second * 4 + 3] = -1;
                else spheres[first * 4 + 3] = -1;
            }
        }

        const tested = new Set<number>();
        const read = (position: BlockPos) => world.getBlock(position);
        let placed = 0;

        for (let index = 0; index < size; index++) {
            const radius = spheres[index * 4 + 3] ?? -1;
            if (radius < 0) continue;
            const centerX = spheres[index * 4 + 0] ?? 0;
            const centerY = spheres[index * 4 + 1] ?? 0;
            const centerZ = spheres[index * 4 + 2] ?? 0;
            const minX = Math.max(Math.floor(centerX - radius), xStart);
            const minY = Math.max(Math.floor(centerY - radius), yStart);
            const minZ = Math.max(Math.floor(centerZ - radius), zStart);
            const maxX = Math.max(Math.floor(centerX + radius), minX);
            const maxY = Math.max(Math.floor(centerY + radius), minY);
            const maxZ = Math.max(Math.floor(centerZ + radius), minZ);

            for (let x = minX; x <= maxX; x++) {
                const xd = (x + 0.5 - centerX) / radius;
                if (xd * xd >= 1) continue;
                for (let y = minY; y <= maxY; y++) {
                    const yd = (y + 0.5 - centerY) / radius;
                    if (xd * xd + yd * yd >= 1) continue;
                    for (let z = minZ; z <= maxZ; z++) {
                        const zd = (z + 0.5 - centerZ) / radius;
                        if (xd * xd + yd * yd + zd * zd >= 1) continue;
                        if (outsideBuildHeight(world, y)) continue;

                        const key = x - xStart + (y - yStart) * sizeXZ + (z - zStart) * sizeXZ * sizeY;
                        if (tested.has(key)) continue;
                        tested.add(key);

                        const position = { x, y, z };
                        const existing = world.getBlock(position);
                        for (const target of targets) {
                            if (
                                !canPlaceOre(
                                    world,
                                    existing,
                                    position,
                                    random,
                                    target,
                                    discardChanceOnAirExposure,
                                    read
                                )
                            ) {
                                continue;
                            }
                            world.setBlock(position, target.state);
                            placed++;
                            break;
                        }
                    }
                }
            }
        }

        return placed > 0;
    });

/**
 * The loose ore, Java's `ScatteredOreFeature`.
 *
 * It makes up to `size` independent attempts, each at a position drawn from a difference of two
 * floats so the spread is triangular rather than uniform, and each capped at seven blocks from
 * the origin. Copper in the dripstone caves is the only vanilla user.
 */
export const scatteredOre = (
    targets: readonly BlockReplacement[],
    size: number,
    discardChanceOnAirExposure: number
): ConfiguredFeature =>
    feature('scattered_ore', (world, random, origin) => {
        const tries = random.nextIntBounded(size + 1);
        const read = (position: BlockPos) => world.getBlock(position);

        for (let attempt = 0; attempt < tries; attempt++) {
            const spread = Math.min(attempt, 7);
            const axis = () => Math.round(f32(random.nextFloat() - random.nextFloat()) * spread);
            const position = { x: origin.x + axis(), y: origin.y + axis(), z: origin.z + axis() };
            const existing = world.getBlock(position);
            for (const target of targets) {
                if (!canPlaceOre(world, existing, position, random, target, discardChanceOnAirExposure, read)) continue;
                world.setBlock(position, target.state);
                break;
            }
        }
        return true;
    });

/** Reads the two ore feature types, which share a configuration shape. */
export const parseOreFeature = (
    type: string,
    raw: Record<string, unknown>,
    path: string
): ConfiguredFeature | undefined => {
    if (type !== 'ore' && type !== 'scattered_ore') return undefined;
    const targets = parseBlockReplacements(raw['targets'], `${path}.targets`);
    const size = asInteger(raw['size'], `${path}.size`);
    const discard = asNumber(raw['discard_chance_on_air_exposure'], `${path}.discard_chance_on_air_exposure`, 0);
    return type === 'ore' ? ore(targets, size, discard) : scatteredOre(targets, size, discard);
};
