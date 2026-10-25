import { DataDrivenGenerator } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { beforeAll, expect, it } from 'vitest';

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
 * Only the first holds today. The generator keeps a per-seed cache of neighbor terrain and of
 * the feature output that spilled across chunk borders, and replays that output into terrain it
 * builds later and into chunks it has already returned, so the second and third fail. Both are
 * allow-listed as defects with the measurement in the reason, because the rewrite has to fix
 * them rather than reproduce them, and because the corpus goldens can only be captured under a
 * protocol that avoids them.
 *
 * Gap ids: `order-dependent:<seed>/<x>,<z>` and `mutates-after-handoff:<seed>/<x>,<z>`.
 */

/** Generating this chunk five times over takes minutes. */
const DETERMINISM_TIMEOUT = 1_800_000;

/**
 * The chunk the properties are measured on.
 *
 * One chunk, because each property costs several full generations and the question is whether
 * the generator has the property at all, not how often it loses it.
 */
const SUBJECT = { seed: 1234, chunkX: 0, chunkZ: 0 } as const;

/** The four chunks whose decoration can write across the subject's border. */
const NEIGHBORS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
] as const;

const environment = openGeneration();

const fresh = (where: GenerationEnvironment): DataDrivenGenerator =>
    new DataDrivenGenerator({ registries: where.registries, templates: where.templates });

const digest = (chunk: Parameters<typeof captureChunk>[1]): string =>
    captureChunk({ id: 'subject', tier: 'full', why: 'determinism', ...SUBJECT }, chunk).digest.digests.blocks;

const at = `${SUBJECT.seed}/${SUBJECT.chunkX},${SUBJECT.chunkZ}`;

describeFamily(FAMILIES.worldgenDeterminism, [REFERENCES.javaWorldgenData, REFERENCES.javaServerJar], () => {
    let alone = '';
    let repeated = '';
    let afterNeighbors = '';
    let afterHandoff = '';

    beforeAll(async () => {
        const first = fresh(environment!);
        const chunk = await first.generateChunk(SUBJECT.chunkX, SUBJECT.chunkZ, SUBJECT.seed);
        alone = digest(chunk);

        repeated = digest(await fresh(environment!).generateChunk(SUBJECT.chunkX, SUBJECT.chunkZ, SUBJECT.seed));

        const later = fresh(environment!);
        for (const [x, z] of NEIGHBORS) await later.generateChunk(x, z, SUBJECT.seed);
        afterNeighbors = digest(await later.generateChunk(SUBJECT.chunkX, SUBJECT.chunkZ, SUBJECT.seed));

        // The same object the first generator handed back, read again now that its four
        // neighbors have been generated in the same generator.
        for (const [x, z] of NEIGHBORS) await first.generateChunk(x, z, SUBJECT.seed);
        afterHandoff = digest(chunk);
    }, DETERMINISM_TIMEOUT);

    it('gives the same chunk twice for the same seed and coordinates', () => {
        expect(repeated).toBe(alone);
    });

    it('reports every order and batching dependence the allow list knows about', () => {
        const gaps: string[] = [];
        if (afterNeighbors !== alone) gaps.push(`order-dependent:${at}`);
        if (afterHandoff !== alone) gaps.push(`mutates-after-handoff:${at}`);

        const verdict = checkAllowList(FAMILIES.worldgenDeterminism, gaps);
        expect(
            verdict.unexpected,
            `generated alone ${alone}, after its neighbors ${afterNeighbors}, ` +
                `read again after its neighbors ${afterHandoff}`
        ).toEqual([]);
        expect(verdict.stale).toEqual([]);
    });
});
