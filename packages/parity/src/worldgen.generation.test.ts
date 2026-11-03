import { beforeAll, expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { CapturedCorpus } from './generation/capture.ts';
import { captureCorpus, openGeneration } from './generation/capture.ts';
import { diffCensus, diffChunks, diffStructures } from './generation/diff.ts';
import type { GenerationCorpusGolden } from './generation/golden.ts';
import { CORPUS_CHUNKS, STRUCTURE_SCAN_CHUNKS, WHOLE_CHUNKS } from './generation/plan.ts';
import { loadGenerationCorpus } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { parityCase, reportParityCases } from './trackerCases.ts';
import { chunkWorkerCount } from '@jsprismarine/prismarine/world/generators/chunkConcurrency';

/**
 * The generation corpus: three rows that regenerate the committed corpus and diff it.
 *
 * All three live in one file because they share one run of the generator. Vitest gives each
 * file its own worker, so splitting them would generate every chunk three times.
 *
 * What these rows claim, and what they do not: the reference data is a recording this server
 * made of its own output, so a green row says the generator produces what it produced when the
 * corpus was captured. It says nothing about Java Edition. `worldgen.terrain` is the row that
 * compares against Java, over the nine columns Java's oracle dumped, and the Bedrock reference
 * world of `REFERENCES.referenceWorld` is still what a comparison against Mojang's own feature
 * distribution waits on.
 *
 * That is worth having anyway, because the project is about to replace the generator. A
 * rewritten generator that reproduces this corpus changed no block, and one that does not is
 * told which chunk, which sixteen block band of y, and which block states moved.
 */

/** The whole corpus takes minutes to regenerate, and the first hook to run pays for all three. */
const CORPUS_TIMEOUT = 1_800_000;

const environment = openGeneration();

let running: Promise<CapturedCorpus> | undefined;

/** Regenerates the corpus once per worker, however many rows ask for it. */
const corpus = async (): Promise<CapturedCorpus> => {
    running ??= captureCorpus(environment!);
    return running;
};

let golden: GenerationCorpusGolden;
let captured: CapturedCorpus;

const prepare = async (): Promise<void> => {
    golden = loadGenerationCorpus();
    captured = await corpus();
};

const needs = [REFERENCES.generationCorpus, REFERENCES.javaWorldgenData, REFERENCES.javaServerJar];
const WORKER_COUNTS = [...new Set([1, Math.max(1, chunkWorkerCount())])];

describeFamily(
    FAMILIES.worldgenCorpus,
    needs,
    () => {
        beforeAll(prepare, CORPUS_TIMEOUT);

        it('regenerates every chunk the golden recorded, block for block', () => {
            const diff = diffChunks(golden, captured);
            const verdict = checkAllowList(FAMILIES.worldgenCorpus, diff.gaps);
            const unexpected = new Set(verdict.unexpected);
            const chunks = new Map([...golden.chunks, ...captured.chunks].map((chunk) => [chunk.id, chunk]));
            reportParityCases(
                FAMILIES.worldgenCorpus,
                import.meta.filename,
                [...chunks.keys()].map((id) =>
                    parityCase(
                        `chunk:${id}`,
                        id,
                        'Generated Java worldgen corpus chunk',
                        ![...unexpected].some((gap) => gap.endsWith(`:${id}`))
                    )
                )
            );

            expect(verdict.unexpected, diff.detail.join('\n')).toEqual([]);
        });

        it('carries no stale allow-list entry', () => {
            expect(checkAllowList(FAMILIES.worldgenCorpus, diffChunks(golden, captured).gaps).stale).toEqual([]);
        });

        it('covers the whole column of every chunk the plan declares', () => {
            expect(captured.chunks).toHaveLength(CORPUS_CHUNKS.length);
            expect(captured.samples).toHaveLength(WHOLE_CHUNKS.length);
            // One digest per 16 block section, so a divergence is located in y rather than reported
            // against the whole chunk.
            const sections = golden.dimension.height / 16;
            for (const chunk of captured.chunks) expect(chunk.digests.sections, chunk.id).toHaveLength(sections);
        });

        it('was captured against the Java data this checkout pins', () => {
            // `loadGenerationCorpus` throws on a mismatch, so reaching here is the assertion. The
            // commit is checked for shape only: what it is worth is that it is written down.
            expect(golden.provenance.commit).toMatch(/^[0-9a-f]{40}$/);
            expect(golden.provenance.protocol).not.toBe('');
        });

        it(
            'keeps corpus chunks and structure placements stable across worker counts',
            async () => {
                const generated = await Promise.all(
                    WORKER_COUNTS.map((workers) => captureCorpus(environment!, undefined, workers))
                );
                const baseline = generated[0];
                if (baseline === undefined) throw new Error('No worker counts configured for the corpus');

                // Master already has a worker-only block-entity difference for this corpus chunk;
                // compare worker counts to each other until that unrelated baseline defect is fixed.
                for (const result of generated.slice(1)) {
                    expect(result.chunks).toEqual(baseline.chunks);
                    expect(result.structures).toEqual(baseline.structures);
                }
            },
            CORPUS_TIMEOUT
        );
    },
    { tags: ['real-data'] }
);

describeFamily(
    FAMILIES.worldgenFeatures,
    needs,
    () => {
        beforeAll(prepare, CORPUS_TIMEOUT);

        it('places the same blocks the decoration pass placed when the corpus was captured', () => {
            const diff = diffCensus(golden, captured);
            const verdict = checkAllowList(FAMILIES.worldgenFeatures, diff.gaps);
            const unexpected = new Set(verdict.unexpected);
            const totals = new Set<string>(Object.keys(golden.blockCounts));
            const decorated = captured.chunks.filter((chunk) => chunk.tier === 'full');
            for (const chunk of decorated) for (const state of Object.keys(chunk.census)) totals.add(state);
            reportParityCases(FAMILIES.worldgenFeatures, import.meta.filename, [
                ...[...totals].map((state) =>
                    parityCase(
                        `block-count:${state}`,
                        state,
                        'Java worldgen decorated block count',
                        !unexpected.has(`block-count:${state}`)
                    )
                ),
                ...decorated.map((chunk) =>
                    parityCase(
                        `chunk-census:${chunk.id}`,
                        chunk.id,
                        'Java worldgen decorated chunk block census',
                        !unexpected.has(`census:${chunk.id}`)
                    )
                )
            ]);

            expect(verdict.unexpected, diff.detail.join('\n')).toEqual([]);
        });

        it('carries no stale allow-list entry', () => {
            expect(checkAllowList(FAMILIES.worldgenFeatures, diffCensus(golden, captured).gaps).stale).toEqual([]);
        });

        it('counts a decorated chunk over more block states than the terrain pass alone produces', () => {
            const decorated = captured.chunks.filter((chunk) => chunk.tier === 'full');
            const terrain = captured.chunks.filter((chunk) => chunk.tier === 'terrain');

            expect(decorated.length).toBe(CORPUS_CHUNKS.filter((entry) => entry.tier === 'full').length);
            const richestTerrain = Math.max(...terrain.map((chunk) => Object.keys(chunk.census).length));
            const poorestDecorated = Math.min(...decorated.map((chunk) => Object.keys(chunk.census).length));
            expect(poorestDecorated).toBeGreaterThan(richestTerrain);
        });
    },
    { tags: ['real-data'] }
);

describeFamily(
    FAMILIES.worldgenStructures,
    needs,
    () => {
        beforeAll(prepare, CORPUS_TIMEOUT);

        it('starts every structure the golden recorded, in the same chunk and the same box', () => {
            const diff = diffStructures(golden, captured);
            const verdict = checkAllowList(FAMILIES.worldgenStructures, diff.gaps);
            const unexpected = new Set(verdict.unexpected);
            const placements = new Map(
                [...golden.structures, ...captured.structures].map((placement) => [
                    `${placement.seed}/${placement.structure}@${placement.chunkX},${placement.chunkZ}`,
                    placement
                ])
            );
            const structureTypes = new Set([
                ...golden.unbuiltStructureTypes,
                ...captured.unbuiltStructureTypes,
                ...golden.structures.map((placement) => placement.structure),
                ...captured.structures.map((placement) => placement.structure)
            ]);
            reportParityCases(FAMILIES.worldgenStructures, import.meta.filename, [
                ...[...placements.keys()].map((key) =>
                    parityCase(
                        `placement:${key}`,
                        key,
                        'Java worldgen structure placement and bounding box',
                        ![...unexpected].some(
                            (gap) =>
                                gap.endsWith(`:${key}`) &&
                                (gap.startsWith('structure-gone:') ||
                                    gap.startsWith('structure-new:') ||
                                    gap.startsWith('structure-box:'))
                        )
                    )
                ),
                ...[...structureTypes].map((type) =>
                    parityCase(
                        `structure-type:${type}`,
                        type,
                        'Structure builder availability',
                        !unexpected.has(`unbuilt-structure-type:${type}`)
                    )
                )
            ]);

            expect(verdict.unexpected, diff.detail.join('\n')).toEqual([]);
        });

        it('carries no stale allow-list entry', () => {
            expect(checkAllowList(FAMILIES.worldgenStructures, diffStructures(golden, captured).gaps).stale).toEqual(
                []
            );
        });

        it('scans the chunks the plan declares and builds every structure type it finds', () => {
            const structureTypes = new Set(captured.structures.map((placement) => placement.structure));

            reportParityProgress(FAMILIES.worldgenStructures, {
                scannedChunks: STRUCTURE_SCAN_CHUNKS,
                structurePlacements: captured.structures.length,
                structureTypes: structureTypes.size
            });
            expect(captured.structures.length).toBe(golden.structures.length);
            // A type with no builder places nothing, so an empty list is what a green row means.
            expect(captured.unbuiltStructureTypes).toEqual([]);
        });
    },
    { tags: ['real-data'] }
);
