import type { DensityFunctionNode } from '../density/DensityFunction';
import { quantizeClimateCoord } from '../biome/Climate';
import type { SpawnTargetPoint } from '../settings/NoiseGeneratorSettings';

/** The climate-selected origin block and number of candidate positions Java evaluated. */
export interface NoiseSpawnPosition {
    readonly x: number;
    readonly y: 0;
    readonly z: number;
    readonly candidates: number;
}

/** A seeded density function sampled at one block position. */
export type SpawnDensitySampler = (node: DensityFunctionNode, x: number, y: number, z: number) => number;

const parameterDistance = (min: number, max: number, target: number): number => {
    const above = target - max;
    const below = min - target;
    return above > 0 ? above : Math.max(below, 0);
};

const fitnessAt = (targets: readonly SpawnTargetPoint[], sample: SpawnDensitySampler, x: number, z: number): bigint => {
    const quartX = Math.floor(x / 4) * 4;
    const quartZ = Math.floor(z / 4) * 4;
    let best = Number.POSITIVE_INFINITY;

    for (const target of targets) {
        let fitness = 0;
        for (const entry of target) {
            const coordinate = quantizeClimateCoord(sample(entry.density, quartX, 0, quartZ));
            const distance = parameterDistance(entry.parameter.min, entry.parameter.max, coordinate);
            fitness += distance * distance;
        }
        best = Math.min(best, fitness);
    }

    // Java combines climate fitness and distance in a signed long. The climate term can exceed
    // Number's exact integer range even though each quantized axis and its squared distance do not.
    return BigInt(best) * 2048n ** 2n + BigInt(x) * BigInt(x) + BigInt(z) * BigInt(z);
};

/**
 * Ports Java 26.3's `NoiseSpawnFinder`, including its coarse-to-fine spiral order and strict
 * tie handling. A caller with no spawn targets must use the generator's base origin instead.
 */
export const findNoiseSpawnPosition = (
    targets: readonly SpawnTargetPoint[],
    sample: SpawnDensitySampler
): NoiseSpawnPosition => {
    if (targets.length === 0) return { x: 0, y: 0, z: 0, candidates: 0 };

    let x = 0;
    let z = 0;
    let fitness = fitnessAt(targets, sample, x, z);
    let candidates = 1;

    const radialSearch = (maxRadius: number, step: number): void => {
        let angle = 0;
        let radius = step;
        // Java captures the best position once per radial search and offsets every candidate from it.
        const anchorX = x;
        const anchorZ = z;
        while (radius <= maxRadius) {
            const candidateX = anchorX + Math.trunc(Math.sin(angle) * radius);
            const candidateZ = anchorZ + Math.trunc(Math.cos(angle) * radius);
            const candidateFitness = fitnessAt(targets, sample, candidateX, candidateZ);
            candidates++;
            if (candidateFitness < fitness) {
                x = candidateX;
                z = candidateZ;
                fitness = candidateFitness;
            }
            angle = Math.fround(angle + Math.fround(step / radius));
            if (angle > Math.PI * 2) {
                angle = 0;
                radius = Math.fround(radius + step);
            }
        }
    };

    radialSearch(2048, 512);
    radialSearch(512, 32);
    return { x, y: 0, z, candidates };
};
