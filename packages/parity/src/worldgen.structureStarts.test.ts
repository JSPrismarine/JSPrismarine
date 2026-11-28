import { DataDrivenGenerator } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { beforeAll, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarioScope, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { openGeneration } from './generation/capture.ts';
import type { StructureChunk } from './javaStructureStarts.ts';
import { JAVA_STRUCTURE_SCENARIOS, loadJavaStructureStarts } from './javaStructureStarts.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Where the generator starts structures, against where Java starts them for the same seed.
 *
 * The reference is Java's own `/locate structure` answers, captured from the pinned dedicated
 * server by `scripts/capture-java-structure-starts.ts`. Each start Java reported is a row that
 * passes when this server starts the same structure in the same chunk, and each chunk Java
 * reported empty is a row that passes when this server starts nothing of that structure there.
 *
 * The rows are what the structure set rules answer to: which chunks a placement offers, the
 * frequency rules that thin them, the exclusion zone that keeps pillager outposts away from
 * villages, and the order a set tries its structures in when the first one cannot start.
 * `worldgen.generation` compares the generator with its own past output; this compares it with
 * Java.
 */

/** Laying out three thousand starts touches no chunk, but reads the noise terrain under each. */
const TIMEOUT = 1_800_000;

/** How far, in chunks, Java's stronghold biome search reaches from a ring position: 112 blocks. */
const RING_SEARCH_CHUNKS = 7;

/**
 * Why a stronghold can land a few chunks from Java's.
 *
 * Java moves each ring position to a cell its biome search picks by a reservoir draw, and a cell
 * whose climate sits exactly as far from two biomes resolves through the climate tree's
 * `lastResult`, a `ThreadLocal`. The 128 searches run in parallel on Java's background threads,
 * so which biome such a cell reads depends on which searches ran on that thread before it.
 * The server resolves those ties by tree order, which `ClimateParameterList` documents.
 */
const RING_TIE = {
    kind: 'intentional',
    reason: "Java's stronghold biome search reads an exactly tied climate cell through a thread-local last result, which depends on the order its background threads ran the 128 searches; the server breaks the tie by climate tree order.",
    reference: 'ChunkGeneratorStructureState.generateRingPositions; Climate$RTree.lastResult'
} as const;

const idOf = (chunk: StructureChunk): string => `${chunk.structure}@${chunk.chunkX},${chunk.chunkZ}`;

describeFamily(
    FAMILIES.worldgenStructures,
    [REFERENCES.javaStructureStarts, REFERENCES.javaWorldgenData, REFERENCES.javaServerJar],
    () => {
        const capture = loadJavaStructureStarts();
        const seed = BigInt(capture.provenance.seed);
        let generator: DataDrivenGenerator;
        /** The rows whose chunk the server starts the structure in, laid out once before the row runs. */
        const started = new Set<string>();
        /** The stronghold rows that differ only by a tied ring search. */
        const tied = new Set<string>();

        beforeAll(() => {
            const environment = openGeneration();
            if (environment === undefined) throw new Error('No Java world generation data in this checkout');
            generator = new DataDrivenGenerator({
                registries: environment.registries,
                templates: environment.templates
            });
            for (const chunk of [...capture.starts, ...capture.absent]) {
                if (startsHere(chunk)) started.add(idOf(chunk));
                if (tiedRing(chunk)) tied.add(idOf(chunk));
            }
        }, TIMEOUT);

        const startsHere = (chunk: StructureChunk): boolean =>
            generator
                .structureStartsAt(chunk.chunkX, chunk.chunkZ, seed)
                .some(
                    (start) =>
                        start.structure === chunk.structure &&
                        start.chunkX === chunk.chunkX &&
                        start.chunkZ === chunk.chunkZ
                );

        /**
         * Whether a stronghold row differs only where the biome search moved the ring position: the
         * server's stronghold for the ring is within the same search square as Java's.
         */
        const tiedRing = (chunk: StructureChunk): boolean => {
            if (chunk.structure !== 'minecraft:stronghold') return false;
            const ours = generator.locate({
                x: chunk.chunkX * 16,
                z: chunk.chunkZ * 16,
                radius: 0,
                seed,
                wanted: (structure) => structure === chunk.structure
            });
            const start = ours?.startChunk;
            return (
                start !== undefined &&
                (start.x !== chunk.chunkX || start.z !== chunk.chunkZ) &&
                Math.max(Math.abs(start.x - chunk.chunkX), Math.abs(start.z - chunk.chunkZ)) <= 2 * RING_SEARCH_CHUNKS
            );
        };

        const starts: BehaviorScenario<StructureChunk> = {
            name: JAVA_STRUCTURE_SCENARIOS.starts,
            java: `Java starts the structure in this chunk for seed ${capture.provenance.seed}.`,
            reference: `Java ${capture.provenance.version} /locate structure, ${capture.provenance.source}`,
            subjects: () => capture.starts,
            idOf,
            // A start evidences the structure set's placement, not the structure's own behavior.
            covers: () => undefined,
            run: (chunk) => (started.has(idOf(chunk)) ? undefined : 'the server starts no such structure in the chunk'),
            classify: (chunk) => (tied.has(idOf(chunk)) ? RING_TIE : undefined)
        };

        const absent: BehaviorScenario<StructureChunk> = {
            name: JAVA_STRUCTURE_SCENARIOS.absent,
            java: `Java starts no such structure in this chunk for seed ${capture.provenance.seed}, though the set's placement offers it.`,
            reference: `Java ${capture.provenance.version} /locate structure, ${capture.provenance.source}`,
            subjects: () => capture.absent,
            idOf,
            covers: () => undefined,
            run: (chunk) => (started.has(idOf(chunk)) ? 'the server starts the structure in the chunk' : undefined),
            classify: (chunk) => (tied.has(idOf(chunk)) ? RING_TIE : undefined)
        };

        it('starts the structures Java starts, and none where Java starts none', () => {
            measureScenarioScope(
                FAMILIES.worldgenStructures,
                import.meta.filename,
                new Set(Object.values(JAVA_STRUCTURE_SCENARIOS)),
                [scenarioGroup([starts, absent])]
            );
        });
    },
    { tags: ['real-data'] }
);
