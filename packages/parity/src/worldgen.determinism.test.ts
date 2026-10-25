import { DataDrivenGenerator } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { beforeAll, describe, expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { GenerationEnvironment } from './generation/capture.ts';
import { captureChunk, openGeneration } from './generation/capture.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Three properties the chunk generation rewrite needs, measured on the generator it replaces.
 *
 * The rewrite runs the chunk status ladder across worker threads, which means a chunk may be
 * generated in any order, in a batch of any size, beside any set of neighbors. That is only
 * safe if a chunk is a function of the seed and its coordinates. The three properties here say
 * whether it is:
 *
 * 1. **Repeatable.** The same chunk, generated twice from scratch, is the same chunk.
 * 2. **Order independent.** A chunk generated after its neighbors is the chunk it would have
 *    been generated first.
 * 3. **Stable once handed out.** A chunk already returned does not change when a neighbor is
 *    generated afterwards.
 *
 * All three hold. Only the first did until the chunk status ladder landed: the generator kept a
 * per-seed cache of neighbor terrain and of the feature output that spilled across chunk borders,
 * and replayed that output into terrain it built later and into chunks it had already returned.
 * Both gaps were allow-listed as defects, and the allow list fails on an entry that has stopped
 * gapping, so the row went red on the change that fixed them and the entries went with it.
 *
 * Gap ids, if either ever comes back: `order-dependent:<seed>/<x>,<z>` and
 * `mutates-after-handoff:<seed>/<x>,<z>`.
 */

/** Each subject is generated ten times over, and a decorated chunk is seconds. */
const DETERMINISM_TIMEOUT = 1_800_000;

/**
 * The chunks the properties are measured on, and why it takes two.
 *
 * Deep ocean at the world origin is the cheap one and it is a weak witness on its own. The
 * merge order only decides anything where two of a chunk's eight neighbors write the same
 * block, and an ocean chunk has almost no feature writes to collide. Measured: a merge that
 * applies the inbound patches in the order the neighbors finished rather than in position order
 * leaves this chunk's digest exactly where it was.
 *
 * The forest chunk is the one that catches it. It is the corpus's tall decorated chunk, oak and
 * birch over a surface near y 126, where trees and underground blobs reach in from every side.
 */
const SUBJECTS = [
    { seed: 1234, chunkX: 0, chunkZ: 0, why: 'deep ocean at the world origin' },
    { seed: 987_654_321, chunkX: -96, chunkZ: 48, why: 'oak and birch forest over a surface near y 126' }
] as const;

/** The four chunks whose decoration can write across a subject's border. */
const NEIGHBORS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
] as const;

const environment = openGeneration();

const fresh = (where: GenerationEnvironment): DataDrivenGenerator =>
    new DataDrivenGenerator({ registries: where.registries, templates: where.templates });

/** What one subject's four generations produced, as digests over its block state names. */
interface Readings {
    alone: string;
    repeated: string;
    afterNeighbors: string;
    afterHandoff: string;
}

const readingsFor = async (subject: (typeof SUBJECTS)[number]): Promise<Readings> => {
    const { seed, chunkX, chunkZ } = subject;
    const digest = (chunk: Parameters<typeof captureChunk>[1]): string =>
        captureChunk({ id: 'subject', tier: 'full', why: subject.why, seed, chunkX, chunkZ }, chunk).digest.digests
            .blocks;

    const first = fresh(environment!);
    const chunk = await first.generateChunk(chunkX, chunkZ, seed);
    const alone = digest(chunk);
    const repeated = digest(await fresh(environment!).generateChunk(chunkX, chunkZ, seed));

    const later = fresh(environment!);
    for (const [x, z] of NEIGHBORS) await later.generateChunk(chunkX + x, chunkZ + z, seed);
    const afterNeighbors = digest(await later.generateChunk(chunkX, chunkZ, seed));

    // The same object the first generator handed back, read again now that its four neighbors
    // have been generated in the same generator.
    for (const [x, z] of NEIGHBORS) await first.generateChunk(chunkX + x, chunkZ + z, seed);
    return { alone, repeated, afterNeighbors, afterHandoff: digest(chunk) };
};

describeFamily(FAMILIES.worldgenDeterminism, [REFERENCES.javaWorldgenData, REFERENCES.javaServerJar], () => {
    const readings = new Map<string, Readings>();

    beforeAll(async () => {
        for (const subject of SUBJECTS) {
            readings.set(`${subject.seed}/${subject.chunkX},${subject.chunkZ}`, await readingsFor(subject));
        }
    }, DETERMINISM_TIMEOUT);

    describe.each(SUBJECTS)('$seed/$chunkX,$chunkZ, $why', (subject) => {
        const at = `${subject.seed}/${subject.chunkX},${subject.chunkZ}`;

        it('gives the same chunk twice for the same seed and coordinates', () => {
            const found = readings.get(at)!;
            expect(found.repeated).toBe(found.alone);
        });

        it('reports every order and batching dependence the allow list knows about', () => {
            const found = readings.get(at)!;
            const gaps: string[] = [];
            if (found.afterNeighbors !== found.alone) gaps.push(`order-dependent:${at}`);
            if (found.afterHandoff !== found.alone) gaps.push(`mutates-after-handoff:${at}`);

            const verdict = checkAllowList(FAMILIES.worldgenDeterminism, gaps);
            expect(
                verdict.unexpected,
                `generated alone ${found.alone}, after its neighbors ${found.afterNeighbors}, ` +
                    `read again after its neighbors ${found.afterHandoff}`
            ).toEqual([]);
            expect(verdict.stale).toEqual([]);
        });
    });
});
